"""Derived numbers the bot never needed but the Mini App does: night hours, overtime,
and earnings. Ported from the MedApp design prototype's JS (computeDuration/nightMinutes),
re-expressed against real datetimes instead of the prototype's minutes-since-epoch mock data.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from db import Entry, Profile

NIGHT_START_HOUR = 22  # night window: 22:00 -> 06:00 next day
NIGHT_WINDOW = timedelta(hours=8)


def night_minutes(start: datetime, end: datetime) -> float:
    """Minutes of [start, end) that fall inside any 22:00-06:00 window."""
    if end <= start:
        return 0.0
    total = timedelta()
    day = start.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
    while day < end:
        window_start = day.replace(hour=NIGHT_START_HOUR)
        window_end = window_start + NIGHT_WINDOW
        overlap_start = max(start, window_start)
        overlap_end = min(end, window_end)
        if overlap_end > overlap_start:
            total += overlap_end - overlap_start
        day += timedelta(days=1)
    return total.total_seconds() / 60


@dataclass
class ShiftCalc:
    entry: Entry
    duration_hours: float
    night_hours: float


def calc_entry(entry: Entry) -> ShiftCalc:
    if entry.end_dt is None:
        return ShiftCalc(entry=entry, duration_hours=0.0, night_hours=0.0)
    duration_min = (entry.end_dt - entry.start_dt).total_seconds() / 60
    return ShiftCalc(
        entry=entry,
        duration_hours=round(duration_min / 60, 2),
        night_hours=round(night_minutes(entry.start_dt, entry.end_dt) / 60, 2),
    )


@dataclass
class MonthSummary:
    total_hours: float
    praca_hours: float
    dyzur_hours: float
    night_hours: float
    overtime_hours: float
    earnings_simple: float
    earnings_bonus: float


def summarize_month(entries: list[Entry], profile: Profile) -> MonthSummary:
    calcs = [calc_entry(e) for e in entries]
    total = round(sum(c.duration_hours for c in calcs), 2)
    praca = round(sum(c.duration_hours for c in calcs if c.entry.kind == "work"), 2)
    dyzur = round(sum(c.duration_hours for c in calcs if c.entry.kind == "dyzur"), 2)
    night = round(sum(c.night_hours for c in calcs), 2)
    overtime = round(max(0.0, total - profile.norm_hours), 2)

    earnings_simple = round(total * profile.rate, 2)
    earnings_bonus = round(
        earnings_simple
        + dyzur * profile.rate * (profile.dyzur_bonus_pct / 100)
        + night * profile.rate * (profile.night_bonus_pct / 100),
        2,
    )

    return MonthSummary(
        total_hours=total, praca_hours=praca, dyzur_hours=dyzur, night_hours=night,
        overtime_hours=overtime, earnings_simple=earnings_simple, earnings_bonus=earnings_bonus,
    )
