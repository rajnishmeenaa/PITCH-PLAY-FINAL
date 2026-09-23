"""Tests for iteration 2 features: contest edit (PATCH), wallet/history, winners board."""
import os
import io
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fee-contests.preview.emergentagent.com").rstrip("/")
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
        "name": "TEST_ItUser", "mobile": mobile, "password": "pass1234", "wallet_balance": 0
    }, headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    login = _login(mobile, "pass1234").json()
    yield {"id": uid, "mobile": mobile, "headers": {"Authorization": f"Bearer {login['token']}"}}
    requests.delete(f"{API}/admin/users/{uid}", headers=admin_headers, timeout=30)


# ---------- Contest PATCH edit ----------
class TestContestEdit:
    def test_patch_contest_updates_all_fields(self, admin_headers):
        # create
        r = requests.post(f"{API}/contests", json={
            "title": "TEST_ItContest", "description": "d", "external_link": "https://a.com",
            "entry_fee": 50, "prize_pool": 200, "max_participants": 10
        }, headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        # patch
        payload = {"title": "TEST_ItContestEdited", "external_link": "https://b.com",
                   "entry_fee": 75, "prize_pool": 500}
        r2 = requests.patch(f"{API}/contests/{cid}", json=payload, headers=admin_headers, timeout=30)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["title"] == "TEST_ItContestEdited"
        assert d["external_link"] == "https://b.com"
        assert d["entry_fee"] == 75
        assert d["prize_pool"] == 500

        # verify persistence via GET
        r3 = requests.get(f"{API}/contests", headers=admin_headers, timeout=30).json()
        found = [c for c in r3 if c["id"] == cid][0]
        assert found["title"] == "TEST_ItContestEdited"
        assert found["entry_fee"] == 75

        # cleanup
        requests.delete(f"{API}/contests/{cid}", headers=admin_headers, timeout=30)

    def test_patch_contest_404(self, admin_headers):
        r = requests.patch(f"{API}/contests/nonexistent-id", json={"title": "x"}, headers=admin_headers, timeout=30)
        assert r.status_code == 404

    def test_patch_contest_empty_400(self, admin_headers):
        r = requests.post(f"{API}/contests", json={
            "title": "TEST_E", "description": "", "external_link": "https://a.com",
            "entry_fee": 10, "prize_pool": 10, "max_participants": 10
        }, headers=admin_headers, timeout=30)
        cid = r.json()["id"]
        r2 = requests.patch(f"{API}/contests/{cid}", json={}, headers=admin_headers, timeout=30)
        assert r2.status_code == 400
        requests.delete(f"{API}/contests/{cid}", headers=admin_headers, timeout=30)

    def test_patch_contest_requires_admin(self, user_ctx, admin_headers):
        r = requests.post(f"{API}/contests", json={
            "title": "TEST_R", "description": "", "external_link": "https://a.com",
            "entry_fee": 10, "prize_pool": 10, "max_participants": 10
        }, headers=admin_headers, timeout=30)
        cid = r.json()["id"]
        r2 = requests.patch(f"{API}/contests/{cid}", json={"title": "x"}, headers=user_ctx["headers"], timeout=30)
        assert r2.status_code == 403
        requests.delete(f"{API}/contests/{cid}", headers=admin_headers, timeout=30)


# ---------- Winners board ----------
class TestWinnersBoard:
    def test_winners_no_mobile_and_sorted(self, admin_headers, user_ctx):
        # Create contest
        r = requests.post(f"{API}/contests", json={
            "title": "TEST_WinContest", "description": "", "external_link": "https://x.com",
            "entry_fee": 10, "prize_pool": 100, "max_participants": 10
        }, headers=admin_headers, timeout=30)
        cid = r.json()["id"]

        # user joins with screenshot
        files = {"screenshot": ("s.png", io.BytesIO(b"\x89PNG\r\n\x1a\nfake"), "image/png")}
        r2 = requests.post(f"{API}/entries",
                           data={"contest_id": cid, "utr": "12345"},
                           files=files, headers=user_ctx["headers"], timeout=60)
        assert r2.status_code == 200, r2.text
        eid = r2.json()["id"]

        # approve
        requests.post(f"{API}/entries/{eid}/decision", json={"action": "approve"}, headers=admin_headers, timeout=30)
        # declare winner
        requests.post(f"{API}/entries/{eid}/declare-winner",
                      json={"entry_id": eid, "prize_amount": 500}, headers=admin_headers, timeout=30)

        # GET /winners
        r3 = requests.get(f"{API}/winners", headers=user_ctx["headers"], timeout=30)
        assert r3.status_code == 200
        winners = r3.json()
        mine = [w for w in winners if w["id"] == eid]
        assert len(mine) == 1
        w = mine[0]
        # must NOT contain mobile
        assert "user_mobile" not in w
        assert "mobile" not in w
        assert w["winner_prize"] == 500
        assert w["contest_title"] == "TEST_WinContest"
        assert w["user_name"] == "TEST_ItUser"
        assert "won_at" in w

        # cleanup
        requests.delete(f"{API}/contests/{cid}", headers=admin_headers, timeout=30)


# ---------- Wallet history ----------
class TestWalletHistory:
    def test_wallet_history_merges_prize_payout_adjustments(self, admin_headers, user_ctx):
        uid = user_ctx["id"]
        # admin credit
        requests.post(f"{API}/admin/users/{uid}/wallet",
                      json={"amount": 300, "note": "TEST_credit"}, headers=admin_headers, timeout=30)
        # admin debit
        requests.post(f"{API}/admin/users/{uid}/wallet",
                      json={"amount": -50, "note": "TEST_debit"}, headers=admin_headers, timeout=30)

        # create withdrawal (deducts)
        rw = requests.post(f"{API}/withdrawals",
                           json={"amount": 20, "upi_id": "test@upi"},
                           headers=user_ctx["headers"], timeout=30)
        assert rw.status_code == 200, rw.text

        # get history
        rh = requests.get(f"{API}/wallet/history", headers=user_ctx["headers"], timeout=30)
        assert rh.status_code == 200
        items = rh.json()
        types = [i["type"] for i in items]
        assert "credit" in types
        assert "debit" in types
        assert "payout" in types

        # signs
        payouts = [i for i in items if i["type"] == "payout"]
        assert all(p["amount"] < 0 for p in payouts)
        credits = [i for i in items if i["type"] == "credit"]
        assert all(c["amount"] > 0 for c in credits)
        debits = [i for i in items if i["type"] == "debit"]
        assert all(d["amount"] < 0 for d in debits)

        # sorted desc by created_at
        dates = [i["created_at"] for i in items]
        assert dates == sorted(dates, reverse=True)
