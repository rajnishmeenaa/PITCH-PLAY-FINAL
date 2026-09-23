"""Tests for bug fix: contest external_link visibility to users based on entry status.

Scenarios:
- User with no entry: my_entry_status None, external_link None on GET /api/contests
- User with pending entry: my_entry_status 'pending', external_link None
- User with approved entry: my_entry_status 'approved', external_link present
- User with won entry: my_entry_status 'won', external_link present
- Admin: external_link always present
- GET /api/entries/mine: external_link attached for approved and won entries
- Rejected entry: my_entry_status None (no active entry), external_link None
"""
import io
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_MOBILE = "9602341799"
ADMIN_PW = "admin123"
USER_MOBILE = "7000000001"
USER_PW = "pass1234"

EXTERNAL_LINK = "https://example.com/play"


def _login(mobile, pw):
    r = requests.post(f"{API}/auth/login", json={"mobile": mobile, "password": pw}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_MOBILE, ADMIN_PW)


@pytest.fixture(scope="module")
def user_token():
    # Try login; if fails, create the admin-managed user
    r = requests.post(f"{API}/auth/login", json={"mobile": USER_MOBILE, "password": USER_PW}, timeout=15)
    if r.status_code != 200:
        admin = _login(ADMIN_MOBILE, ADMIN_PW)
        requests.post(
            f"{API}/admin/users",
            headers={"Authorization": f"Bearer {admin}"},
            json={"name": "Curl User", "mobile": USER_MOBILE, "password": USER_PW, "wallet_balance": 0},
            timeout=15,
        )
        r = requests.post(f"{API}/auth/login", json={"mobile": USER_MOBILE, "password": USER_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def contest_id(admin_token):
    payload = {
        "title": f"TEST_LinkBug_{int(time.time())}",
        "description": "Bug verification",
        "external_link": EXTERNAL_LINK,
        "entry_fee": 10,
        "prize_pool": 100,
        "max_participants": 100,
        # no match_time
    }
    r = requests.post(
        f"{API}/contests",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=payload,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    yield cid
    # cleanup at end - keep one open contest? task says leave at least one open contest.
    # Delete this specific TEST_ contest but only if another open contest exists.
    contests = requests.get(f"{API}/contests", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15).json()
    open_others = [c for c in contests if c["id"] != cid and c.get("status") == "open"]
    if open_others:
        requests.delete(f"{API}/contests/{cid}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)


def _get_contest(token, cid):
    r = requests.get(f"{API}/contests", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert r.status_code == 200
    for c in r.json():
        if c["id"] == cid:
            return c
    return None


# ---------- Tests ----------
def test_user_no_entry_hides_link(user_token, contest_id):
    c = _get_contest(user_token, contest_id)
    assert c is not None
    assert c.get("external_link") is None
    assert c.get("my_entry_status") is None


def test_admin_sees_link(admin_token, contest_id):
    c = _get_contest(admin_token, contest_id)
    assert c is not None
    assert c["external_link"] == EXTERNAL_LINK
    # admin does not have my_entry_status attached
    assert "my_entry_status" not in c or c.get("my_entry_status") is None


def test_user_pending_entry(user_token, contest_id):
    # Join contest with screenshot
    files = {"screenshot": ("s.png", io.BytesIO(b"\x89PNG\r\n\x1a\nfake"), "image/png")}
    data = {"contest_id": contest_id, "utr": "TESTUTR"}
    r = requests.post(
        f"{API}/entries",
        headers={"Authorization": f"Bearer {user_token}"},
        files=files, data=data, timeout=30,
    )
    assert r.status_code == 200, r.text
    entry_id = r.json()["id"]

    c = _get_contest(user_token, contest_id)
    assert c["my_entry_status"] == "pending"
    assert c["external_link"] is None

    # entries/mine should NOT contain external_link for pending
    r2 = requests.get(f"{API}/entries/mine", headers={"Authorization": f"Bearer {user_token}"}, timeout=15)
    assert r2.status_code == 200
    mine = [e for e in r2.json() if e["id"] == entry_id][0]
    assert mine["status"] == "pending"
    assert mine.get("external_link") is None
    pytest.entry_id = entry_id  # stash for next test


def test_user_approved_entry(admin_token, user_token, contest_id):
    entry_id = pytest.entry_id
    r = requests.post(
        f"{API}/entries/{entry_id}/decision",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"action": "approve"}, timeout=15,
    )
    assert r.status_code == 200, r.text

    c = _get_contest(user_token, contest_id)
    assert c["my_entry_status"] == "approved"
    assert c["external_link"] == EXTERNAL_LINK

    r2 = requests.get(f"{API}/entries/mine", headers={"Authorization": f"Bearer {user_token}"}, timeout=15)
    mine = [e for e in r2.json() if e["id"] == entry_id][0]
    assert mine["status"] == "approved"
    assert mine.get("external_link") == EXTERNAL_LINK


def test_user_won_entry(admin_token, user_token, contest_id):
    entry_id = pytest.entry_id
    r = requests.post(
        f"{API}/entries/{entry_id}/declare-winner",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"entry_id": entry_id, "prize_amount": 50}, timeout=15,
    )
    assert r.status_code == 200, r.text

    c = _get_contest(user_token, contest_id)
    assert c["my_entry_status"] == "won"
    assert c["external_link"] == EXTERNAL_LINK

    r2 = requests.get(f"{API}/entries/mine", headers={"Authorization": f"Bearer {user_token}"}, timeout=15)
    mine = [e for e in r2.json() if e["id"] == entry_id][0]
    assert mine["status"] == "won"
    assert mine.get("external_link") == EXTERNAL_LINK


def test_rejected_entry_allows_rejoin(admin_token, user_token):
    # Create a fresh contest for reject flow
    payload = {
        "title": f"TEST_LinkBugReject_{int(time.time())}",
        "description": "Reject flow",
        "external_link": EXTERNAL_LINK,
        "entry_fee": 5, "prize_pool": 50, "max_participants": 10,
    }
    r = requests.post(f"{API}/contests", headers={"Authorization": f"Bearer {admin_token}"}, json=payload, timeout=15)
    cid = r.json()["id"]

    files = {"screenshot": ("s.png", io.BytesIO(b"fakepng"), "image/png")}
    r = requests.post(f"{API}/entries",
                      headers={"Authorization": f"Bearer {user_token}"},
                      files=files, data={"contest_id": cid, "utr": "X"}, timeout=30)
    assert r.status_code == 200
    eid = r.json()["id"]

    # Reject
    r = requests.post(f"{API}/entries/{eid}/decision",
                      headers={"Authorization": f"Bearer {admin_token}"},
                      json={"action": "reject"}, timeout=15)
    assert r.status_code == 200

    # my_entry_status should be None for rejected (filter excludes 'rejected')
    c = _get_contest(user_token, cid)
    assert c["my_entry_status"] is None
    assert c["external_link"] is None

    # user should be able to join again
    files = {"screenshot": ("s.png", io.BytesIO(b"fakepng2"), "image/png")}
    r = requests.post(f"{API}/entries",
                      headers={"Authorization": f"Bearer {user_token}"},
                      files=files, data={"contest_id": cid, "utr": "X2"}, timeout=30)
    assert r.status_code == 200, r.text

    # cleanup
    requests.delete(f"{API}/contests/{cid}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
