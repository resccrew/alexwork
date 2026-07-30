import os
import shutil
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

import calc
import db
import excel
from config import DEPARTMENTS, DOCTOR_NAME, MONTH_NAMES_PL, TZ
from webapp.auth import InvalidInitData, validate_init_data
from webapp.schemas import (
    ConfigOut, DayBar, MeOut, ProfileOut, ProfileUpdateIn,
    ShiftCreateIn, ShiftOut, ShiftStartIn, ShiftUpdateIn, SummaryOut,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db()
    yield


app = FastAPI(title="MedApp API", lifespan=lifespan)

_allowed_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def to_local(dt: datetime) -> datetime:
    """Interpret an incoming timestamp in the app's timezone, converting if it
    carries a different offset; treat naive input as already-local."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=TZ)
    return dt.astimezone(TZ)


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    x_telegram_init_data: Optional[str] = Header(default=None),
) -> dict:
    if os.environ.get("DEV_SKIP_AUTH") == "1":
        # Local UI preview outside Telegram, where there's no real initData to sign.
        # Never set this in deploy configs -- it disables auth entirely.
        return {"id": 0, "first_name": "Dev"}
    raw = None
    if authorization and authorization.lower().startswith("tma "):
        raw = authorization[4:]
    elif x_telegram_init_data:
        raw = x_telegram_init_data
    if not raw:
        raise HTTPException(status_code=401, detail="Missing Telegram init data")
    try:
        return validate_init_data(raw)
    except InvalidInitData as e:
        raise HTTPException(status_code=401, detail=str(e))


def entry_to_shift_out(entry: db.Entry) -> ShiftOut:
    c = calc.calc_entry(entry)
    return ShiftOut(
        id=entry.id, kind=entry.kind, oddzial=entry.oddzial,
        start=entry.start_dt, end=entry.end_dt,
        hours=c.duration_hours if entry.end_dt else None,
        night_hours=c.night_hours if entry.end_dt else None,
        edited=entry.edited, source=entry.source,
    )


@app.get("/api/me", response_model=MeOut)
async def me(user: dict = Depends(get_current_user)):
    return MeOut(
        id=user["id"], first_name=user.get("first_name"),
        last_name=user.get("last_name"), username=user.get("username"),
    )


@app.get("/api/config", response_model=ConfigOut)
async def get_config(user: dict = Depends(get_current_user)):
    return ConfigOut(departments=DEPARTMENTS, doctor_name=DOCTOR_NAME)


@app.get("/api/status", response_model=Optional[ShiftOut])
async def status(user: dict = Depends(get_current_user)):
    open_entry = await db.get_open_entry()
    return entry_to_shift_out(open_entry) if open_entry else None


@app.post("/api/shifts/start", response_model=ShiftOut)
async def start_shift(body: ShiftStartIn, user: dict = Depends(get_current_user)):
    try:
        entry = await db.open_entry(body.kind, body.oddzial, source="webapp")
    except db.EntryAlreadyOpenError as e:
        raise HTTPException(status_code=409, detail="A shift is already open") from e
    return entry_to_shift_out(entry)


@app.post("/api/shifts/stop", response_model=ShiftOut)
async def stop_shift(user: dict = Depends(get_current_user)):
    try:
        entry = await db.close_entry()
    except db.NoOpenEntryError as e:
        raise HTTPException(status_code=404, detail="No open shift") from e
    return entry_to_shift_out(entry)


@app.get("/api/shifts", response_model=list[ShiftOut])
async def list_shifts(year: int, month: int, user: dict = Depends(get_current_user)):
    entries = await db.get_entries_for_month(year, month)
    entries.sort(key=lambda e: e.start_ts, reverse=True)
    return [entry_to_shift_out(e) for e in entries]


@app.get("/api/shifts/upcoming", response_model=list[ShiftOut])
async def list_upcoming_shifts(user: dict = Depends(get_current_user)):
    entries = await db.get_upcoming_entries(limit=3)
    return [entry_to_shift_out(e) for e in entries]


@app.post("/api/shifts", response_model=ShiftOut)
async def create_shift(body: ShiftCreateIn, user: dict = Depends(get_current_user)):
    entry = await db.add_manual_entry(
        body.kind, body.oddzial, to_local(body.start), to_local(body.end),
        source="webapp", edited=True,
    )
    return entry_to_shift_out(entry)


@app.patch("/api/shifts/{shift_id}", response_model=ShiftOut)
async def update_shift(shift_id: int, body: ShiftUpdateIn, user: dict = Depends(get_current_user)):
    existing = await db.get_entry(shift_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Shift not found")
    entry = await db.update_entry(
        shift_id,
        start_dt=to_local(body.start) if body.start else None,
        end_dt=to_local(body.end) if body.end else None,
        kind=body.kind,
        oddzial=body.oddzial,
        mark_edited=True,
    )
    return entry_to_shift_out(entry)


@app.delete("/api/shifts/{shift_id}", status_code=204)
async def delete_shift(shift_id: int, user: dict = Depends(get_current_user)):
    existing = await db.get_entry(shift_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Shift not found")
    await db.delete_entry(shift_id)


@app.get("/api/summary", response_model=SummaryOut)
async def summary(year: int, month: int, user: dict = Depends(get_current_user)):
    entries = await db.get_entries_for_month(year, month)
    profile = await db.get_profile()
    s = calc.summarize_month(entries, profile)

    by_day: dict[int, dict] = {}
    for e in entries:
        c = calc.calc_entry(e)
        day = e.start_dt.day
        bucket = by_day.setdefault(day, {"minutes": 0.0, "has_dyzur": False, "shifts": 0})
        bucket["minutes"] += c.duration_hours * 60
        bucket["shifts"] += 1
        if e.kind == "dyzur":
            bucket["has_dyzur"] = True
    days = [
        DayBar(day=d, minutes=round(v["minutes"], 1), has_dyzur=v["has_dyzur"], shifts=v["shifts"])
        for d, v in sorted(by_day.items())
    ]

    return SummaryOut(
        year=year, month=month,
        total_hours=s.total_hours, praca_hours=s.praca_hours, dyzur_hours=s.dyzur_hours,
        night_hours=s.night_hours, overtime_hours=s.overtime_hours,
        earnings_simple=s.earnings_simple, earnings_bonus=s.earnings_bonus,
        days=days,
    )


@app.get("/api/report")
async def report(year: int, month: int, user: dict = Depends(get_current_user)):
    entries = await db.get_entries_for_month(year, month)
    tmp_dir = Path(tempfile.mkdtemp(prefix="medapp_report_"))
    path = tmp_dir / f"Grafik_{year}_{month:02d}.xlsx"
    excel.generate_month_excel(entries, year, month, path)
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"Grafik_{MONTH_NAMES_PL[month]}_{year}.xlsx",
        background=BackgroundTask(shutil.rmtree, tmp_dir, ignore_errors=True),
    )


@app.get("/api/profile", response_model=ProfileOut)
async def get_profile(user: dict = Depends(get_current_user)):
    p = await db.get_profile()
    return ProfileOut(**vars(p))


@app.patch("/api/profile", response_model=ProfileOut)
async def update_profile(body: ProfileUpdateIn, user: dict = Depends(get_current_user)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    p = await db.update_profile(**fields)
    return ProfileOut(**vars(p))
