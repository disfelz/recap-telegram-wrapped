from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

import pytest

from scanner.app.analyzer import (
    ChannelPrivateError,
    CheckpointStore,
    FloodWaitError,
    RecapAnalyzer,
)


@dataclass
class FakeMedia:
    media_kind: str
    duration: Optional[int] = None


@dataclass
class FakeMessage:
    id: int
    date: datetime
    out: bool
    sender_id: Optional[int]
    message: str = "hello"
    media: Optional[FakeMedia] = None
    action: Optional[str] = None


@dataclass
class FakeEntity:
    id: int
    bot: bool = False
    deleted: bool = False


@dataclass
class FakeDialog:
    id: int
    name: str
    is_user: bool
    is_group: bool
    is_channel: bool
    date: datetime
    entity: FakeEntity


class FakeTelegramSource:
    def __init__(
        self,
        my_id: int,
        dialogs: List[FakeDialog],
        messages_by_dialog: Dict[int, List[FakeMessage]],
        *,
        flood_wait_on_call: Optional[int] = None,
        flood_wait_seconds: int = 3,
        failing_dialog_ids: Optional[set[int]] = None,
    ) -> None:
        self.my_id = my_id
        self.dialogs = dialogs
        self.messages_by_dialog = {
            k: sorted(v, key=lambda m: m.id, reverse=True)
            for k, v in messages_by_dialog.items()
        }
        self.flood_wait_on_call = flood_wait_on_call
        self.flood_wait_seconds = flood_wait_seconds
        self.failing_dialog_ids = failing_dialog_ids or set()
        self.call_counter = 0

    def _maybe_raise_flood(self) -> None:
        self.call_counter += 1
        if self.flood_wait_on_call is not None and self.call_counter == self.flood_wait_on_call:
            err = FloodWaitError(request=None, capture=self.flood_wait_seconds)
            err.seconds = self.flood_wait_seconds
            raise err

    async def get_me_id(self) -> int:
        return self.my_id

    async def list_dialogs(self) -> List[FakeDialog]:
        self._maybe_raise_flood()
        return self.dialogs

    def _slice_messages(
        self,
        msgs: List[FakeMessage],
        *,
        limit: int,
        offset_id: int,
        offset_date: Optional[datetime],
    ) -> List[FakeMessage]:
        out = []
        for m in msgs:
            if offset_id > 0 and m.id >= offset_id:
                continue
            if offset_id == 0 and offset_date is not None and m.date >= offset_date:
                continue
            out.append(m)
            if len(out) >= limit:
                break
        return out

    async def fetch_history_page(
        self,
        entity: FakeEntity,
        *,
        limit: int,
        offset_id: int,
        offset_date: Optional[datetime],
    ) -> List[FakeMessage]:
        self._maybe_raise_flood()
        if entity.id in self.failing_dialog_ids:
            raise ChannelPrivateError(request=None)
        return self._slice_messages(
            self.messages_by_dialog.get(entity.id, []),
            limit=limit,
            offset_id=offset_id,
            offset_date=offset_date,
        )

    async def search_own_in_group_page(
        self,
        entity: FakeEntity,
        *,
        my_id: int,
        limit: int,
        offset_id: int,
        offset_date: Optional[datetime],
    ) -> List[FakeMessage]:
        self._maybe_raise_flood()
        if entity.id in self.failing_dialog_ids:
            raise ChannelPrivateError(request=None)
        own_msgs = [
            m for m in self.messages_by_dialog.get(entity.id, [])
            if m.sender_id == my_id
        ]
        return self._slice_messages(
            own_msgs,
            limit=limit,
            offset_id=offset_id,
            offset_date=offset_date,
        )


def make_dialog(dialog_id: int, *, is_group: bool = False, last_dt: datetime) -> FakeDialog:
    return FakeDialog(
        id=dialog_id,
        name=f"Chat {dialog_id}",
        is_user=not is_group,
        is_group=is_group,
        is_channel=False,
        date=last_dt,
        entity=FakeEntity(id=dialog_id),
    )


@pytest.mark.asyncio
async def test_1_and_2_90k_chat_since_nov_2025_only_outgoing_2026(tmp_path: Path):
    my_id = 100
    other_id = 200
    base_nov_2025 = datetime(2025, 11, 1, 0, 0, tzinfo=timezone.utc)
    msgs: List[FakeMessage] = []
    expected_2026_own = 0

    for i in range(1, 90_001):
        dt = base_nov_2025 + timedelta(minutes=6 * i)
        is_mine = (i % 3 == 0)
        msgs.append(FakeMessage(id=i, date=dt, out=is_mine, sender_id=my_id if is_mine else other_id))
        if is_mine and datetime(2026, 1, 1, tzinfo=timezone.utc) <= dt < datetime(2027, 1, 1, tzinfo=timezone.utc):
            expected_2026_own += 1

    dialog = make_dialog(other_id, last_dt=msgs[-1].date)
    source = FakeTelegramSource(my_id, [dialog], {other_id: msgs})
    analyzer = RecapAnalyzer(source, CheckpointStore(str(tmp_path)), page_limit=100)

    res = await analyzer.run(job_id="t12", year=2026, timezone_name="UTC")

    assert res["completionStatus"] == "completed"
    assert res["totalMessages"] == expected_2026_own
    assert res["metrics"]["apiRequestsCount"] < 800
    assert res["metrics"]["elapsedMs"] >= 0


@pytest.mark.asyncio
async def test_3_private_chat_alternating_and_sparse_pages(tmp_path: Path):
    my_id = 100
    peer_id = 201
    start = datetime(2026, 2, 1, 10, 0, tzinfo=timezone.utc)

    msgs: List[FakeMessage] = []
    expected_own = 0
    for i in range(1, 351):
        dt = start + timedelta(minutes=i)
        if i <= 150:
            is_mine = (i % 2 == 0)
        elif i <= 300:
            is_mine = False
        else:
            is_mine = True
        if is_mine:
            expected_own += 1
        msgs.append(FakeMessage(id=i, date=dt, out=is_mine, sender_id=my_id if is_mine else peer_id))

    source = FakeTelegramSource(my_id, [make_dialog(peer_id, last_dt=msgs[-1].date)], {peer_id: msgs})
    analyzer = RecapAnalyzer(source, CheckpointStore(str(tmp_path)), page_limit=100)
    res = await analyzer.run(job_id="t3", year=2026, timezone_name="UTC")

    assert res["totalMessages"] == expected_own == 125


@pytest.mark.asyncio
async def test_4_group_chat_100k_foreign_messages(tmp_path: Path):
    my_id = 100
    group_id = -100123456
    start = datetime(2026, 1, 10, 0, 0, tzinfo=timezone.utc)

    msgs: List[FakeMessage] = []
    for i in range(1, 100_043):
        dt = start + timedelta(seconds=60 * i)
        is_mine = (i % 2381 == 0)
        msgs.append(FakeMessage(id=i, date=dt, out=is_mine, sender_id=my_id if is_mine else 999))

    dialog = make_dialog(group_id, is_group=True, last_dt=msgs[-1].date)
    source = FakeTelegramSource(my_id, [dialog], {group_id: msgs})
    analyzer = RecapAnalyzer(source, CheckpointStore(str(tmp_path)), page_limit=100)
    res = await analyzer.run(job_id="t4", year=2026, timezone_name="UTC")

    assert res["totalMessages"] == 42
    assert res["topGroupChats"][0]["sentMessages"] == 42
    assert res["metrics"]["apiRequestsCount"] <= 4


@pytest.mark.asyncio
async def test_5_and_6_interrupt_mid_page_and_resume_no_duplicates(tmp_path: Path):
    my_id = 100
    peer_id = 202
    start = datetime(2026, 3, 1, 0, 0, tzinfo=timezone.utc)
    msgs = [
        FakeMessage(
            id=i,
            date=start + timedelta(minutes=i),
            out=(i % 2 == 1),
            sender_id=my_id if (i % 2 == 1) else peer_id,
        )
        for i in range(1, 251)
    ]
    expected_own = sum(1 for m in msgs if m.out)

    store = CheckpointStore(str(tmp_path))
    source = FakeTelegramSource(my_id, [make_dialog(peer_id, last_dt=msgs[-1].date)], {peer_id: msgs})

    cancel_event = asyncio.Event()
    seen_counter = 0

    def trigger_mid_page_cancel(_did: int, _mid: int) -> None:
        nonlocal seen_counter
        seen_counter += 1
        if seen_counter == 37:
            cancel_event.set()

    analyzer1 = RecapAnalyzer(
        source, store, page_limit=100, cancel_event=cancel_event, checkpoint_every_n_messages=10
    )
    partial_res = await analyzer1.run(
        job_id="t56", year=2026, timezone_name="UTC", on_after_message=trigger_mid_page_cancel
    )
    assert partial_res["completionStatus"] == "partial"
    assert 0 < partial_res["totalMessages"] < expected_own

    analyzer2 = RecapAnalyzer(source, store, page_limit=100)
    final_res = await analyzer2.run(job_id="t56", year=2026, timezone_name="UTC", resume=True)

    assert final_res["completionStatus"] == "completed"
    assert final_res["totalMessages"] == expected_own


@pytest.mark.asyncio
async def test_7_telegram_flood_wait(tmp_path: Path):
    my_id = 100
    peer_id = 203
    start = datetime(2026, 4, 1, 0, 0, tzinfo=timezone.utc)
    msgs = [
        FakeMessage(id=i, date=start + timedelta(minutes=i), out=True, sender_id=my_id)
        for i in range(1, 151)
    ]
    source = FakeTelegramSource(
        my_id,
        [make_dialog(peer_id, last_dt=msgs[-1].date)],
        {peer_id: msgs},
        flood_wait_on_call=2,
        flood_wait_seconds=7,
    )

    waited: List[float] = []

    async def fast_sleep(sec: float) -> None:
        waited.append(sec)

    analyzer = RecapAnalyzer(source, CheckpointStore(str(tmp_path)), page_limit=100, sleep_fn=fast_sleep)
    res = await analyzer.run(job_id="t7", year=2026, timezone_name="UTC")

    assert res["completionStatus"] == "completed"
    assert res["totalMessages"] == 150
    assert res["metrics"]["floodWaitCount"] == 1
    assert waited == [7]


@pytest.mark.asyncio
async def test_8_chat_with_zero_outgoing_messages(tmp_path: Path):
    my_id = 100
    peer_id = 204
    start = datetime(2026, 5, 1, 0, 0, tzinfo=timezone.utc)
    msgs = [
        FakeMessage(id=i, date=start + timedelta(minutes=i), out=False, sender_id=peer_id)
        for i in range(1, 51)
    ]
    source = FakeTelegramSource(my_id, [make_dialog(peer_id, last_dt=msgs[-1].date)], {peer_id: msgs})
    analyzer = RecapAnalyzer(source, CheckpointStore(str(tmp_path)))
    res = await analyzer.run(job_id="t8", year=2026, timezone_name="UTC")

    assert res["completionStatus"] == "completed"
    assert res["totalMessages"] == 0
    assert res["topPrivateChats"] == []


@pytest.mark.asyncio
async def test_9_timezone_boundary_shift(tmp_path: Path):
    my_id = 100
    peer_id = 205
    boundary_dt = datetime(2025, 12, 31, 22, 30, tzinfo=timezone.utc)
    msgs = [FakeMessage(id=1, date=boundary_dt, out=True, sender_id=my_id)]
    source = FakeTelegramSource(my_id, [make_dialog(peer_id, last_dt=boundary_dt)], {peer_id: msgs})

    res_utc = await RecapAnalyzer(source).run(job_id="t9_utc", year=2026, timezone_name="UTC")
    res_msk = await RecapAnalyzer(source).run(job_id="t9_msk", year=2026, timezone_name="Europe/Moscow")

    assert res_utc["totalMessages"] == 0
    assert res_msk["totalMessages"] == 1
    assert res_msk["byMonth"][0] == 1
    assert res_msk["byHour"][1] == 1


@pytest.mark.asyncio
async def test_10_no_data_for_selected_year(tmp_path: Path):
    my_id = 100
    peer_id = 206
    old_dt = datetime(2023, 6, 15, 12, 0, tzinfo=timezone.utc)
    msgs = [FakeMessage(id=1, date=old_dt, out=True, sender_id=my_id)]
    source = FakeTelegramSource(my_id, [make_dialog(peer_id, last_dt=old_dt)], {peer_id: msgs})

    res = await RecapAnalyzer(source).run(job_id="t10", year=2026, timezone_name="UTC")
    assert res["completionStatus"] == "completed"
    assert res["totalMessages"] == 0
    assert res["longestStreakDays"] == 0
    assert res["metrics"]["skippedDialogs"] == 1


@pytest.mark.asyncio
async def test_11_partially_inaccessible_dialogs(tmp_path: Path):
    my_id = 100
    ok_peer = 207
    broken_group = -100999
    dt = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)

    dialogs = [
        make_dialog(ok_peer, last_dt=dt),
        make_dialog(broken_group, is_group=True, last_dt=dt),
    ]
    msgs = {
        ok_peer: [FakeMessage(id=1, date=dt, out=True, sender_id=my_id)],
        broken_group: [FakeMessage(id=1, date=dt, out=True, sender_id=my_id)],
    }
    source = FakeTelegramSource(my_id, dialogs, msgs, failing_dialog_ids={broken_group})
    res = await RecapAnalyzer(source).run(job_id="t11", year=2026, timezone_name="UTC")

    assert res["completionStatus"] == "partial"
    assert res["totalMessages"] == 1
    assert res["metrics"]["failedDialogs"] == 1


@pytest.mark.asyncio
async def test_12_integrity_across_days_months_hours_and_media_types(tmp_path: Path):
    my_id = 100
    peer_id = 208
    msgs = [
        FakeMessage(1, datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc), True, my_id, "hi"),
        FakeMessage(2, datetime(2026, 1, 2, 10, 0, tzinfo=timezone.utc), True, my_id, "", FakeMedia("voice", 45)),
        FakeMessage(3, datetime(2026, 1, 3, 11, 0, tzinfo=timezone.utc), True, my_id, "", FakeMedia("video_note")),
        FakeMessage(4, datetime(2026, 5, 10, 23, 0, tzinfo=timezone.utc), True, my_id, "", FakeMedia("photo")),
        FakeMessage(5, datetime(2026, 7, 15, 15, 0, tzinfo=timezone.utc), True, my_id, "", FakeMedia("video")),
        FakeMessage(6, datetime(2026, 8, 20, 18, 0, tzinfo=timezone.utc), True, my_id, "", FakeMedia("sticker")),
        FakeMessage(7, datetime(2026, 9, 25, 20, 0, tzinfo=timezone.utc), True, my_id, "", FakeMedia("gif")),
    ]
    source = FakeTelegramSource(my_id, [make_dialog(peer_id, last_dt=msgs[-1].date)], {peer_id: msgs})
    res = await RecapAnalyzer(source).run(job_id="t12", year=2026, timezone_name="UTC")

    assert res["totalMessages"] == 7
    assert sum(res["byMonth"]) == 7
    assert sum(res["byWeekday"]) == 7
    assert sum(res["byHour"]) == 7
    assert sum(res["byKind"].values()) == 7
    assert res["voiceCount"] == 1
    assert res["voiceTotalDurationSec"] == 45
    assert res["videoNoteCount"] == 1
    assert res["photoCount"] == 1
    assert res["videoCount"] == 1
    assert res["stickerAndGifCount"] == 2
    assert res["longestStreakDays"] == 3
    assert res["activeDays"] == 7

@pytest.mark.asyncio
async def test_13_checkpoint_owner_isolation(tmp_path: Path):
    """A job_id cannot silently resume counters created for another Telegram user."""
    my_id = 100
    peer = 217
    dt = datetime(2026, 6, 5, 12, 0, tzinfo=timezone.utc)
    store = CheckpointStore(str(tmp_path))
    src = FakeTelegramSource(my_id, [make_dialog(peer, last_dt=dt)], {
        peer: [FakeMessage(1, dt, True, my_id)]
    })
    await RecapAnalyzer(src, store).run(job_id="samejob", year=2026, timezone_name="UTC")
    changed_user = FakeTelegramSource(555, [make_dialog(peer, last_dt=dt)], {peer: []})
    with pytest.raises(ValueError, match="Checkpoint owner"):
        await RecapAnalyzer(changed_user, store).run(job_id="samejob", year=2026, timezone_name="UTC")


@pytest.mark.asyncio
async def test_14_checkpoint_excludes_real_chat_titles(tmp_path: Path):
    """Raw dialog names must not end up in scanner checkpoint files or API result."""
    my_id = 100
    peer = 218
    dt = datetime(2026, 6, 5, 12, 0, tzinfo=timezone.utc)
    sensitive = 'Очень личное название чата'
    dialog = make_dialog(peer, last_dt=dt)
    dialog.name = sensitive
    store = CheckpointStore(str(tmp_path))
    source = FakeTelegramSource(my_id, [dialog], {peer: [FakeMessage(1, dt, True, my_id)]})
    result = await RecapAnalyzer(source, store).run(job_id='privacy', year=2026, timezone_name='UTC')
    contents = (tmp_path / 'privacy.json').read_text(encoding='utf8')
    assert sensitive not in contents
    assert sensitive not in str(result)


@pytest.mark.asyncio
async def test_15_live_heartbeat_during_one_chat_and_sequential_dialogs(tmp_path: Path):
    """No overlapping chats; the outgoing counter advances before a large chat finishes."""
    me = 100
    dt = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)
    first, second = 311, 312
    messages = {
        first: [FakeMessage(i, dt + timedelta(minutes=i), True, me) for i in range(1, 3)],
        second: [FakeMessage(i, dt + timedelta(minutes=i), True, me) for i in range(1, 3)],
    }

    class SlowSource(FakeTelegramSource):
        def __init__(self):
            super().__init__(me, [
                make_dialog(first, last_dt=dt + timedelta(days=1)),
                make_dialog(second, last_dt=dt + timedelta(days=1)),
            ], messages)
            self.pages: List[int] = []

        async def fetch_history_page(self, entity, *, limit, offset_id, offset_date):
            self.pages.append(entity.id)
            await asyncio.sleep(0.035)  # network wait, heartbeat must still report
            return await super().fetch_history_page(
                entity, limit=limit, offset_id=offset_id, offset_date=offset_date
            )

    source = SlowSource()
    observed = []

    async def capture(payload: dict) -> None:
        observed.append(dict(payload))

    analyzer = RecapAnalyzer(source, CheckpointStore(str(tmp_path)),
                             progress_cb=capture, page_limit=2)
    analyzer._progress_interval_sec = 0.01
    result = await analyzer.run(job_id="heartbeat", year=2026, timezone_name="UTC")

    assert result["completionStatus"] == "completed"
    assert result["totalMessages"] == 4
    assert source.pages == [first, first, second, second]
    assert any(p["outgoingFound"] == 2 and p["processedDialogs"] == 0
               for p in observed), "Counters must update inside a large chat"
    assert observed[-1]["outgoingFound"] == 4
    assert observed[-1]["processedDialogs"] == 2
