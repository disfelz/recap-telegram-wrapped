from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Literal


MessageKind = Literal[
    "text", "voice", "video_note", "photo", "video", "sticker", "gif", "other"
]


@dataclass
class DialogCheckpoint:
    dialog_id: int
    chat_type: Literal["private", "group"]
    title: str
    cursor_offset_id: int = 0
    completed: bool = False
    failed: bool = False
    outgoing_count: int = 0


@dataclass
class ScanCheckpoint:
    job_id: str
    telegram_user_id: int
    year: int
    timezone: str
    dialogs: Dict[int, DialogCheckpoint] = field(default_factory=dict)
    by_month: List[int] = field(default_factory=lambda: [0] * 12)
    by_weekday: List[int] = field(default_factory=lambda: [0] * 7)
    by_hour: List[int] = field(default_factory=lambda: [0] * 24)
    by_kind: Dict[str, int] = field(
        default_factory=lambda: {
            "text": 0,
            "voice": 0,
            "video_note": 0,
            "photo": 0,
            "video": 0,
            "sticker": 0,
            "gif": 0,
            "other": 0,
        }
    )
    daily_counts: Dict[str, int] = field(default_factory=dict)
    voice_duration_known_sec: int = 0
    voice_duration_present_count: int = 0
    total_messages: int = 0
    api_requests_count: int = 0
    flood_wait_count: int = 0
    flood_wait_total_sec: float = 0.0
    skipped_dialogs: int = 0
