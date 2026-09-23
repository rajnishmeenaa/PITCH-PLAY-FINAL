"""Tests for iteration 3: match_time on contests, entry blocking after match started."""
import os
import io
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_MOBILE = "9602341799"
ADMIN_PASSWORD = "admin123"


def _login(mobile, password):
    return requests.post(f"{API}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)


def _unique_mobile():
    return "9" + str(uuid.uuid4().int)[:9]


@pytest.fixture(scope="module")
def admin_headers():
    r = _login(ADMIN_MOBILE, ADMIN_PASSWORD)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def user_ctx(admin_headers):
    mobile = _unique_mobile()
    r = requests.post(f"{API}/admin/users", json={
        "name": "TEST_MtUser", "mobile": mobile, "password": "pass1234", "wallet_balance": 0
    }, headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    login = _login(mobile, "pass1234").json()
    yield {"id": uid, "mobile": mobile, "headers": {"Authorization": f"Bearer {login['token']}"}}
    requests.delete(f"{API}/admin/users/{uid}", headers=admin_headers, timeout=30)


def _create_contest(admin_headers, extra=None):
    payload = {
        "title": "TEST_MtC", "description": "", "external_link": "https://a.com",
        "entry_fee": 10, "prize_pool": 100, "max_participants": 10,
    }
    if extra:
        payload.update(extra)
    r = requests.post(f"{API}/contests", json=payload, headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


class TestMatchTimeCreateEdit:
    def test_create_contest_with_future_match_time(self, admin_headers):
        future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        c = _create_contest(admin_headers, {"title": "TEST_MtFuture", "match_time": future})
        assert c["match_time"] == future
        # verify persistence
        listing = requests.get(f"{API}/contests", headers=admin_headers, timeout=30).json()
        found = next(x for x in listing if x["id"] == c["id"])
        assert found["match_time"] == future
        requests.delete(f"{API}/contests/{c['id']}", headers=admin_headers, timeout=30)

    def test_create_contest_without_match_time(self, admin_headers):
        c = _create_contest(admin_headers, {"title": "TEST_MtNone"})
        assert c.get("match_time") is None
        requests.delete(f"{API}/contests/{c['id']}", headers=admin_headers, timeout=30)

    def test_patch_preserves_match_time_and_updates(self, admin_headers):
        future1 = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        future2 = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        c = _create_contest(admin_headers, {"title": "TEST_MtEdit", "match_time": future1})
        # patch other field, match_time preserved
        r = requests.patch(f"{API}/contests/{c['id']}", json={"title": "TEST_MtEdit2"},
                           headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["match_time"] == future1
        # update match_time
        r2 = requests.patch(f"{API}/contests/{c['id']}", json={"match_time": future2},
                            headers=admin_headers, timeout=30)
        assert r2.json()["match_time"] == future2
        requests.delete(f"{API}/contests/{c['id']}", headers=admin_headers, timeout=30)


class TestEntryMatchTimeBlock:
    def test_entry_blocked_when_match_started(self, admin_headers, user_ctx):
        past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        c = _create_contest(admin_headers, {"title": "TEST_MtPast", "match_time": past})
        files = {"screenshot": ("s.png", io.BytesIO(b"\x89PNG\r\n\x1a\nfake"), "image/png")}
        r = requests.post(f"{API}/entries",
                          data={"contest_id": c["id"], "utr": "1"},
                          files=files, headers=user_ctx["headers"], timeout=60)
        assert r.status_code == 400
        assert "match already started" in r.json()["detail"].lower() or "closed" in r.json()["detail"].lower()
        requests.delete(f"{API}/contests/{c['id']}", headers=admin_headers, timeout=30)

    def test_entry_allowed_future_match_time(self, admin_headers, user_ctx):
        future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        c = _create_contest(admin_headers, {"title": "TEST_MtFutOk", "match_time": future})
        files = {"screenshot": ("s.png", io.BytesIO(b"\x89PNG\r\n\x1a\nfake"), "image/png")}
        r = requests.post(f"{API}/entries",
                          data={"contest_id": c["id"], "utr": "1"},
                          files=files, headers=user_ctx["headers"], timeout=60)
        assert r.status_code == 200, r.text
        requests.delete(f"{API}/contests/{c['id']}", headers=admin_headers, timeout=30)

    def test_entry_allowed_no_match_time(self, admin_headers, user_ctx):
        c = _create_contest(admin_headers, {"title": "TEST_MtNoneOk"})
        files = {"screenshot": ("s.png", io.BytesIO(b"\x89PNG\r\n\x1a\nfake"), "image/png")}
        r = requests.post(f"{API}/entries",
                          data={"contest_id": c["id"], "utr": "1"},
                          files=files, headers=user_ctx["headers"], timeout=60)
        assert r.status_code == 200, r.text
        requests.delete(f"{API}/contests/{c['id']}", headers=admin_headers, timeout=30)
