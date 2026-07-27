"""Validates Telegram Mini App `initData` per
https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
and checks the signed-in user against the same ADMIN_CHAT_IDS allowlist the bot uses,
so the Mini App and the bot share one authorization boundary.
"""

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from config import ADMIN_CHAT_IDS, BOT_TOKEN

MAX_AUTH_AGE_SECONDS = 24 * 3600


class InvalidInitData(Exception):
    pass


def _secret_key() -> bytes:
    return hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()


def validate_init_data(init_data: str) -> dict:
    """Returns the parsed `user` dict from initData if the signature is valid,
    fresh, and the user is in ADMIN_CHAT_IDS. Raises InvalidInitData otherwise."""
    if not init_data:
        raise InvalidInitData("empty init data")

    pairs = dict(parse_qsl(init_data, strict_parsing=False))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        raise InvalidInitData("missing hash")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    computed_hash = hmac.new(_secret_key(), data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed_hash, received_hash):
        raise InvalidInitData("signature mismatch")

    try:
        auth_date = int(pairs.get("auth_date", "0"))
    except ValueError:
        raise InvalidInitData("bad auth_date")
    if time.time() - auth_date > MAX_AUTH_AGE_SECONDS:
        raise InvalidInitData("stale init data")

    user_raw = pairs.get("user")
    if not user_raw:
        raise InvalidInitData("missing user")
    try:
        user = json.loads(user_raw)
    except json.JSONDecodeError:
        raise InvalidInitData("malformed user field")

    if str(user.get("id")) not in ADMIN_CHAT_IDS:
        raise InvalidInitData("user not authorized")

    return user
