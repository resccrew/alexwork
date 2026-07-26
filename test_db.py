from datetime import datetime

import pytest

import db
from config import TZ


@pytest.fixture(autouse=True)
async def fresh_db(tmp_path):
    db.DB_PATH = tmp_path / "test.db"
    await db.init_db()
    yield


async def test_open_then_close_computes_hours():
    start = datetime(2026, 3, 2, 6, 56, tzinfo=TZ)
    end = datetime(2026, 3, 2, 15, 10, tzinfo=TZ)
    await db.open_entry("work", "Urologia", start_dt=start)
    entry = await db.close_entry(end_dt=end)
    assert entry.oddzial == "Urologia"
    assert entry.hours == pytest.approx(8.23, abs=0.01)
    assert await db.get_open_entry() is None


async def test_cannot_open_twice():
    await db.open_entry("work", "Urologia")
    with pytest.raises(db.EntryAlreadyOpenError):
        await db.open_entry("work", "Chirurgia Onk.")


async def test_close_without_open_raises():
    with pytest.raises(db.NoOpenEntryError):
        await db.close_entry()


async def test_close_and_reopen_switches_to_dyzur():
    start = datetime(2026, 3, 6, 7, 8, tzinfo=TZ)
    switch = datetime(2026, 3, 6, 15, 0, tzinfo=TZ)
    end = datetime(2026, 3, 7, 8, 11, tzinfo=TZ)
    await db.open_entry("work", "Chirurgia Onk.", start_dt=start)
    closed, opened = await db.close_and_reopen("dyzur", "Chirurgia Onk.", at_dt=switch)
    assert closed.hours == pytest.approx(7.87, abs=0.01)
    assert opened.kind == "dyzur"
    await db.close_entry(end_dt=end)
    entries = await db.get_entries_for_month(2026, 3)
    assert len(entries) == 2
    assert entries[1].hours == pytest.approx(17.18, abs=0.01)


async def test_manual_entry_and_correction():
    start = datetime(2026, 3, 9, 6, 46, tzinfo=TZ)
    end = datetime(2026, 3, 9, 16, 3, tzinfo=TZ)
    entry = await db.add_manual_entry("work", "Urologia", start, end)
    assert entry.source == "manual"
    assert entry.hours == pytest.approx(9.28, abs=0.01)

    corrected_end = datetime(2026, 3, 9, 16, 0, tzinfo=TZ)
    updated = await db.update_entry(entry.id, end_dt=corrected_end)
    assert updated.hours == pytest.approx(9.23, abs=0.01)


async def test_get_entries_for_month_excludes_other_months():
    await db.add_manual_entry(
        "work", "Urologia",
        datetime(2026, 3, 31, 7, 0, tzinfo=TZ), datetime(2026, 3, 31, 9, 50, tzinfo=TZ),
    )
    await db.add_manual_entry(
        "work", "Urologia",
        datetime(2026, 4, 1, 7, 0, tzinfo=TZ), datetime(2026, 4, 1, 9, 0, tzinfo=TZ),
    )
    march = await db.get_entries_for_month(2026, 3)
    assert len(march) == 1
    assert march[0].start_ts.startswith("2026-03-31")


async def test_open_entries_not_included_in_month_report():
    await db.open_entry("work", "Urologia", start_dt=datetime(2026, 3, 15, 7, 0, tzinfo=TZ))
    entries = await db.get_entries_for_month(2026, 3)
    assert entries == []
