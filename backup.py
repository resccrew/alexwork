import logging
from datetime import datetime

from aiogram import Bot
from aiogram.types import FSInputFile

import db
import excel
from config import ADMIN_CHAT_ID, DATA_DIR, TZ

logger = logging.getLogger("dyzury_bot")


async def send_backup(bot: Bot, reason: str = "плановый бэкап"):
    """Send the raw SQLite database plus a freshly generated current-month Excel file
    to the doctor's own chat. This is the safety net: if the server disappears, the
    doctor still has the last backup sitting in their Telegram history."""
    if not ADMIN_CHAT_ID:
        return
    now = datetime.now(TZ)
    try:
        await bot.send_document(
            ADMIN_CHAT_ID,
            FSInputFile(db.DB_PATH, filename=f"work_{now:%Y%m%d_%H%M}.db"),
            caption=f"Бэкап базы ({reason}): {now:%d.%m.%Y %H:%M}",
        )
        entries = await db.get_entries_for_month(now.year, now.month)
        xlsx_path = DATA_DIR / f"Grafik_{now.year}_{now.month:02d}.xlsx"
        excel.generate_month_excel(entries, now.year, now.month, xlsx_path)
        await bot.send_document(
            ADMIN_CHAT_ID,
            FSInputFile(xlsx_path),
            caption=f"Grafik {now.month:02d}.{now.year}",
        )
    except Exception:
        logger.exception("Failed to send backup (%s)", reason)
