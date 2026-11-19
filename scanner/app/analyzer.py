from __future__ import annotations

import asyncio
from contextlib import suppress
import hashlib
import json
import logging
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, Protocol, Tuple
from zoneinfo import ZoneInfo

try:
    from telethon.errors import (
        ChannelPrivateError,
        ChatAdminRequiredError,
        FloodWaitError,
        UserDeactivatedBanError,
    )
    from telethon.tl.types import (
        DocumentAttributeAnimated,
        DocumentAttributeAudio,
        DocumentAttributeSticker,
        DocumentAttributeVideo,
        MessageMediaDocument,
        MessageMediaPhoto,
        PeerUser,
    )
except ImportError:  # pragma: no cover - fallback for isolated offline test environments
    class FloodWaitError(Exception):
        def __init__(self, request=None, capture=1):
            super().__init__(f"FloodWait {capture}s")
            self.seconds = capture

    class ChannelPrivateError(Exception):
        def __init__(self, request=None):
            super().__init__("ChannelPrivate")

    class ChatAdminRequiredError(Exception):
        pass

    class UserDeactivatedBanError(Exception):
        pass

    class DocumentAttributeAnimated:
        pass

    class DocumentAttributeAudio:
        pass

    class DocumentAttributeSticker:
        pass

    class DocumentAttributeVideo:
        pass

    class MessageMediaDocument:
        pass

    class MessageMediaPhoto:
        pass

    class PeerUser:
        user_id: int = 0

from .models import DialogCheckpoint, MessageKind, ScanCheckpoint

logger = logging.getLogger("recap.scanner")


SYSTEM_USER_IDS = frozenset({
    777000,
    42777,
    333000,
    1271266957,
})


class TelegramDataSource(Protocol):
    async def get_me_id(self) -> int: ...

    async def list_dialogs(self) -> List[Any]: ...

    async def fetch_history_page(
        self,
        entity: Any,
        *,
        limit: int,
        offset_id: int,
        offset_date: Optional[datetime],
    ) -> List[Any]: ...

    async def search_own_in_group_page(
        self,
        entity: Any,
        *,
        my_id: int,
        limit: int,
        offset_id: int,
        offset_date: Optional[datetime],
    ) -> List[Any]: ...


class TelethonAdapter:
    """Боевой адаптер над Telethon TelegramClient (без Takeout и без inexact-счётчиков)."""

    def __init__(self, client: Any) -> None:
        self.client = client

    async def get_me_id(self) -> int:
        me = await self.client.get_me()
        return int(me.id)

    async def list_dialogs(self) -> List[Any]:
        return [d async for d in self.client.iter_dialogs()]

    async def fetch_history_page(
        self,
        entity: Any,
        *,
        limit: int,
        offset_id: int,
        offset_date: Optional[datetime],
    ) -> List[Any]:
        kwargs: Dict[str, Any] = {"limit": limit}
        if offset_id > 0:
            kwargs["offset_id"] = offset_id
        elif offset_date is not None:
            kwargs["offset_date"] = offset_date
        return await self.client.get_messages(entity, **kwargs)

    async def search_own_in_group_page(
        self,
        entity: Any,
        *,
        my_id: int,
        limit: int,
        offset_id: int,
        offset_date: Optional[datetime],
    ) -> List[Any]:
        kwargs: Dict[str, Any] = {
            "limit": limit,
            "from_user": "me",
        }
        if offset_id > 0:
            kwargs["offset_id"] = offset_id
        elif offset_date is not None:
            kwargs["offset_date"] = offset_date
        return await self.client.get_messages(entity, **kwargs)


def get_year_utc_bounds(year: int, tz_name: str) -> Tuple[datetime, datetime, ZoneInfo]:
    tz = ZoneInfo(tz_name)
    start_local = datetime(year, 1, 1, 0, 0, 0, tzinfo=tz)
    end_local = datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=tz)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc), tz


def classify_dialog(dialog: Any, my_id: int) -> Tuple[bool, Optional[str], str]:
    entity = getattr(dialog, "entity", None)
    dialog_id = getattr(dialog, "id", None)
    if entity is None or dialog_id is None:
        return False, None, "missing_entity"

    if getattr(dialog, "is_user", False):
        if dialog_id == my_id:
            return False, None, "saved_messages"
        if dialog_id in SYSTEM_USER_IDS:
            return False, None, "system_dialog"
        if getattr(entity, "bot", False):
            return False, None, "bot_dialog"
        return True, "private", "ok"

    if getattr(dialog, "is_group", False):
        return True, "group", "ok"

    if getattr(dialog, "is_channel", False):
        return False, None, "broadcast_channel"

    return False, None, "unsupported_type"


def is_own_message(msg: Any, my_id: int, chat_type: str) -> bool:
    if getattr(msg, "action", None) is not None:
        return False

    sender_id = getattr(msg, "sender_id", None)
    if sender_id is None:
        from_id = getattr(msg, "from_id", None)
        if isinstance(from_id, PeerUser):
            sender_id = from_id.user_id
        elif from_id is not None and hasattr(from_id, "user_id"):
            sender_id = from_id.user_id

    out_flag = bool(getattr(msg, "out", False))

    if chat_type == "private":
        if sender_id is not None:
            return int(sender_id) == my_id
        return out_flag

    if sender_id is not None:
        return int(sender_id) == my_id
    return False


def classify_message_media(msg: Any) -> Tuple[MessageKind, Optional[int]]:
    media = getattr(msg, "media", None)
    if media is None:
        text = getattr(msg, "message", None)
        return ("text" if text else "other"), None

    explicit_kind = getattr(media, "media_kind", None)
    if explicit_kind is not None:
        dur = getattr(media, "duration", None)
        return explicit_kind, (int(dur) if explicit_kind == "voice" and dur is not None else None)

    if isinstance(media, MessageMediaPhoto):
        return "photo", None

    if isinstance(media, MessageMediaDocument) and getattr(media, "document", None):
        doc = media.document
        attrs = getattr(doc, "attributes", []) or []
        mime = (getattr(doc, "mime_type", "") or "").lower()

        if any(isinstance(a, DocumentAttributeSticker) for a in attrs) or "webp" in mime or "tgsticker" in mime:
            return "sticker", None

        if any(isinstance(a, DocumentAttributeAnimated) for a in attrs) or mime == "image/gif":
            return "gif", None

        for a in attrs:
            if isinstance(a, DocumentAttributeAudio) and getattr(a, "voice", False):
                dur = getattr(a, "duration", None)
                return "voice", (int(dur) if dur is not None and dur >= 0 else None)

        for a in attrs:
            if isinstance(a, DocumentAttributeVideo):
                if getattr(a, "round_message", False):
                    return "video_note", None
                return "video", None

        if mime.startswith("video/"):
            return "video", None

        return "other", None

    return "other", None


def compute_longest_streak(daily_counts: Dict[str, int]) -> Tuple[int, Optional[Dict[str, str]]]:
    active_dates = sorted(date.fromisoformat(d) for d, cnt in daily_counts.items() if cnt > 0)
    if not active_dates:
        return 0, None

    best_len = 1
    best_start = active_dates[0]
    best_end = active_dates[0]
    cur_len = 1
    cur_start = active_dates[0]

    for i in range(1, len(active_dates)):
        if active_dates[i] == active_dates[i - 1] + timedelta(days=1):
            cur_len += 1
            if cur_len > best_len:
                best_len = cur_len
                best_start = cur_start
                best_end = active_dates[i]
        else:
            cur_len = 1
            cur_start = active_dates[i]

    return best_len, {"start": best_start.isoformat(), "end": best_end.isoformat()}


def determine_persona(cp: ScanCheckpoint, longest_streak: int) -> dict:
    total = max(cp.total_messages, 1)
    night_msgs = sum(cp.by_hour[h] for h in (23, 0, 1, 2, 3, 4))
    night_share = round(night_msgs / total, 3)

    voice_audio = cp.by_kind["voice"] + cp.by_kind["video_note"]
    voice_share = round(voice_audio / total, 3)

    visual_msgs = cp.by_kind["photo"] + cp.by_kind["video"] + cp.by_kind["sticker"] + cp.by_kind["gif"]
    visual_share = round(visual_msgs / total, 3)

    group_msgs = sum(d.outgoing_count for d in cp.dialogs.values() if d.chat_type == "group")
    group_share = round(group_msgs / total, 3)

    basis = {
        "nightShare": night_share,
        "voiceShare": voice_share,
        "visualShare": visual_share,
        "groupShare": group_share,
        "longestStreak": longest_streak,
    }

    if cp.total_messages == 0:
        return {
            "code": "minimalist_signal",
            "title": "Тихий наблюдатель",
            "subtitle": "За выбранный год исходящих сообщений не зафиксировано",
            "traits": ["Режим тишины", "Чистый лист"],
            "basisMetrics": basis,
        }
    if voice_share >= 0.12:
        return {
            "code": "voice_conductor",
            "title": "Дирижёр голосовых",
            "subtitle": "Живой голос и кружки — твой главный инструмент выразительности",
            "traits": ["Высокая доля аудио", "Эмоциональный ритм", "Быстрая реакция"],
            "basisMetrics": basis,
        }
    if night_share >= 0.28:
        return {
            "code": "midnight_architect",
            "title": "Полуночный архитектор",
            "subtitle": "Пик твоей переписки наступает, когда город уже спит",
            "traits": ["Ночной пик активности", "Глубокие диалоги", "Асинхронный ритм"],
            "basisMetrics": basis,
        }
    if group_share >= 0.45:
        return {
            "code": "community_catalyst",
            "title": "Катализатор чатов",
            "subtitle": "Ты держишь темп в групповых обсуждениях и сообществах",
            "traits": ["Сила комьюнити", "Многопоточность", "Точка притяжения"],
            "basisMetrics": basis,
        }
    if visual_share >= 0.25:
        return {
            "code": "visual_storyteller",
            "title": "Визуальный рассказчик",
            "subtitle": "Кадры, стикеры и GIF говорят за тебя точнее длинных абзацев",
            "traits": ["Визуальный язык", "Яркие реакции", "Мгновенный контекст"],
            "basisMetrics": basis,
        }
    return {
        "code": "steady_pulse",
        "title": "Ровный пульс",
        "subtitle": "Сбалансированное общение без перекосов и провалов по ритму",
        "traits": ["Стабильный ритм", "Надёжность на связи", "Чёткий фокус"],
        "basisMetrics": basis,
    }


def verify_aggregates_integrity(cp: ScanCheckpoint) -> None:
    total = cp.total_messages
    assert sum(cp.by_month) == total, f"Month sum mismatch: {sum(cp.by_month)} != {total}"
    assert sum(cp.by_weekday) == total, f"Weekday sum mismatch: {sum(cp.by_weekday)} != {total}"
    assert sum(cp.by_hour) == total, f"Hour sum mismatch: {sum(cp.by_hour)} != {total}"
    assert sum(cp.daily_counts.values()) == total, f"Daily sum mismatch: {sum(cp.daily_counts.values())} != {total}"
    assert sum(cp.by_kind.values()) == total, f"Kind sum mismatch: {sum(cp.by_kind.values())} != {total}"
    dialogs_sum = sum(d.outgoing_count for d in cp.dialogs.values())
    assert dialogs_sum == total, f"Dialogs sum mismatch: {dialogs_sum} != {total}"


class CheckpointStore:
    def __init__(self, base_dir: str) -> None:
        self._dir = Path(base_dir)
        self._dir.mkdir(parents=True, exist_ok=True)

    def _path(self, job_id: str) -> Path:
        return self._dir / f"{job_id}.json"

    def save(self, cp: ScanCheckpoint) -> None:
        data = {
            "job_id": cp.job_id,
            "telegram_user_id": cp.telegram_user_id,
            "year": cp.year,
            "timezone": cp.timezone,
            "dialogs": {
                str(k): {
                    "dialog_id": v.dialog_id,
                    "chat_type": v.chat_type,
                    "title": v.title,
                    "cursor_offset_id": v.cursor_offset_id,
                    "completed": v.completed,
                    "failed": v.failed,
                    "outgoing_count": v.outgoing_count,
                }
                for k, v in cp.dialogs.items()
            },
            "by_month": cp.by_month,
            "by_weekday": cp.by_weekday,
            "by_hour": cp.by_hour,
            "by_kind": cp.by_kind,
            "daily_counts": cp.daily_counts,
            "voice_duration_known_sec": cp.voice_duration_known_sec,
            "voice_duration_present_count": cp.voice_duration_present_count,
            "total_messages": cp.total_messages,
            "api_requests_count": cp.api_requests_count,
            "flood_wait_count": cp.flood_wait_count,
            "flood_wait_total_sec": cp.flood_wait_total_sec,
            "skipped_dialogs": cp.skipped_dialogs,
        }
        tmp = self._path(cp.job_id).with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        tmp.replace(self._path(cp.job_id))

    def load(self, job_id: str) -> Optional[ScanCheckpoint]:
        path = self._path(job_id)
        if not path.exists():
            return None
        raw = json.loads(path.read_text(encoding="utf-8"))
        cp = ScanCheckpoint(
            job_id=raw["job_id"],
            telegram_user_id=raw["telegram_user_id"],
            year=raw["year"],
            timezone=raw["timezone"],
            by_month=raw["by_month"],
            by_weekday=raw["by_weekday"],
            by_hour=raw["by_hour"],
            by_kind=raw["by_kind"],
            daily_counts=raw["daily_counts"],
            voice_duration_known_sec=raw["voice_duration_known_sec"],
            voice_duration_present_count=raw["voice_duration_present_count"],
            total_messages=raw["total_messages"],
            api_requests_count=raw["api_requests_count"],
            flood_wait_count=raw["flood_wait_count"],
            flood_wait_total_sec=raw["flood_wait_total_sec"],
            skipped_dialogs=raw["skipped_dialogs"],
        )
        for k, v in raw["dialogs"].items():
            # Legacy checkpoint files may contain original chat names. Scrub on load.
            v["title"] = ("Личный диалог" if v["chat_type"] == "private" else "Групповой чат") + f" №{len(cp.dialogs) + 1}"
            cp.dialogs[int(k)] = DialogCheckpoint(**v)
        return cp

    def delete(self, job_id: str) -> None:
        path = self._path(job_id)
        if path.exists():
            path.unlink()

    def delete_for_user(self, telegram_user_id: int) -> None:
        # Includes failed/partial checkpoints, not just currently running jobs.
        for path in self._dir.glob('*.json'):
            try:
                if int(json.loads(path.read_text(encoding='utf-8')).get('telegram_user_id', -1)) == telegram_user_id:
                    path.unlink(missing_ok=True)
            except (ValueError, OSError, KeyError):
                continue


class RecapAnalyzer:
    def __init__(
        self,
        source: TelegramDataSource,
        checkpoint_store: Optional[CheckpointStore] = None,
        *,
        page_limit: int = 100,
        sleep_fn: Callable[[float], Awaitable[None]] = asyncio.sleep,
        progress_cb: Optional[Callable[[dict], Awaitable[None]]] = None,
        cancel_event: Optional[asyncio.Event] = None,
        resume_event: Optional[asyncio.Event] = None,
        checkpoint_every_n_messages: int = 100,
    ) -> None:
        self.source = source
        self.store = checkpoint_store
        self.page_limit = page_limit
        self.sleep_fn = sleep_fn
        self.progress_cb = progress_cb
        self.cancel_event = cancel_event or asyncio.Event()
        self.resume_event = resume_event if resume_event is not None else asyncio.Event()
        if resume_event is None:
            self.resume_event.set()
        self.checkpoint_every = checkpoint_every_n_messages
        self._last_progress_at = 0.0
        self._progress_interval_sec = 5.0
        self._progress_lock = asyncio.Lock()
        self._current_status = "quick_preview"
        self._current_stage = "quick_preview"
        self._current_flood_wait_until: Optional[str] = None

    async def _emit_progress(
        self,
        cp: ScanCheckpoint,
        status: Optional[str],
        stage: Optional[str],
        flood_wait_until: Optional[str] = None,
    ) -> None:
        if not self.progress_cb:
            return
        # Heartbeat and state transitions must reach the Worker in the same order.
        # A stale heartbeat must not undo a manual pause or Telegram FloodWait.
        async with self._progress_lock:
            if status is not None:
                self._current_status = status
                self._current_stage = stage or self._current_stage
                self._current_flood_wait_until = flood_wait_until
            processed = sum(1 for d in cp.dialogs.values() if d.completed or d.failed)
            self._last_progress_at = time.monotonic()
            try:
                await self.progress_cb({
                    "jobId": cp.job_id,
                    "telegramUserId": cp.telegram_user_id,
                    "year": cp.year,
                    "timezone": cp.timezone,
                    "status": self._current_status,
                    "stage": self._current_stage,
                    "processedDialogs": processed,
                    "totalEligibleDialogs": len(cp.dialogs),
                    "outgoingFound": cp.total_messages,
                    "floodWaitUntil": self._current_flood_wait_until,
                })
            except Exception as exc:
                # Reporting failure must not corrupt statistics or mark a dialog failed.
                logger.warning("Progress delivery failed: error_type=%s", type(exc).__name__)

    async def _progress_heartbeat(self, cp: ScanCheckpoint) -> None:
        # Continue reporting ACTUAL counters when Telegram takes several seconds
        # to return one page or the dialog list; never fabricate a percentage.
        while not self.cancel_event.is_set():
            await asyncio.sleep(self._progress_interval_sec)
            if self.cancel_event.is_set():
                return
            await self._emit_progress(cp, None, None)

    async def _wait_if_paused(self, cp: ScanCheckpoint, stage: str) -> None:
        if self.resume_event.is_set():
            return
        # Persist the exact message_id cursor before acknowledging a manual pause.
        if self.store:
            self.store.save(cp)
        await self._emit_progress(cp, "paused_user", stage)
        while not self.resume_event.is_set():
            if self.cancel_event.is_set():
                raise asyncio.CancelledError()
            try:
                await asyncio.wait_for(self.resume_event.wait(), timeout=0.5)
            except asyncio.TimeoutError:
                pass
        if self.cancel_event.is_set():
            raise asyncio.CancelledError()
        await self._emit_progress(
            cp, "scanning" if stage == "full_scan" else "quick_preview", stage
        )

    async def _call_with_flood_wait(
        self,
        cp: ScanCheckpoint,
        stage: str,
        coro_factory: Callable[[], Awaitable[Any]],
    ) -> Any:
        while True:
            await self._wait_if_paused(cp, stage)
            if self.cancel_event.is_set():
                raise asyncio.CancelledError()
            try:
                cp.api_requests_count += 1
                return await coro_factory()
            except FloodWaitError as exc:
                wait_sec = max(int(getattr(exc, "seconds", 1)), 1)
                cp.flood_wait_count += 1
                cp.flood_wait_total_sec += wait_sec
                if self.store:
                    self.store.save(cp)
                until = (datetime.now(timezone.utc) + timedelta(seconds=wait_sec)).isoformat()
                await self._emit_progress(cp, "paused_flood_wait", stage, flood_wait_until=until)
                if self.sleep_fn is asyncio.sleep:
                    try:
                        await asyncio.wait_for(self.cancel_event.wait(), timeout=wait_sec)
                    except asyncio.TimeoutError:
                        pass
                else:
                    await self.sleep_fn(wait_sec)
                if self.cancel_event.is_set():
                    raise asyncio.CancelledError()
                await self._emit_progress(cp, "scanning", stage)

    async def run(
        self,
        *,
        job_id: str,
        year: int,
        timezone_name: str = "Europe/Moscow",
        resume: bool = True,
        on_after_message: Optional[Callable[[int, int], None]] = None,
    ) -> dict:
        started_at = time.perf_counter()
        start_utc, end_utc, tz = get_year_utc_bounds(year, timezone_name)
        my_id = await self.source.get_me_id()

        cp: Optional[ScanCheckpoint] = None
        if resume and self.store:
            cp = self.store.load(job_id)

        if cp is not None and (
            cp.telegram_user_id != my_id or cp.year != year or cp.timezone != timezone_name
        ):
            raise ValueError("Checkpoint owner, year or timezone does not match current scan")

        if cp is None:
            cp = ScanCheckpoint(
                job_id=job_id,
                telegram_user_id=my_id,
                year=year,
                timezone=timezone_name,
            )

        heartbeat_task = asyncio.create_task(self._progress_heartbeat(cp))
        try:
            await self._emit_progress(cp, "quick_preview", "quick_preview")
            dialogs = await self._call_with_flood_wait(cp, "quick_preview", self.source.list_dialogs)
            entity_map: Dict[int, Any] = {}
    
            for d in dialogs:
                eligible, chat_type, _reason = classify_dialog(d, my_id)
                if not eligible or chat_type is None:
                    if d.id not in cp.dialogs:
                        cp.skipped_dialogs += 1
                    continue
    
                dialog_last_dt = getattr(d, "date", None)
                if dialog_last_dt is not None:
                    if dialog_last_dt.tzinfo is None:
                        dialog_last_dt = dialog_last_dt.replace(tzinfo=timezone.utc)
                    if dialog_last_dt < start_utc:
                        if d.id not in cp.dialogs:
                            cp.skipped_dialogs += 1
                        continue
    
                entity_map[d.id] = d.entity
                if d.id not in cp.dialogs:
                    cp.dialogs[d.id] = DialogCheckpoint(
                        dialog_id=d.id,
                        chat_type=chat_type,
                        title=("Личный диалог" if chat_type == "private" else "Групповой чат") + f" №{len(cp.dialogs) + 1}",
                    )
    
            if self.store:
                self.store.save(cp)
            await self._emit_progress(cp, "quick_preview", "quick_preview")
    
            interrupted = False
            await self._emit_progress(cp, "scanning", "full_scan")
    
            for dialog_id, dcp in cp.dialogs.items():
                if not self.resume_event.is_set():
                    try:
                        await self._wait_if_paused(cp, "full_scan")
                    except asyncio.CancelledError:
                        interrupted = True
                        break
                if dcp.completed or dcp.failed:
                    continue
                if self.cancel_event.is_set():
                    interrupted = True
                    break
    
                entity = entity_map.get(dialog_id)
                if entity is None:
                    dcp.failed = True
                    continue
    
                try:
                    await self._scan_single_dialog(
                        cp=cp,
                        dcp=dcp,
                        entity=entity,
                        my_id=my_id,
                        start_utc=start_utc,
                        end_utc=end_utc,
                        tz=tz,
                        on_after_message=on_after_message,
                    )
                except asyncio.CancelledError:
                    interrupted = True
                    if self.store:
                        self.store.save(cp)
                    break
                except (ChannelPrivateError, ChatAdminRequiredError, UserDeactivatedBanError, PermissionError) as exc:
                    dcp.failed = True
                    logger.warning("Dialog unavailable: chat_type=%s error_type=%s", dcp.chat_type, type(exc).__name__)
                    if self.store:
                        self.store.save(cp)
                except Exception as exc:
                    dcp.failed = True
                    # Do not log dialog identifiers, names, message text or exception strings.
                    logger.warning("Dialog scan failed: chat_type=%s error_type=%s", dcp.chat_type, type(exc).__name__)
                    if self.store:
                        self.store.save(cp)
    
                await self._emit_progress(cp, "scanning", "full_scan")
    
            verify_aggregates_integrity(cp)
    
            failed_count = sum(1 for d in cp.dialogs.values() if d.failed)
            incomplete_count = sum(1 for d in cp.dialogs.values() if not d.completed)
            completion_status = "partial" if (interrupted or failed_count > 0 or incomplete_count > 0) else "completed"
    
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            return self._build_result_payload(cp, completion_status, elapsed_ms)
        finally:
            heartbeat_task.cancel()
            with suppress(asyncio.CancelledError):
                await heartbeat_task

    async def _scan_single_dialog(
        self,
        *,
        cp: ScanCheckpoint,
        dcp: DialogCheckpoint,
        entity: Any,
        my_id: int,
        start_utc: datetime,
        end_utc: datetime,
        tz: ZoneInfo,
        on_after_message: Optional[Callable[[int, int], None]] = None,
    ) -> None:
        use_group_search = dcp.chat_type == "group"
        msgs_since_save = 0

        while True:
            if not self.resume_event.is_set():
                await self._wait_if_paused(cp, "full_scan")
            if self.cancel_event.is_set():
                raise asyncio.CancelledError()

            offset_id = dcp.cursor_offset_id
            offset_date = end_utc if offset_id == 0 else None

            if use_group_search:
                try:
                    raw_batch = await self._call_with_flood_wait(
                        cp,
                        "full_scan",
                        lambda oid=offset_id, odt=offset_date: self.source.search_own_in_group_page(
                            entity,
                            my_id=my_id,
                            limit=self.page_limit,
                            offset_id=oid,
                            offset_date=odt,
                        ),
                    )
                except NotImplementedError:
                    use_group_search = False
                    continue
            else:
                raw_batch = await self._call_with_flood_wait(
                    cp,
                    "full_scan",
                    lambda oid=offset_id, odt=offset_date: self.source.fetch_history_page(
                        entity,
                        limit=self.page_limit,
                        offset_id=oid,
                        offset_date=odt,
                    ),
                )

            if not raw_batch:
                dcp.completed = True
                if self.store:
                    self.store.save(cp)
                return

            ordered_batch = sorted(raw_batch, key=lambda m: int(m.id), reverse=True)

            for msg in ordered_batch:
                if not self.resume_event.is_set():
                    await self._wait_if_paused(cp, "full_scan")
                if self.cancel_event.is_set():
                    raise asyncio.CancelledError()

                msg_id = int(msg.id)
                if dcp.cursor_offset_id > 0 and msg_id >= dcp.cursor_offset_id:
                    continue

                msg_dt: datetime = msg.date
                if msg_dt.tzinfo is None:
                    msg_dt = msg_dt.replace(tzinfo=timezone.utc)
                else:
                    msg_dt = msg_dt.astimezone(timezone.utc)

                if msg_dt < start_utc:
                    dcp.cursor_offset_id = msg_id
                    dcp.completed = True
                    if self.store:
                        self.store.save(cp)
                    return

                if msg_dt < end_utc and is_own_message(msg, my_id, dcp.chat_type):
                    local_dt = msg_dt.astimezone(tz)
                    kind, voice_dur = classify_message_media(msg)

                    cp.total_messages += 1
                    dcp.outgoing_count += 1
                    cp.by_month[local_dt.month - 1] += 1
                    cp.by_weekday[local_dt.weekday()] += 1
                    cp.by_hour[local_dt.hour] += 1
                    cp.by_kind[kind] += 1

                    day_key = local_dt.date().isoformat()
                    cp.daily_counts[day_key] = cp.daily_counts.get(day_key, 0) + 1

                    if kind == "voice" and voice_dur is not None:
                        cp.voice_duration_known_sec += voice_dur
                        cp.voice_duration_present_count += 1

                dcp.cursor_offset_id = msg_id
                msgs_since_save += 1

                if self.store and msgs_since_save >= self.checkpoint_every:
                    self.store.save(cp)
                    msgs_since_save = 0

                if on_after_message is not None:
                    on_after_message(dcp.dialog_id, msg_id)

            if self.store and msgs_since_save > 0:
                self.store.save(cp)
                msgs_since_save = 0

            # Update the message counter within large dialogs without flooding Worker/D1.
            if time.monotonic() - self._last_progress_at >= self._progress_interval_sec:
                await self._emit_progress(cp, "scanning", "full_scan")

    def _build_result_payload(
        self,
        cp: ScanCheckpoint,
        completion_status: str,
        elapsed_ms: int,
    ) -> dict:
        longest_streak, streak_range = compute_longest_streak(cp.daily_counts)
        active_days = sum(1 for c in cp.daily_counts.values() if c > 0)

        def hash_chat(dialog_id: int) -> str:
            return hashlib.sha256(f"{cp.telegram_user_id}:{dialog_id}".encode()).hexdigest()[:16]

        private_top = sorted(
            [d for d in cp.dialogs.values() if d.chat_type == "private" and d.outgoing_count > 0],
            key=lambda d: d.outgoing_count,
            reverse=True,
        )[:10]

        group_top = sorted(
            [d for d in cp.dialogs.values() if d.chat_type == "group" and d.outgoing_count > 0],
            key=lambda d: d.outgoing_count,
            reverse=True,
        )[:10]

        voice_duration_total = (
            cp.voice_duration_known_sec if cp.voice_duration_present_count > 0 else None
        )

        return {
            "year": cp.year,
            "timezone": cp.timezone,
            "completionStatus": completion_status,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "totalMessages": cp.total_messages,
            "activeDays": active_days,
            "longestStreakDays": longest_streak,
            "longestStreakRange": streak_range,
            "byMonth": cp.by_month,
            "byWeekday": cp.by_weekday,
            "byHour": cp.by_hour,
            "byKind": cp.by_kind,
            "voiceCount": cp.by_kind["voice"],
            "voiceTotalDurationSec": voice_duration_total,
            "videoNoteCount": cp.by_kind["video_note"],
            "photoCount": cp.by_kind["photo"],
            "videoCount": cp.by_kind["video"],
            "stickerAndGifCount": cp.by_kind["sticker"] + cp.by_kind["gif"],
            "topPrivateChats": [
                {
                    "chatHash": hash_chat(d.dialog_id),
                    "displayLabel": d.title,
                    "chatType": "private",
                    "sentMessages": d.outgoing_count,
                }
                for d in private_top
            ],
            "topGroupChats": [
                {
                    "chatHash": hash_chat(d.dialog_id),
                    "displayLabel": d.title,
                    "chatType": "group",
                    "sentMessages": d.outgoing_count,
                }
                for d in group_top
            ],
            "persona": determine_persona(cp, longest_streak),
            "metrics": {
                "apiRequestsCount": cp.api_requests_count,
                "elapsedMs": elapsed_ms,
                "floodWaitCount": cp.flood_wait_count,
                "floodWaitTotalSec": round(cp.flood_wait_total_sec, 2),
                "processedDialogs": sum(1 for d in cp.dialogs.values() if d.completed or d.failed),
                "totalEligibleDialogs": len(cp.dialogs),
                "skippedDialogs": cp.skipped_dialogs,
                "failedDialogs": sum(1 for d in cp.dialogs.values() if d.failed),
            },
        }
