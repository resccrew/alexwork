import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import httpx
import pytest

from config import ADMIN_CHAT_IDS, BOT_TOKEN
from webapp.main import app

DOCTOR_ID = int(next(iter(ADMIN_CHAT_IDS)))


def make_init_data(user_id: int = DOCTOR_ID) -> str:
    """Builds a validly-signed Telegram WebApp initData string for tests,
    mirroring what @telegram-apps/sdk would send from the client."""
    user = json.dumps({"id": user_id, "first_name": "Doc"}, separators=(",", ":"))
    pairs = {"auth_date": str(int(time.time())), "query_id": "AAtest", "user": user}
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    pairs["hash"] = computed_hash
    return urlencode(pairs)


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def auth_headers(user_id: int = DOCTOR_ID) -> dict:
    return {"Authorization": f"tma {make_init_data(user_id)}"}


async def test_rejects_missing_init_data(client):
    resp = await client.get("/api/me")
    assert resp.status_code == 401


async def test_rejects_unknown_user(client):
    resp = await client.get("/api/me", headers=auth_headers(user_id=999999999))
    assert resp.status_code == 401


async def test_me_returns_authorized_user(client):
    resp = await client.get("/api/me", headers=auth_headers())
    assert resp.status_code == 200
    assert resp.json()["id"] == DOCTOR_ID


async def test_status_null_when_no_open_shift(client):
    resp = await client.get("/api/status", headers=auth_headers())
    assert resp.status_code == 200
    assert resp.json() is None


async def test_start_then_stop_shift(client):
    start_resp = await client.post(
        "/api/shifts/start", json={"kind": "work", "oddzial": "Urologia"}, headers=auth_headers(),
    )
    assert start_resp.status_code == 200
    assert start_resp.json()["kind"] == "work"

    status_resp = await client.get("/api/status", headers=auth_headers())
    assert status_resp.json()["oddzial"] == "Urologia"

    stop_resp = await client.post("/api/shifts/stop", headers=auth_headers())
    assert stop_resp.status_code == 200
    assert stop_resp.json()["end"] is not None

    again = await client.post("/api/shifts/stop", headers=auth_headers())
    assert again.status_code == 404


async def test_cannot_start_twice(client):
    await client.post("/api/shifts/start", json={"kind": "work", "oddzial": "Urologia"}, headers=auth_headers())
    resp = await client.post("/api/shifts/start", json={"kind": "work", "oddzial": "Urologia"}, headers=auth_headers())
    assert resp.status_code == 409


async def test_create_edit_delete_shift(client):
    create_resp = await client.post(
        "/api/shifts",
        json={
            "kind": "dyzur", "oddzial": "Chirurgia Onk.",
            "start": "2026-07-09T19:00:00+02:00", "end": "2026-07-10T07:00:00+02:00",
        },
        headers=auth_headers(),
    )
    assert create_resp.status_code == 200
    body = create_resp.json()
    assert body["edited"] is True
    assert body["hours"] == pytest.approx(12.0)
    assert body["night_hours"] == pytest.approx(8.0)
    shift_id = body["id"]

    list_resp = await client.get("/api/shifts", params={"year": 2026, "month": 7}, headers=auth_headers())
    assert len(list_resp.json()) == 1

    patch_resp = await client.patch(
        f"/api/shifts/{shift_id}", json={"oddzial": "Urologia"}, headers=auth_headers(),
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["oddzial"] == "Urologia"

    del_resp = await client.delete(f"/api/shifts/{shift_id}", headers=auth_headers())
    assert del_resp.status_code == 204

    list_resp2 = await client.get("/api/shifts", params={"year": 2026, "month": 7}, headers=auth_headers())
    assert list_resp2.json() == []


async def test_summary_and_profile(client):
    await client.post(
        "/api/shifts",
        json={
            "kind": "work", "oddzial": "Urologia",
            "start": "2026-07-07T07:00:00+02:00", "end": "2026-07-07T15:00:00+02:00",
        },
        headers=auth_headers(),
    )
    profile_patch = await client.patch(
        "/api/profile", json={"rate": 60, "norm_hours": 4}, headers=auth_headers(),
    )
    assert profile_patch.status_code == 200
    assert profile_patch.json()["rate"] == 60

    summary_resp = await client.get("/api/summary", params={"year": 2026, "month": 7}, headers=auth_headers())
    data = summary_resp.json()
    assert data["total_hours"] == pytest.approx(8.0)
    assert data["overtime_hours"] == pytest.approx(4.0)
    assert data["earnings_simple"] == pytest.approx(480.0)
    assert len(data["days"]) == 1


async def test_report_returns_xlsx(client):
    await client.post(
        "/api/shifts",
        json={
            "kind": "work", "oddzial": "Urologia",
            "start": "2026-07-07T07:00:00+02:00", "end": "2026-07-07T15:00:00+02:00",
        },
        headers=auth_headers(),
    )
    resp = await client.get("/api/report", params={"year": 2026, "month": 7}, headers=auth_headers())
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/vnd.openxmlformats")
