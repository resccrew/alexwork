import os
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

BOT_TOKEN = os.environ["BOT_TOKEN"]
ADMIN_CHAT_ID = os.environ.get("ADMIN_CHAT_ID", "").strip()

DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "work.db"
LOG_PATH = DATA_DIR / "bot.log"

TZ = ZoneInfo("Europe/Warsaw")

DOCTOR_NAME = "Aliaksandr Pravorau"

DEPARTMENTS = [
    "Urologia",
    "Chirurgia Onk.",
    "Chirurgia Ogólna",
]

# Full name used in the Excel header line ("Oddział ...")
DEPARTMENTS_FULL_LINE = "Chirurgii Onkologicznej, Chirurgii Ogólnej, Urologii."

MONTH_NAMES_PL = {
    1: "styczeń", 2: "luty", 3: "marzec", 4: "kwiecień",
    5: "maj", 6: "czerwiec", 7: "lipiec", 8: "sierpień",
    9: "wrzesień", 10: "październik", 11: "listopad", 12: "grudzień",
}
