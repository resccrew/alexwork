from datetime import datetime

import pytest

import db
from calc import night_minutes, summarize_month
from config import TZ

USER = 111


def test_night_minutes_no_overlap():
    start = datetime(2026, 7, 7, 7, 0, tzinfo=TZ)
    end = datetime(2026, 7, 7, 15, 0, tzinfo=TZ)
    assert night_minutes(start, end) == 0.0


def test_night_minutes_full_window_crossing_midnight():
    # 19:00 -> 07:00 next day fully contains the 22:00-06:00 window (8h = 480min).
    start = datetime(2026, 7, 9, 19, 0, tzinfo=TZ)
    end = datetime(2026, 7, 10, 7, 0, tzinfo=TZ)
    assert night_minutes(start, end) == 480.0


def test_night_minutes_long_dyzur_still_caps_at_one_window():
    # 15:00 -> 07:00 next day: still only one night window worth of overlap.
    start = datetime(2026, 7, 12, 15, 0, tzinfo=TZ)
    end = datetime(2026, 7, 13, 7, 0, tzinfo=TZ)
    assert night_minutes(start, end) == 480.0


def test_night_minutes_partial_overlap():
    # 21:00 -> 23:00: only 22:00-23:00 is night (60 min).
    start = datetime(2026, 7, 7, 21, 0, tzinfo=TZ)
    end = datetime(2026, 7, 7, 23, 0, tzinfo=TZ)
    assert night_minutes(start, end) == 60.0


async def test_summarize_month_totals_and_overtime():
    await db.add_manual_entry(
        USER, "work", "Urologia",
        datetime(2026, 7, 7, 7, 0, tzinfo=TZ), datetime(2026, 7, 7, 15, 0, tzinfo=TZ),
    )
    await db.add_manual_entry(
        USER, "dyzur", "Urologia",
        datetime(2026, 7, 9, 19, 0, tzinfo=TZ), datetime(2026, 7, 10, 7, 0, tzinfo=TZ),
    )
    entries = await db.get_entries_for_month(USER, 2026, 7)
    profile = await db.update_profile(USER, rate=50, norm_hours=15, dyzur_bonus_pct=50, night_bonus_pct=20)

    summary = summarize_month(entries, profile)
    assert summary.total_hours == pytest.approx(20.0)
    assert summary.praca_hours == pytest.approx(8.0)
    assert summary.dyzur_hours == pytest.approx(12.0)
    assert summary.night_hours == pytest.approx(8.0)
    assert summary.overtime_hours == pytest.approx(5.0)
    assert summary.earnings_simple == pytest.approx(1000.0)
    # simple(1000) + dyzur bonus (12h * 50 * 0.5 = 300) + night bonus (8h * 50 * 0.2 = 80)
    assert summary.earnings_bonus == pytest.approx(1380.0)


async def test_summarize_month_no_overtime_under_norm():
    await db.add_manual_entry(
        USER, "work", "Urologia",
        datetime(2026, 7, 7, 7, 0, tzinfo=TZ), datetime(2026, 7, 7, 15, 0, tzinfo=TZ),
    )
    entries = await db.get_entries_for_month(USER, 2026, 7)
    profile = await db.update_profile(USER, norm_hours=160)
    summary = summarize_month(entries, profile)
    assert summary.overtime_hours == 0.0
