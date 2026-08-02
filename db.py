import asyncio
import os
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
    user_id: int
    kind: str  # 'work' | 'dyzur'
    oddzial: str
    start_ts: str
    end_ts: Optional[str]
    source: str
    created_at: str
    edited: bool = False
    gcal_event_id: Optional[str] = None

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
        id=row[0], user_id=row[1], kind=row[2], oddzial=row[3],
        start_ts=row[4], end_ts=row[5], source=row[6], created_at=row[7],
        edited=bool(row[8]), gcal_event_id=row[9] if len(row) > 9 else None,
    )


ENTRY_COLUMNS = "id, user_id, kind, oddzial, start_ts, end_ts, source, created_at, edited, gcal_event_id"

# New databases get user_id from day one (NOT NULL). Existing production databases are
# migrated below in init_db(): the column is added nullable, then backfilled from
# LEGACY_DATA_OWNER_CHAT_ID -- the person all pre-multi-tenant history actually belongs to.
SCHEMA = """
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('work','dyzur')),
  oddzial TEXT NOT NULL,
  start_ts TEXT NOT NULL,
  end_ts TEXT,
  source TEXT NOT NULL DEFAULT 'bot',
  created_at TEXT NOT NULL,
  edited INTEGER NOT NULL DEFAULT 0,
  gcal_event_id TEXT
);

CREATE TABLE IF NOT EXISTS profile (
  user_id INTEGER PRIMARY KEY,
  rate REAL NOT NULL DEFAULT 0,
  norm_hours REAL NOT NULL DEFAULT 160,
  employment TEXT NOT NULL DEFAULT 'etat',
  default_oddzial TEXT,
  dyzur_bonus_pct REAL NOT NULL DEFAULT 0,
  night_bonus_pct REAL NOT NULL DEFAULT 0,
  gcal_access_token TEXT,
  gcal_refresh_token TEXT,
  gcal_expiry REAL
);
"""


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)

        cur = await db.execute("PRAGMA table_info(entries)")
        entry_cols = {row[1] for row in await cur.fetchall()}

        # Migrate DBs created before the `edited` column existed.
        if "edited" not in entry_cols:
            await db.execute("ALTER TABLE entries ADD COLUMN edited INTEGER NOT NULL DEFAULT 0")

        # Migrate single-tenant DBs (no user_id) to multi-tenant: every existing row
        # belonged to whoever was the sole user before a second person was added.
        if "user_id" not in entry_cols:
            await db.execute("ALTER TABLE entries ADD COLUMN user_id INTEGER")
            legacy_owner = os.environ.get("LEGACY_DATA_OWNER_CHAT_ID")
            if legacy_owner:
                await db.execute(
                    "UPDATE entries SET user_id = ? WHERE user_id IS NULL", (int(legacy_owner),)
                )

        # Migrate the old single shared profile row (id=1) into the new per-user table.
        cur = await db.execute("PRAGMA table_info(profile)")
        profile_cols = {row[1] for row in await cur.fetchall()}
        if profile_cols and "user_id" not in profile_cols:
            cur2 = await db.execute(
                "SELECT rate, norm_hours, employment, default_oddzial, dyzur_bonus_pct, night_bonus_pct "
                "FROM profile WHERE id = 1"
            )
            legacy_row = await cur2.fetchone()
            await db.execute("ALTER TABLE profile RENAME TO profile_legacy")
            await db.execute(
                "CREATE TABLE profile ("
                "  user_id INTEGER PRIMARY KEY,"
                "  rate REAL NOT NULL DEFAULT 0,"
                "  norm_hours REAL NOT NULL DEFAULT 160,"
                "  employment TEXT NOT NULL DEFAULT 'etat',"
                "  default_oddzial TEXT,"
                "  dyzur_bonus_pct REAL NOT NULL DEFAULT 0,"
                "  night_bonus_pct REAL NOT NULL DEFAULT 0"
                ")"
            )
            legacy_owner = os.environ.get("LEGACY_DATA_OWNER_CHAT_ID")
            if legacy_row and legacy_owner:
                await db.execute(
                    "INSERT INTO profile (user_id, rate, norm_hours, employment, default_oddzial, "
                    "dyzur_bonus_pct, night_bonus_pct) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (int(legacy_owner), *legacy_row),
                )
            await db.execute("DROP TABLE profile_legacy")

        # Migrate Google Calendar fields
        cur = await db.execute("PRAGMA table_info(entries)")
        entry_cols = {row[1] for row in await cur.fetchall()}
        if "gcal_event_id" not in entry_cols:
            await db.execute("ALTER TABLE entries ADD COLUMN gcal_event_id TEXT")

        cur = await db.execute("PRAGMA table_info(profile)")
        profile_cols = {row[1] for row in await cur.fetchall()}
        if profile_cols and "gcal_access_token" not in profile_cols:
            await db.execute("ALTER TABLE profile ADD COLUMN gcal_access_token TEXT")
            await db.execute("ALTER TABLE profile ADD COLUMN gcal_refresh_token TEXT")
            await db.execute("ALTER TABLE profile ADD COLUMN gcal_expiry REAL")

        await db.commit()


async def get_open_entry(user_id: int) -> Optional[Entry]:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            f"SELECT {ENTRY_COLUMNS} FROM entries WHERE user_id = ? AND end_ts IS NULL "
            "ORDER BY id DESC LIMIT 1",
            (user_id,),
        )
        row = await cur.fetchone()
        return _row_to_entry(row) if row else None


async def open_entry(
    user_id: int, kind: str, oddzial: str, start_dt: Optional[datetime] = None, source: str = "bot",
) -> Entry:
    async with _lock:
        existing = await get_open_entry(user_id)
        if existing:
            raise EntryAlreadyOpenError(existing)
        start_ts = to_str(start_dt) if start_dt else now_str()
        async with aiosqlite.connect(DB_PATH) as db:
            cur = await db.execute(
                "INSERT INTO entries (user_id, kind, oddzial, start_ts, end_ts, source, created_at) "
                "VALUES (?, ?, ?, ?, NULL, ?, ?)",
                (user_id, kind, oddzial, start_ts, source, now_str()),
            )
            await db.commit()
            entry_id = cur.lastrowid
        return await get_entry(entry_id, user_id)


async def close_entry(user_id: int, end_dt: Optional[datetime] = None) -> Entry:
    async with _lock:
        existing = await get_open_entry(user_id)
        if not existing:
            raise NoOpenEntryError()
        end_ts = to_str(end_dt) if end_dt else now_str()
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("UPDATE entries SET end_ts = ? WHERE id = ?", (end_ts, existing.id))
            await db.commit()
        return await get_entry(existing.id, user_id)


async def close_and_reopen(
    user_id: int, new_kind: str, oddzial: str, at_dt: Optional[datetime] = None,
) -> tuple[Optional[Entry], Entry]:
    """Close whatever is open (if anything) at `at_dt`, then immediately open a new entry
    of kind `new_kind` at the same moment. Returns (closed_entry_or_None, new_entry)."""
    async with _lock:
        at_ts = to_str(at_dt) if at_dt else now_str()
        closed = None
        existing = await get_open_entry(user_id)
        async with aiosqlite.connect(DB_PATH) as db:
            if existing:
                await db.execute("UPDATE entries SET end_ts = ? WHERE id = ?", (at_ts, existing.id))
                await db.commit()
            cur = await db.execute(
                "INSERT INTO entries (user_id, kind, oddzial, start_ts, end_ts, source, created_at) "
                "VALUES (?, ?, ?, ?, NULL, 'bot', ?)",
                (user_id, new_kind, oddzial, at_ts, now_str()),
            )
            await db.commit()
            new_id = cur.lastrowid
        if existing:
            closed = await get_entry(existing.id, user_id)
        return closed, await get_entry(new_id, user_id)


async def get_entry(entry_id: int, user_id: int) -> Optional[Entry]:
    """Scoped to user_id so callers can't accidentally (or maliciously) read/act on
    another user's entry just by guessing an id."""
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            f"SELECT {ENTRY_COLUMNS} FROM entries WHERE id = ? AND user_id = ?",
            (entry_id, user_id),
        )
        row = await cur.fetchone()
        return _row_to_entry(row) if row else None


async def get_last_entry(user_id: int) -> Optional[Entry]:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            f"SELECT {ENTRY_COLUMNS} FROM entries WHERE user_id = ? ORDER BY id DESC LIMIT 1",
            (user_id,),
        )
        row = await cur.fetchone()
        return _row_to_entry(row) if row else None


async def add_manual_entry(
    user_id: int, kind: str, oddzial: str, start_dt: datetime, end_dt: datetime,
    source: str = "manual", edited: bool = False,
) -> Entry:
    async with _lock:
        async with aiosqlite.connect(DB_PATH) as db:
            cur = await db.execute(
                "INSERT INTO entries (user_id, kind, oddzial, start_ts, end_ts, source, created_at, edited) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (user_id, kind, oddzial, to_str(start_dt), to_str(end_dt), source, now_str(), int(edited)),
            )
            await db.commit()
            entry_id = cur.lastrowid
        return await get_entry(entry_id, user_id)


async def update_entry(
    entry_id: int,
    user_id: int,
    start_dt: Optional[datetime] = None,
    end_dt: Optional[datetime] = None,
    kind: Optional[str] = None,
    oddzial: Optional[str] = None,
    mark_edited: bool = False,
) -> Optional[Entry]:
    """Returns None if no entry with this id belongs to user_id (nothing was updated)."""
    async with _lock:
        async with aiosqlite.connect(DB_PATH) as db:
            if start_dt is not None:
                await db.execute(
                    "UPDATE entries SET start_ts = ? WHERE id = ? AND user_id = ?",
                    (to_str(start_dt), entry_id, user_id),
                )
            if end_dt is not None:
                await db.execute(
                    "UPDATE entries SET end_ts = ? WHERE id = ? AND user_id = ?",
                    (to_str(end_dt), entry_id, user_id),
                )
            if kind is not None:
                await db.execute(
                    "UPDATE entries SET kind = ? WHERE id = ? AND user_id = ?",
                    (kind, entry_id, user_id),
                )
            if oddzial is not None:
                await db.execute(
                    "UPDATE entries SET oddzial = ? WHERE id = ? AND user_id = ?",
                    (oddzial, entry_id, user_id),
                )
            if mark_edited:
                await db.execute(
                    "UPDATE entries SET edited = 1 WHERE id = ? AND user_id = ?", (entry_id, user_id),
                )
            await db.commit()
        return await get_entry(entry_id, user_id)

async def update_entry_gcal(entry_id: int, user_id: int, gcal_event_id: Optional[str]) -> None:
    async with _lock:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "UPDATE entries SET gcal_event_id = ? WHERE id = ? AND user_id = ?",
                (gcal_event_id, entry_id, user_id),
            )
            await db.commit()


async def delete_entry(entry_id: int, user_id: int) -> None:
    async with _lock:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("DELETE FROM entries WHERE id = ? AND user_id = ?", (entry_id, user_id))
            await db.commit()


async def get_entries_for_month(user_id: int, year: int, month: int) -> list[Entry]:
    """Closed entries whose start date falls within the given month (local calendar day)."""
    prefix = f"{year:04d}-{month:02d}-"
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            f"SELECT {ENTRY_COLUMNS} FROM entries "
            "WHERE user_id = ? AND start_ts LIKE ? AND end_ts IS NOT NULL ORDER BY start_ts ASC",
            (user_id, prefix + "%"),
        )
        rows = await cur.fetchall()
        return [_row_to_entry(r) for r in rows]


async def get_entries_for_year(user_id: int, year: int) -> list[Entry]:
    """Closed entries whose start date falls within the given year."""
    prefix = f"{year:04d}-"
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            f"SELECT {ENTRY_COLUMNS} FROM entries "
            "WHERE user_id = ? AND start_ts LIKE ? AND end_ts IS NOT NULL ORDER BY start_ts ASC",
            (user_id, prefix + "%"),
        )
        rows = await cur.fetchall()
        return [_row_to_entry(r) for r in rows]


async def get_upcoming_entries(user_id: int, limit: int = 3) -> list[Entry]:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            f"SELECT {ENTRY_COLUMNS} FROM entries WHERE user_id = ? AND start_ts > ? "
            "ORDER BY start_ts ASC LIMIT ?",
            (user_id, now_str(), limit),
        )
        rows = await cur.fetchall()
        return [_row_to_entry(r) for r in rows]


async def get_entries_for_day(user_id: int, year: int, month: int, day: int) -> list[Entry]:
    prefix = f"{year:04d}-{month:02d}-{day:02d}"
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            f"SELECT {ENTRY_COLUMNS} FROM entries WHERE user_id = ? AND start_ts LIKE ? "
            "ORDER BY start_ts ASC",
            (user_id, prefix + "%"),
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
    gcal_access_token: Optional[str] = None
    gcal_refresh_token: Optional[str] = None
    gcal_expiry: Optional[float] = None


async def get_profile(user_id: int) -> Profile:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("INSERT OR IGNORE INTO profile (user_id) VALUES (?)", (user_id,))
        await db.commit()
        cur = await db.execute(
            "SELECT rate, norm_hours, employment, default_oddzial, dyzur_bonus_pct, night_bonus_pct, "
            "gcal_access_token, gcal_refresh_token, gcal_expiry "
            "FROM profile WHERE user_id = ?",
            (user_id,),
        )
        row = await cur.fetchone()
        return Profile(
            rate=row[0], norm_hours=row[1], employment=row[2], default_oddzial=row[3],
            dyzur_bonus_pct=row[4], night_bonus_pct=row[5],
            gcal_access_token=row[6], gcal_refresh_token=row[7], gcal_expiry=row[8]
        )


async def update_profile(user_id: int, **fields) -> Profile:
    allowed = {
        "rate", "norm_hours", "employment", "default_oddzial", "dyzur_bonus_pct", "night_bonus_pct",
        "gcal_access_token", "gcal_refresh_token", "gcal_expiry"
    }
    unknown = set(fields) - allowed
    if unknown:
        raise ValueError(f"Unknown profile fields: {unknown}")
    async with _lock:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("INSERT OR IGNORE INTO profile (user_id) VALUES (?)", (user_id,))
            if fields:
                set_clause = ", ".join(f"{k} = ?" for k in fields)
                await db.execute(
                    f"UPDATE profile SET {set_clause} WHERE user_id = ?",
                    (*fields.values(), user_id),
                )
            await db.commit()
    return await get_profile(user_id)


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
