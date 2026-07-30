import asyncio
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

import aiosqlite

from config import DB_PATH, TZ

TS_FMT = "%Y-%m-%d %H:%M"

_lock = asyncio.Lock()


class EntryAlreadyOpenError(Exception):
    def __init__(self, entry):
        self.entry = entry
        super().__init__(f"An entry is already open: {entry}")


class NoOpenEntryError(Exception):
    pass


@dataclass
class Entry:
    id: int
    kind: str  # 'work' | 'dyzur'
    oddzial: str
    start_ts: str
    end_ts: Optional[str]
    source: str
    created_at: str
    edited: bool = False

    @property
    def start_dt(self) -> datetime:
        return datetime.strptime(self.start_ts, TS_FMT).replace(tzinfo=TZ)

    @property
    def end_dt(self) -> Optional[datetime]:
        if self.end_ts is None:
            return None
        return datetime.strptime(self.end_ts, TS_FMT).replace(tzinfo=TZ)

    @property
    def hours(self) -> Optional[float]:
        if self.end_ts is None:
            return None
        delta = self.end_dt - self.start_dt
        return round(delta.total_seconds() / 3600, 2)


def now_str() -> str:
    return datetime.now(TZ).strftime(TS_FMT)


def to_str(dt: datetime) -> str:
    return dt.strftime(TS_FMT)


def _row_to_entry(row) -> Entry:
    return Entry(
        id=row[0], kind=row[1], oddzial=row[2],
        start_ts=row[3], end_ts=row[4], source=row[5], created_at=row[6],
        edited=bool(row[7]),
    )


SCHEMA = """
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('work','dyzur')),
  oddzial TEXT NOT NULL,
  start_ts TEXT NOT NULL,
  end_ts TEXT,
  source TEXT NOT NULL DEFAULT 'bot',
  created_at TEXT NOT NULL,
  edited INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  rate REAL NOT NULL DEFAULT 0,
  norm_hours REAL NOT NULL DEFAULT 160,
  employment TEXT NOT NULL DEFAULT 'etat',
  default_oddzial TEXT,
  dyzur_bonus_pct REAL NOT NULL DEFAULT 0,
  night_bonus_pct REAL NOT NULL DEFAULT 0
);
"""


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        # Migrate DBs created before the `edited` column existed.
        cur = await db.execute("PRAGMA table_info(entries)")
        cols = {row[1] for row in await cur.fetchall()}
        if "edited" not in cols:
            await db.execute("ALTER TABLE entries ADD COLUMN edited INTEGER NOT NULL DEFAULT 0")
        await db.execute("INSERT OR IGNORE INTO profile (id) VALUES (1)")
        await db.commit()


async def get_open_entry() -> Optional[Entry]:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "SELECT id, kind, oddzial, start_ts, end_ts, source, created_at, edited "
            "FROM entries WHERE end_ts IS NULL ORDER BY id DESC LIMIT 1"
        )
        row = await cur.fetchone()
        return _row_to_entry(row) if row else None


async def open_entry(kind: str, oddzial: str, start_dt: Optional[datetime] = None, source: str = "bot") -> Entry:
    async with _lock:
        existing = await get_open_entry()
        if existing:
            raise EntryAlreadyOpenError(existing)
        start_ts = to_str(start_dt) if start_dt else now_str()
        async with aiosqlite.connect(DB_PATH) as db:
            cur = await db.execute(
                "INSERT INTO entries (kind, oddzial, start_ts, end_ts, source, created_at) "
                "VALUES (?, ?, ?, NULL, ?, ?)",
                (kind, oddzial, start_ts, source, now_str()),
            )
            await db.commit()
            entry_id = cur.lastrowid
        return await get_entry(entry_id)


async def close_entry(end_dt: Optional[datetime] = None) -> Entry:
    async with _lock:
        existing = await get_open_entry()
        if not existing:
            raise NoOpenEntryError()
        end_ts = to_str(end_dt) if end_dt else now_str()
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("UPDATE entries SET end_ts = ? WHERE id = ?", (end_ts, existing.id))
            await db.commit()
        return await get_entry(existing.id)


async def close_and_reopen(new_kind: str, oddzial: str, at_dt: Optional[datetime] = None) -> tuple[Optional[Entry], Entry]:
    """Close whatever is open (if anything) at `at_dt`, then immediately open a new entry
    of kind `new_kind` at the same moment. Returns (closed_entry_or_None, new_entry)."""
    async with _lock:
        at_ts = to_str(at_dt) if at_dt else now_str()
        closed = None
        existing = await get_open_entry()
        async with aiosqlite.connect(DB_PATH) as db:
            if existing:
                await db.execute("UPDATE entries SET end_ts = ? WHERE id = ?", (at_ts, existing.id))
                await db.commit()
            cur = await db.execute(
                "INSERT INTO entries (kind, oddzial, start_ts, end_ts, source, created_at) "
                "VALUES (?, ?, ?, NULL, 'bot', ?)",
                (new_kind, oddzial, at_ts, now_str()),
            )
            await db.commit()
            new_id = cur.lastrowid
        if existing:
            closed = await get_entry(existing.id)
        return closed, await get_entry(new_id)


async def get_entry(entry_id: int) -> Optional[Entry]:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "SELECT id, kind, oddzial, start_ts, end_ts, source, created_at, edited FROM entries WHERE id = ?",
            (entry_id,),
        )
        row = await cur.fetchone()
        return _row_to_entry(row) if row else None


async def get_last_entry() -> Optional[Entry]:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "SELECT id, kind, oddzial, start_ts, end_ts, source, created_at, edited "
            "FROM entries ORDER BY id DESC LIMIT 1"
        )
        row = await cur.fetchone()
        return _row_to_entry(row) if row else None


async def add_manual_entry(
    kind: str, oddzial: str, start_dt: datetime, end_dt: datetime,
    source: str = "manual", edited: bool = False,
) -> Entry:
    async with _lock:
        async with aiosqlite.connect(DB_PATH) as db:
            cur = await db.execute(
                "INSERT INTO entries (kind, oddzial, start_ts, end_ts, source, created_at, edited) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (kind, oddzial, to_str(start_dt), to_str(end_dt), source, now_str(), int(edited)),
            )
            await db.commit()
            entry_id = cur.lastrowid
        return await get_entry(entry_id)


async def update_entry(
    entry_id: int,
    start_dt: Optional[datetime] = None,
    end_dt: Optional[datetime] = None,
    kind: Optional[str] = None,
    oddzial: Optional[str] = None,
    mark_edited: bool = False,
) -> Entry:
    async with _lock:
        async with aiosqlite.connect(DB_PATH) as db:
            if start_dt is not None:
                await db.execute("UPDATE entries SET start_ts = ? WHERE id = ?", (to_str(start_dt), entry_id))
            if end_dt is not None:
                await db.execute("UPDATE entries SET end_ts = ? WHERE id = ?", (to_str(end_dt), entry_id))
            if kind is not None:
                await db.execute("UPDATE entries SET kind = ? WHERE id = ?", (kind, entry_id))
            if oddzial is not None:
                await db.execute("UPDATE entries SET oddzial = ? WHERE id = ?", (oddzial, entry_id))
            if mark_edited:
                await db.execute("UPDATE entries SET edited = 1 WHERE id = ?", (entry_id,))
            await db.commit()
        return await get_entry(entry_id)


async def delete_entry(entry_id: int) -> None:
    async with _lock:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
            await db.commit()


async def get_entries_for_month(year: int, month: int) -> list[Entry]:
    """Closed entries whose start date falls within the given month (local calendar day)."""
    prefix = f"{year:04d}-{month:02d}-"
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "SELECT id, kind, oddzial, start_ts, end_ts, source, created_at, edited "
            "FROM entries WHERE start_ts LIKE ? AND end_ts IS NOT NULL ORDER BY start_ts ASC",
            (prefix + "%",),
        )
        rows = await cur.fetchall()
        return [_row_to_entry(r) for r in rows]


async def get_entries_for_year(year: int) -> list[Entry]:
    """Closed entries whose start date falls within the given year."""
    prefix = f"{year:04d}-"
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "SELECT id, kind, oddzial, start_ts, end_ts, source, created_at, edited "
            "FROM entries WHERE start_ts LIKE ? AND end_ts IS NOT NULL ORDER BY start_ts ASC",
            (prefix + "%",),
        )
        rows = await cur.fetchall()
        return [_row_to_entry(r) for r in rows]


async def get_upcoming_entries(limit: int = 3) -> list[Entry]:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "SELECT id, kind, oddzial, start_ts, end_ts, source, created_at, edited "
            "FROM entries WHERE start_ts > ? ORDER BY start_ts ASC LIMIT ?",
            (now_str(), limit),
        )
        rows = await cur.fetchall()
        return [_row_to_entry(r) for r in rows]


async def get_entries_for_day(year: int, month: int, day: int) -> list[Entry]:
    prefix = f"{year:04d}-{month:02d}-{day:02d}"
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "SELECT id, kind, oddzial, start_ts, end_ts, source, created_at, edited "
            "FROM entries WHERE start_ts LIKE ? ORDER BY start_ts ASC",
            (prefix + "%",),
        )
        rows = await cur.fetchall()
        return [_row_to_entry(r) for r in rows]


@dataclass
class Profile:
    rate: float
    norm_hours: float
    employment: str
    default_oddzial: Optional[str]
    dyzur_bonus_pct: float
    night_bonus_pct: float


async def get_profile() -> Profile:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "SELECT rate, norm_hours, employment, default_oddzial, dyzur_bonus_pct, night_bonus_pct "
            "FROM profile WHERE id = 1"
        )
        row = await cur.fetchone()
        return Profile(rate=row[0], norm_hours=row[1], employment=row[2], default_oddzial=row[3],
                        dyzur_bonus_pct=row[4], night_bonus_pct=row[5])


async def update_profile(**fields) -> Profile:
    allowed = {"rate", "norm_hours", "employment", "default_oddzial", "dyzur_bonus_pct", "night_bonus_pct"}
    unknown = set(fields) - allowed
    if unknown:
        raise ValueError(f"Unknown profile fields: {unknown}")
    if not fields:
        return await get_profile()
    async with _lock:
        async with aiosqlite.connect(DB_PATH) as db:
            set_clause = ", ".join(f"{k} = ?" for k in fields)
            await db.execute(f"UPDATE profile SET {set_clause} WHERE id = 1", tuple(fields.values()))
            await db.commit()
    return await get_profile()


async def replace_database(new_db_path) -> Path:
    """Used by /restore: save the current DB aside (never silently discard it), then swap
    in the provided backup file. Returns the path the previous DB was saved to."""
    import shutil

    async with _lock:
        safety_copy = DB_PATH.parent / f"work.db.bak-{now_str().replace(' ', '_').replace(':', '')}"
        if DB_PATH.exists():
            shutil.copyfile(DB_PATH, safety_copy)
        shutil.copyfile(new_db_path, DB_PATH)
        return safety_copy
