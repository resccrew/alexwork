import asyncio
import logging
from datetime import datetime, timedelta

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import BaseFilter, Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (
    CallbackQuery,
    ErrorEvent,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    MenuButtonWebApp,
    Message,
    ReplyKeyboardMarkup,
    WebAppInfo,
)
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

import backup
import db
import excel
from config import ADMIN_CHAT_IDS, BOT_TOKEN, DATA_DIR, DEPARTMENTS, LOG_PATH, MONTH_NAMES_PL, TZ, WEBAPP_URL

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    handlers=[logging.FileHandler(LOG_PATH, encoding="utf-8"), logging.StreamHandler()],
)
logger = logging.getLogger("dyzury_bot")

def main_menu_keyboard() -> ReplyKeyboardMarkup:
    rows = [
        [KeyboardButton(text="✅ Пришёл"), KeyboardButton(text="🌙 Дежурство")],
        [KeyboardButton(text="🏁 Ушёл"), KeyboardButton(text="📊 Мои часы")],
        [KeyboardButton(text="📄 Таблица"), KeyboardButton(text="✏️ Исправить")],
    ]
    if WEBAPP_URL:
        rows.append([KeyboardButton(text="📱 Открыть MedApp", web_app=WebAppInfo(url=WEBAPP_URL))])
    return ReplyKeyboardMarkup(keyboard=rows, resize_keyboard=True)


MAIN_MENU = main_menu_keyboard()

TIME_RE = r"^([01]\d|2[0-3]):([0-5]\d)$"


def department_keyboard(prefix: str) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text=d, callback_data=f"{prefix}:{d}")] for d in DEPARTMENTS]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def is_authorized(user_id: int) -> bool:
    return str(user_id) in ADMIN_CHAT_IDS


def fmt_hm(hours: float) -> str:
    total_minutes = round(hours * 60)
    h, m = divmod(total_minutes, 60)
    return f"{h} ч {m:02d} мин"


def prev_month(year: int, month: int) -> tuple[int, int]:
    if month == 1:
        return year - 1, 12
    return year, month - 1


async def month_total_hours(year: int, month: int) -> float:
    entries = await db.get_entries_for_month(year, month)
    total_minutes = sum((e.end_dt - e.start_dt).total_seconds() / 60 for e in entries)
    return round(total_minutes / 60, 2)


class IsAdmin(BaseFilter):
    async def __call__(self, event) -> bool:
        user = getattr(event, "from_user", None)
        return bool(user) and is_authorized(user.id)


public_router = Router()
router = Router()
router.message.filter(IsAdmin())
router.callback_query.filter(IsAdmin())


# ---------------------------------------------------------------- /start ----

@public_router.message(Command("start"))
async def cmd_start(message: Message):
    if not ADMIN_CHAT_IDS:
        logger.info("Bootstrap /start from unconfigured chat_id=%s", message.from_user.id)
        await message.answer(
            f"Ваш chat_id: <code>{message.from_user.id}</code>\n\n"
            "Впишите его в .env как ADMIN_CHAT_ID и перезапустите бота.",
            parse_mode="HTML",
        )
        return
    if not is_authorized(message.from_user.id):
        logger.info("Unrecognized /start from chat_id=%s", message.from_user.id)
        await message.answer("Это личный бот.")
        return
    await message.answer("Готов к работе.", reply_markup=MAIN_MENU)


class IsNotAdmin(BaseFilter):
    async def __call__(self, message: Message) -> bool:
        return not is_authorized(message.from_user.id)


@public_router.message(IsNotAdmin())
async def guard_unauthorized(message: Message):
    await message.answer("Это личный бот.")


# ------------------------------------------------------------ Пришёл ----

@router.message(F.text == "✅ Пришёл")
async def arrive(message: Message):
    open_e = await db.get_open_entry()
    if open_e:
        await message.answer(
            f"Вы уже отметились в {open_e.start_dt:%H:%M} ({open_e.oddzial}).\n"
            "Сначала нажмите 🏁 Ушёл."
        )
        return
    await message.answer("Выберите отделение:", reply_markup=department_keyboard("arrive"))


@router.callback_query(F.data.startswith("arrive:"))
async def arrive_dept(callback: CallbackQuery):
    dept = callback.data.split(":", 1)[1]
    try:
        entry = await db.open_entry("work", dept)
    except db.EntryAlreadyOpenError as e:
        await callback.message.edit_text(
            f"Вы уже отметились в {e.entry.start_dt:%H:%M} ({e.entry.oddzial})."
        )
        await callback.answer()
        return
    await callback.message.edit_text(f"✅ Записано: {entry.start_dt:%d.%m, %H:%M}, {dept}")
    await callback.answer()


# ---------------------------------------------------------- Дежурство ----

@router.message(F.text == "🌙 Дежурство")
async def duty(message: Message):
    open_e = await db.get_open_entry()
    if open_e:
        closed, opened = await db.close_and_reopen("dyzur", open_e.oddzial)
        await message.answer(
            f"Дневная смена закрыта: {fmt_hm(closed.hours)} ({closed.hours:.2f} ч)\n"
            f"🌙 Дежурство начато: {opened.start_dt:%H:%M}, {opened.oddzial}"
        )
        return
    await message.answer("Выберите отделение:", reply_markup=department_keyboard("duty"))


@router.callback_query(F.data.startswith("duty:"))
async def duty_dept(callback: CallbackQuery):
    dept = callback.data.split(":", 1)[1]
    try:
        entry = await db.open_entry("dyzur", dept)
    except db.EntryAlreadyOpenError as e:
        await callback.message.edit_text(
            f"Вы уже отметились в {e.entry.start_dt:%H:%M} ({e.entry.oddzial})."
        )
        await callback.answer()
        return
    await callback.message.edit_text(f"🌙 Дежурство начато: {entry.start_dt:%d.%m, %H:%M}, {dept}")
    await callback.answer()


# --------------------------------------------------------------- Ушёл ----

@router.message(F.text == "🏁 Ушёл")
async def leave(message: Message):
    try:
        entry = await db.close_entry()
    except db.NoOpenEntryError:
        await message.answer("Открытой смены нет. Забыли отметиться? Нажмите ✏️ Исправить")
        return
    total = await month_total_hours(entry.start_dt.year, entry.start_dt.month)
    await message.answer(
        f"🏁 Смена закрыта: {fmt_hm(entry.hours)} ({entry.hours:.2f} ч)\n"
        f"За месяц: {total:.2f} ч"
    )
    await on_shift_closed(message.bot)


async def on_shift_closed(bot: Bot):
    await backup.send_backup(bot, reason="смена закрыта")


# ---------------------------------------------------------- Мои часы ----

@router.message(F.text == "📊 Мои часы")
async def my_hours(message: Message):
    now = datetime.now(TZ)
    today_entries = await db.get_entries_for_day(now.year, now.month, now.day)
    today_hours = round(sum(e.hours for e in today_entries if e.end_ts is not None), 2)
    total = await month_total_hours(now.year, now.month)

    lines = [
        f"Сегодня: {today_hours:.2f} ч",
        f"За {MONTH_NAMES_PL[now.month]} {now.year}: {total:.2f} ч",
    ]
    open_e = await db.get_open_entry()
    if open_e:
        elapsed = (now - open_e.start_dt).total_seconds() / 3600
        kind_label = "дежурство" if open_e.kind == "dyzur" else "смена"
        lines.append(
            f"\nСейчас идёт: {kind_label} в {open_e.oddzial}, с {open_e.start_dt:%H:%M} "
            f"({elapsed:.2f} ч, не закрыта)"
        )
    await message.answer("\n".join(lines))


# ------------------------------------------------------------ Таблица ----

async def send_month_table(message: Message, year: int, month: int):
    entries = await db.get_entries_for_month(year, month)
    path = DATA_DIR / f"Grafik_{year}_{month:02d}.xlsx"
    excel.generate_month_excel(entries, year, month, path)

    py, pm = prev_month(year, month)
    kb = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="⬅️ Предыдущий месяц", callback_data=f"table:{py}:{pm}")]]
    )
    from aiogram.types import FSInputFile
    await message.answer_document(
        FSInputFile(path),
        caption=f"Grafik {MONTH_NAMES_PL[month]} {year}",
        reply_markup=kb,
    )


@router.message(F.text == "📄 Таблица")
async def table(message: Message):
    now = datetime.now(TZ)
    await send_month_table(message, now.year, now.month)


@router.callback_query(F.data.startswith("table:"))
async def table_other_month(callback: CallbackQuery):
    _, year, month = callback.data.split(":")
    await send_month_table(callback.message, int(year), int(month))
    await callback.answer()


# ---------------------------------------------------------- Исправить ----

class Correction(StatesGroup):
    choosing_mode = State()
    add_date = State()
    add_kind = State()
    add_department = State()
    add_start = State()
    add_end = State()
    add_confirm = State()
    edit_start = State()
    edit_end = State()
    edit_confirm = State()


def _parse_date(text: str) -> datetime | None:
    text = text.strip()
    now = datetime.now(TZ)
    for fmt in ("%d.%m.%Y", "%d.%m"):
        try:
            parsed = datetime.strptime(text, fmt)
            year = parsed.year if fmt == "%d.%m.%Y" else now.year
            return datetime(year, parsed.month, parsed.day, tzinfo=TZ)
        except ValueError:
            continue
    return None


@router.message(F.text == "✏️ Исправить")
async def correction_start(message: Message, state: FSMContext):
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="➕ Добавить пропущенную смену", callback_data="corr:add")],
            [InlineKeyboardButton(text="✏️ Изменить последнюю запись", callback_data="corr:edit")],
        ]
    )
    await message.answer("Что нужно исправить?", reply_markup=kb)
    await state.set_state(Correction.choosing_mode)


@router.callback_query(Correction.choosing_mode, F.data == "corr:add")
async def correction_add_start(callback: CallbackQuery, state: FSMContext):
    kb = InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(text="Сегодня", callback_data="corr_date:today"),
            InlineKeyboardButton(text="Вчера", callback_data="corr_date:yesterday"),
        ]]
    )
    await callback.message.edit_text(
        "Какой день? Нажмите кнопку или напишите дату в формате ДД.ММ", reply_markup=kb
    )
    await state.set_state(Correction.add_date)
    await callback.answer()


@router.callback_query(Correction.add_date, F.data.startswith("corr_date:"))
async def correction_add_date_button(callback: CallbackQuery, state: FSMContext):
    now = datetime.now(TZ)
    day_dt = now if callback.data.endswith("today") else now - timedelta(days=1)
    await state.update_data(date=day_dt.strftime("%Y-%m-%d"))
    await _ask_kind(callback.message, state)
    await callback.answer()


@router.message(Correction.add_date)
async def correction_add_date_text(message: Message, state: FSMContext):
    parsed = _parse_date(message.text)
    if not parsed:
        await message.answer("Не понял дату. Формат: ДД.ММ (например 25.07)")
        return
    await state.update_data(date=parsed.strftime("%Y-%m-%d"))
    await _ask_kind(message, state)


async def _ask_kind(message: Message, state: FSMContext):
    kb = InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(text="Обычная работа", callback_data="corr_kind:work"),
            InlineKeyboardButton(text="Дежурство", callback_data="corr_kind:dyzur"),
        ]]
    )
    await message.answer("Тип записи:", reply_markup=kb)
    await state.set_state(Correction.add_kind)


@router.callback_query(Correction.add_kind, F.data.startswith("corr_kind:"))
async def correction_add_kind(callback: CallbackQuery, state: FSMContext):
    kind = callback.data.split(":", 1)[1]
    await state.update_data(kind=kind)
    await callback.message.edit_text("Отделение:", reply_markup=department_keyboard("corr_dept"))
    await state.set_state(Correction.add_department)
    await callback.answer()


@router.callback_query(Correction.add_department, F.data.startswith("corr_dept:"))
async def correction_add_department(callback: CallbackQuery, state: FSMContext):
    dept = callback.data.split(":", 1)[1]
    await state.update_data(oddzial=dept)
    await callback.message.edit_text(f"Отделение: {dept}\n\nВремя начала (ЧЧ:ММ)?")
    await state.set_state(Correction.add_start)
    await callback.answer()


@router.message(Correction.add_start, F.text.regexp(TIME_RE))
async def correction_add_start_time(message: Message, state: FSMContext):
    await state.update_data(start_time=message.text.strip())
    await message.answer("Время окончания (ЧЧ:ММ)?")
    await state.set_state(Correction.add_end)


@router.message(Correction.add_start)
async def correction_add_start_invalid(message: Message):
    await message.answer("Формат времени: ЧЧ:ММ, например 09:00")


@router.message(Correction.add_end, F.text.regexp(TIME_RE))
async def correction_add_end_time(message: Message, state: FSMContext):
    data = await state.update_data(end_time=message.text.strip())
    year, month, day = map(int, data["date"].split("-"))
    sh, sm = map(int, data["start_time"].split(":"))
    eh, em = map(int, data["end_time"].split(":"))
    start_dt = datetime(year, month, day, sh, sm, tzinfo=TZ)
    end_dt = datetime(year, month, day, eh, em, tzinfo=TZ)
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
    await state.update_data(start_iso=start_dt.isoformat(), end_iso=end_dt.isoformat())

    kind_label = "Дежурство" if data["kind"] == "dyzur" else "Обычная работа"
    hours = round((end_dt - start_dt).total_seconds() / 3600, 2)
    kb = InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(text="✅ Да, добавить", callback_data="corr_confirm:yes"),
            InlineKeyboardButton(text="❌ Отмена", callback_data="corr_confirm:no"),
        ]]
    )
    await message.answer(
        f"Добавить запись?\n\n"
        f"{start_dt:%d.%m.%Y}, {kind_label}, {data['oddzial']}\n"
        f"{start_dt:%H:%M}–{end_dt:%H:%M} ({hours:.2f} ч)",
        reply_markup=kb,
    )
    await state.set_state(Correction.add_confirm)


@router.message(Correction.add_end)
async def correction_add_end_invalid(message: Message):
    await message.answer("Формат времени: ЧЧ:ММ, например 15:30")


@router.callback_query(Correction.add_confirm, F.data == "corr_confirm:yes")
async def correction_add_confirm_yes(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    start_dt = datetime.fromisoformat(data["start_iso"])
    end_dt = datetime.fromisoformat(data["end_iso"])
    entry = await db.add_manual_entry(data["kind"], data["oddzial"], start_dt, end_dt)
    await callback.message.edit_text(f"✅ Добавлено: {entry.hours:.2f} ч, {entry.oddzial}")
    await state.clear()
    await callback.answer()
    await on_shift_closed(callback.bot)


@router.callback_query(Correction.add_confirm, F.data == "corr_confirm:no")
async def correction_add_confirm_no(callback: CallbackQuery, state: FSMContext):
    await callback.message.edit_text("Отменено.")
    await state.clear()
    await callback.answer()


@router.callback_query(Correction.choosing_mode, F.data == "corr:edit")
async def correction_edit_start(callback: CallbackQuery, state: FSMContext):
    last = await db.get_last_entry()
    if not last:
        await callback.message.edit_text("Записей ещё нет.")
        await state.clear()
        await callback.answer()
        return
    await state.update_data(entry_id=last.id, orig_date=last.start_ts[:10])
    end_str = f"{last.end_dt:%H:%M}" if last.end_dt else "(не закрыта)"
    await callback.message.edit_text(
        f"Последняя запись:\n{last.start_ts[:10]}, {last.oddzial}, "
        f"{last.start_dt:%H:%M}–{end_str}\n\n"
        f"Новое время начала (ЧЧ:ММ), либо «-» чтобы не менять:"
    )
    await state.set_state(Correction.edit_start)
    await callback.answer()


@router.message(Correction.edit_start)
async def correction_edit_start_time(message: Message, state: FSMContext):
    text = message.text.strip()
    import re
    if text != "-" and not re.match(TIME_RE, text):
        await message.answer("Формат: ЧЧ:ММ или «-»")
        return
    await state.update_data(new_start=None if text == "-" else text)
    await message.answer("Новое время окончания (ЧЧ:ММ), либо «-» чтобы не менять:")
    await state.set_state(Correction.edit_end)


@router.message(Correction.edit_end)
async def correction_edit_end_time(message: Message, state: FSMContext):
    text = message.text.strip()
    import re
    if text != "-" and not re.match(TIME_RE, text):
        await message.answer("Формат: ЧЧ:ММ или «-»")
        return
    data = await state.update_data(new_end=None if text == "-" else text)

    year, month, day = map(int, data["orig_date"].split("-"))
    preview = []
    if data.get("new_start"):
        sh, sm = map(int, data["new_start"].split(":"))
        preview.append(f"начало → {sh:02d}:{sm:02d}")
    if data.get("new_end"):
        eh, em = map(int, data["new_end"].split(":"))
        preview.append(f"конец → {eh:02d}:{em:02d}")
    if not preview:
        await message.answer("Ничего не изменено.")
        await state.clear()
        return

    kb = InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(text="✅ Сохранить", callback_data="corr_edit_confirm:yes"),
            InlineKeyboardButton(text="❌ Отмена", callback_data="corr_edit_confirm:no"),
        ]]
    )
    await message.answer("Изменить: " + ", ".join(preview) + "?", reply_markup=kb)
    await state.set_state(Correction.edit_confirm)


@router.callback_query(Correction.edit_confirm, F.data == "corr_edit_confirm:yes")
async def correction_edit_confirm_yes(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    entry = await db.get_entry(data["entry_id"])
    year, month, day = map(int, data["orig_date"].split("-"))

    new_start_dt = entry.start_dt
    if data.get("new_start"):
        sh, sm = map(int, data["new_start"].split(":"))
        new_start_dt = datetime(year, month, day, sh, sm, tzinfo=TZ)

    new_end_dt = entry.end_dt
    if data.get("new_end"):
        eh, em = map(int, data["new_end"].split(":"))
        new_end_dt = datetime(year, month, day, eh, em, tzinfo=TZ)
        if new_end_dt <= new_start_dt:
            new_end_dt += timedelta(days=1)

    updated = await db.update_entry(
        entry.id,
        start_dt=new_start_dt if data.get("new_start") else None,
        end_dt=new_end_dt if data.get("new_end") else None,
    )
    hours_str = f"{updated.hours:.2f} ч" if updated.hours is not None else "не закрыта"
    await callback.message.edit_text(f"✅ Изменено: {updated.oddzial}, {hours_str}")
    await state.clear()
    await callback.answer()


@router.callback_query(Correction.edit_confirm, F.data == "corr_edit_confirm:no")
async def correction_edit_confirm_no(callback: CallbackQuery, state: FSMContext):
    await callback.message.edit_text("Отменено.")
    await state.clear()
    await callback.answer()


# ------------------------------------------------------------- restore ----

class Restore(StatesGroup):
    awaiting_file = State()
    confirm = State()


@router.message(Command("restore"))
async def cmd_restore(message: Message, state: FSMContext):
    if message.reply_to_message and message.reply_to_message.document:
        await _prepare_restore(message, state, message.reply_to_message.document)
        return
    await message.answer(
        "Пришлите файл work.db (например, из бэкапа, который бот отправлял сюда), "
        "и я предложу его восстановить."
    )
    await state.set_state(Restore.awaiting_file)


@router.message(Restore.awaiting_file, F.document)
async def restore_receive_file(message: Message, state: FSMContext):
    await _prepare_restore(message, state, message.document)


async def _prepare_restore(message: Message, state: FSMContext, document):
    dest = DATA_DIR / f"restore_upload_{document.file_unique_id}.db"
    await message.bot.download(document, destination=dest)
    await state.update_data(restore_path=str(dest))
    size_kb = dest.stat().st_size / 1024
    kb = InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(text="⚠️ Да, заменить базу", callback_data="restore:yes"),
            InlineKeyboardButton(text="❌ Отмена", callback_data="restore:no"),
        ]]
    )
    await message.answer(
        f"Файл получен ({size_kb:.0f} КБ).\n\n"
        "Текущая база будет сохранена рядом (на всякий случай), а эта станет основной. "
        "Продолжить?",
        reply_markup=kb,
    )
    await state.set_state(Restore.confirm)


@router.callback_query(Restore.confirm, F.data == "restore:yes")
async def restore_confirm_yes(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    safety_copy = await db.replace_database(data["restore_path"])
    await callback.message.edit_text(
        f"✅ База восстановлена. Предыдущая версия сохранена как {safety_copy.name}."
    )
    await state.clear()
    await callback.answer()


@router.callback_query(Restore.confirm, F.data == "restore:no")
async def restore_confirm_no(callback: CallbackQuery, state: FSMContext):
    await callback.message.edit_text("Отменено, база не изменена.")
    await state.clear()
    await callback.answer()


# --------------------------------------------------------- reminders ----

async def broadcast(bot: Bot, text: str, **kwargs):
    """Send the same message to every authorized chat_id (doctor + anyone else with access)."""
    for chat_id in ADMIN_CHAT_IDS:
        try:
            await bot.send_message(chat_id, text, **kwargs)
        except Exception:
            logger.exception("Failed to message chat_id=%s", chat_id)


async def remind_if_work_still_open(bot: Bot):
    open_e = await db.get_open_entry()
    if open_e and open_e.kind == "work":
        await broadcast(
            bot,
            f"Вы ещё на работе? Смена открыта с {open_e.start_dt:%H:%M}.\n"
            "Не забудьте нажать 🏁 Ушёл.",
        )


async def remind_if_dyzur_too_long(bot: Bot):
    open_e = await db.get_open_entry()
    if open_e and open_e.kind == "dyzur":
        elapsed_hours = (datetime.now(TZ) - open_e.start_dt).total_seconds() / 3600
        if elapsed_hours > 20:
            await broadcast(
                bot,
                f"Дежурство идёт уже {elapsed_hours:.1f} ч (с {open_e.start_dt:%d.%m %H:%M}).\n"
                "Если оно закончилось, не забудьте нажать 🏁 Ушёл.",
            )


async def daily_backup(bot: Bot):
    await backup.send_backup(bot, reason="ежедневный бэкап")


def setup_scheduler(bot: Bot) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=TZ)
    scheduler.add_job(
        remind_if_work_still_open, CronTrigger(hour=20, minute=0, timezone=TZ), args=[bot],
        id="evening_work_reminder", replace_existing=True,
    )
    scheduler.add_job(
        remind_if_dyzur_too_long, CronTrigger(hour=10, minute=0, timezone=TZ), args=[bot],
        id="morning_dyzur_reminder", replace_existing=True,
    )
    scheduler.add_job(
        daily_backup, CronTrigger(hour=23, minute=0, timezone=TZ), args=[bot],
        id="daily_backup", replace_existing=True,
    )
    scheduler.start()
    return scheduler


# ------------------------------------------------------------- errors ----

dp = Dispatcher(storage=MemoryStorage())
dp.include_router(public_router)
dp.include_router(router)


@dp.error()
async def error_handler(event: ErrorEvent):
    logger.exception("Unhandled error while processing update", exc_info=event.exception)
    update = event.update
    chat_message = update.message or (update.callback_query.message if update.callback_query else None)
    if chat_message:
        try:
            await chat_message.answer("Произошла ошибка, данные не потеряны. Попробуйте ещё раз.")
        except Exception:
            logger.exception("Failed to notify user about error")


async def main():
    await db.init_db()
    bot = Bot(token=BOT_TOKEN)
    await bot.delete_webhook(drop_pending_updates=True)
    if WEBAPP_URL:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="MedApp", web_app=WebAppInfo(url=WEBAPP_URL))
        )
    setup_scheduler(bot)
    logger.info("Bot starting, polling...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
