import logging
from datetime import datetime

from aiogram import Bot
from aiogram.types import FSInputFile

import db
import excel
from config import ADMIN_CHAT_IDS, DATA_DIR, TZ

logger = logging.getLogger("dyzury_bot")


async def send_backup(bot: Bot, reason: str = "плановый бэкап"):
    """Send the raw SQLite database plus a freshly generated current-month Excel file
    to every authorized chat. This is the safety net: if the server disappears, whoever
    has access still has the last backup sitting in their Telegram history."""
    if not ADMIN_CHAT_IDS:
        return
    now = datetime.now(TZ)
    entries = await db.get_entries_for_month(now.year, now.month)
    xlsx_path = DATA_DIR / f"Grafik_{now.year}_{now.month:02d}.xlsx"
    excel.generate_month_excel(entries, now.year, now.month, xlsx_path)

    for chat_id in ADMIN_CHAT_IDS:
        try:
            await bot.send_document(
                chat_id,
                FSInputFile(db.DB_PATH, filename=f"work_{now:%Y%m%d_%H%M}.db"),
                caption=f"Бэкап базы ({reason}): {now:%d.%m.%Y %H:%M}",
            )
            await bot.send_document(
                chat_id,
                FSInputFile(xlsx_path),
                caption=f"Grafik {now.month:02d}.{now.year}",
            )
        except Exception:
            logger.exception("Failed to send backup to chat_id=%s (%s)", chat_id, reason)
