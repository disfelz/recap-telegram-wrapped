from __future__ import annotations

import asyncio
from typing import Dict, Optional

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from .analyzer import CheckpointStore, RecapAnalyzer, TelethonAdapter
from .auth import MTProtoAuthManager
from .config import ScannerSettings, configure_logging
from .crypto import EphemeralSessionCipher

settings = ScannerSettings()
logger = configure_logging()
cipher = EphemeralSessionCipher(settings.session_encryption_key_b64)
auth_manager = MTProtoAuthManager(settings.telegram_api_id, settings.telegram_api_hash, cipher)
checkpoint_store = CheckpointStore(settings.checkpoint_dir)

app = FastAPI(title="RECAP MTProto Scanner", docs_url=None, redoc_url=None)

scan_semaphore = asyncio.Semaphore(settings.max_concurrent_scans)
active_cancel_events: Dict[str, asyncio.Event] = {}
active_job_user_ids: Dict[str, int] = {}


def verify_internal_token(authorization: str = Header(default="")) -> None:
    if authorization != f"Bearer {settings.scanner_shared_secret}":
        raise HTTPException(status_code=401, detail="Unauthorized")


class UserReq(BaseModel):
    telegram_user_id: int


class PhoneStartReq(BaseModel):
    telegram_user_id: int
    phone: str


class PhoneVerifyReq(BaseModel):
    telegram_user_id: int
    auth_id: str
    code: Optional[str] = None
    password: Optional[str] = None


class ScanStartReq(BaseModel):
    job_id: str
    telegram_user_id: int
    auth_id: str
    year: int
    timezone: str = "Europe/Moscow"
    callback_url: str


class ScanCancelReq(BaseModel):
    job_id: str
    telegram_user_id: int


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


@app.post("/internal/auth/qr/start", dependencies=[Depends(verify_internal_token)])
async def qr_start(req: UserReq) -> dict:
    return await auth_manager.start_qr_login(req.telegram_user_id)


@app.get("/internal/auth/qr/status", dependencies=[Depends(verify_internal_token)])
async def qr_status(telegram_user_id: int, auth_id: str) -> dict:
    return await auth_manager.get_qr_status(telegram_user_id, auth_id)


@app.post("/internal/auth/phone/start", dependencies=[Depends(verify_internal_token)])
async def phone_start(req: PhoneStartReq) -> dict:
    return await auth_manager.start_phone_login(req.telegram_user_id, req.phone)


@app.post("/internal/auth/phone/verify", dependencies=[Depends(verify_internal_token)])
async def phone_verify(req: PhoneVerifyReq) -> dict:
    return await auth_manager.verify_phone_login(
        req.telegram_user_id, req.auth_id, req.code, req.password
    )


@app.post("/internal/scan/start", dependencies=[Depends(verify_internal_token)])
async def scan_start(req: ScanStartReq) -> dict:
    if req.job_id in active_cancel_events:
        raise HTTPException(status_code=409, detail="Scan job is already running")
    cancel_event = asyncio.Event()
    active_cancel_events[req.job_id] = cancel_event
    active_job_user_ids[req.job_id] = req.telegram_user_id
    asyncio.create_task(_run_scan_job(req, cancel_event))
    return {"jobId": req.job_id, "status": "queued"}


@app.post("/internal/scan/cancel", dependencies=[Depends(verify_internal_token)])
async def scan_cancel(req: ScanCancelReq) -> dict:
    if active_job_user_ids.get(req.job_id) not in (None, req.telegram_user_id):
        raise HTTPException(status_code=403, detail="Job belongs to another user")
    ev = active_cancel_events.get(req.job_id)
    if ev:
        ev.set()
    await auth_manager.revoke_all_for_user(req.telegram_user_id)
    return {"cancelled": bool(ev)}


@app.post("/internal/users/{telegram_user_id}/revoke", dependencies=[Depends(verify_internal_token)])
async def revoke_user(telegram_user_id: int) -> dict:
    # Deleting all data must also stop active readers from processing new pages.
    for job_id, user_id in list(active_job_user_ids.items()):
        if user_id == telegram_user_id:
            active_cancel_events[job_id].set()
    await auth_manager.revoke_all_for_user(telegram_user_id)
    return {"revoked": True}


async def _post_callback(url: str, payload: dict) -> None:
    # A rejected callback must not masquerade as delivered progress/results.
    # Retry transient transport or 5xx failures; do not retry revoked/unknown jobs (4xx).
    async with httpx.AsyncClient(timeout=15.0) as http:
        for attempt in range(3):
            try:
                response = await http.post(
                    url,
                    json=payload,
                    headers={"Authorization": f"Bearer {settings.scanner_shared_secret}"},
                )
                response.raise_for_status()
                return
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code < 500 or attempt == 2:
                    raise
            except httpx.RequestError:
                if attempt == 2:
                    raise
            await asyncio.sleep(2 ** attempt)


async def _run_scan_job(req: ScanStartReq, cancel_event: asyncio.Event) -> None:
    client = None
    try:
        async with scan_semaphore:
            client = auth_manager.build_client_for_scan(req.telegram_user_id, req.auth_id)
            await client.connect()

            async def on_progress(p: dict) -> None:
                await _post_callback(req.callback_url, p)

            analyzer = RecapAnalyzer(
                TelethonAdapter(client),
                checkpoint_store=checkpoint_store,
                progress_cb=on_progress,
                cancel_event=cancel_event,
            )
            stats = await analyzer.run(
                job_id=req.job_id,
                year=req.year,
                timezone_name=req.timezone,
            )

            final_status = "cancelled" if cancel_event.is_set() else stats["completionStatus"]
            await _post_callback(
                req.callback_url,
                {
                    "jobId": req.job_id,
                    "telegramUserId": req.telegram_user_id,
                    "year": req.year,
                    "timezone": req.timezone,
                    "status": final_status,
                    "stage": "full_scan",
                    "processedDialogs": stats["metrics"]["processedDialogs"],
                    "totalEligibleDialogs": stats["metrics"]["totalEligibleDialogs"],
                    "outgoingFound": stats["totalMessages"],
                    "stats": stats if final_status in ("completed", "partial") else None,
                },
            )
            if final_status == "completed":
                checkpoint_store.delete(req.job_id)

    except Exception as exc:
        logger.error("Scan job failed for job_id=%s: %s", req.job_id, type(exc).__name__)
        await _post_callback(
            req.callback_url,
            {
                "jobId": req.job_id,
                "telegramUserId": req.telegram_user_id,
                "year": req.year,
                "timezone": req.timezone,
                "status": "failed",
                "stage": "full_scan",
                "processedDialogs": 0,
                "totalEligibleDialogs": 0,
                "outgoingFound": 0,
                "errorMessage": "Ошибка сканирования. Попробуй повторить позже.",
            },
        )
    finally:
        active_cancel_events.pop(req.job_id, None)
        active_job_user_ids.pop(req.job_id, None)
        if client is not None:
            await auth_manager.terminate_client_session(client)
        await auth_manager.revoke_all_for_user(req.telegram_user_id)
