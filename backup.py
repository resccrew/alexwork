import logging
from datetime import datetime

from aiogram import Bot
from aiogram.types import FSInputFile

import db
import excel
from config import ADMIN_CHAT_IDS, DATA_DIR, TZ

logger = logging.getLogger("dyzury_bot")


async def send_backup(bot: Bot, reason: str = "плановый бэкап"):
    """Send the raw SQLite database (everyone's data -- this is a whole-system disaster
    recovery artifact, deliberately not scoped per user: /restore needs the full file to
    bring the server back for all users, not just whoever happened to trigger the backup)
    to every authorized chat, plus each user's own current-month Excel."""
    if not ADMIN_CHAT_IDS:
        return
    now = datetime.now(TZ)

    for chat_id in ADMIN_CHAT_IDS:
        user_id = int(chat_id)
        try:
            await bot.send_document(
                chat_id,
                FSInputFile(db.DB_PATH, filename=f"work_{now:%Y%m%d_%H%M}.db"),
                caption=f"Бэкап базы ({reason}): {now:%d.%m.%Y %H:%M}",
            )
            entries = await db.get_entries_for_month(user_id, now.year, now.month)
            xlsx_path = DATA_DIR / f"Grafik_{user_id}_{now.year}_{now.month:02d}.xlsx"
            excel.generate_month_excel(entries, now.year, now.month, xlsx_path)
            await bot.send_document(
                chat_id,
                FSInputFile(xlsx_path),
                caption=f"Grafik {now.month:02d}.{now.year}",
            )
        except Exception:
            logger.exception("Failed to send backup to chat_id=%s (%s)", chat_id, reason)
