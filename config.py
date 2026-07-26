import os
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# This machine has a stale SSL_CERT_FILE pointing at a drive that no longer exists
# (E:\sims\cacert.pem), which breaks TLS verification for aiohttp/pip/anything OpenSSL-based.
# Drop it here so the bot can always reach api.telegram.org regardless of that leftover
# environment variable; harmless no-op on any machine where it's unset or valid.
_bad_cert_file = os.environ.get("SSL_CERT_FILE")
if _bad_cert_file and not Path(_bad_cert_file).exists():
    os.environ.pop("SSL_CERT_FILE", None)

BOT_TOKEN = os.environ["BOT_TOKEN"]

# One or more Telegram chat_ids allowed to use the bot, comma-separated
# (e.g. "542407863,987654321" -- the doctor plus whoever else needs access).
# Everyone in this set shares the same data: one set of shifts/dyżury, one Excel.
ADMIN_CHAT_IDS = {x.strip() for x in os.environ.get("ADMIN_CHAT_ID", "").split(",") if x.strip()}

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
