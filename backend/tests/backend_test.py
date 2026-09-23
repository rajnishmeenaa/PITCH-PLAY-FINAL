"""Backend API tests for fantasy cricket contest platform."""
import os
import io
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fee-contests.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_MOBILE = "9602341799"
ADMIN_PASSWORD = "admin123"


# ---- helpers ----
def _login(mobile, password):
    r = requests.post(f"{API}/auth/login", json={"mobile": mobile, "password": password}, timeout=30)
    return r


def _admin_headers():
    r = _login(ADMIN_MOBILE, ADMIN_PASSWORD)
    assert r.status_code == 200, f"admin login failed: {r.text}"
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _unique_mobile():
    return "9" + str(uuid.uuid4().int)[:9]


@pytest.fixture(scope="module")
def admin_headers():
    return _admin_headers()


@pytest.fixture(scope="module")
def created_user(admin_headers):
    mobile = _unique_mobile()
    payload = {"name": "TEST_User1", "mobile": mobile, "password": "pass1234", "wallet_balance": 100}
    r = requests.post(f"{API}/admin/users", json=payload, headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    yield {"id": data["id"], "mobile": mobile, "password": "pass1234", "name": "TEST_User1"}
    requests.delete(f"{API}/admin/users/{data['id']}", headers=admin_headers, timeout=30)


# ---- Auth ----
class TestAuth:
    def test_admin_login(self):
        r = _login(ADMIN_MOBILE, ADMIN_PASSWORD)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "admin"
        assert d["token"]

    def test_login_invalid(self):
        r = _login(ADMIN_MOBILE, "wrongpw")
        assert r.status_code == 401

    def test_signup_and_login(self):
        m = _unique_mobile()
        r = requests.post(f"{API}/auth/signup", json={"name": "TEST_signup", "mobile": m, "password": "pw1234"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["user"]["mobile"] == m
        # duplicate
        r2 = requests.post(f"{API}/auth/signup", json={"name": "TEST_signup", "mobile": m, "password": "pw1234"}, timeout=30)
        assert r2.status_code == 400
        # cleanup via admin
        h = _admin_headers()
        uid = r.json()["user"]["id"]
        requests.delete(f"{API}/admin/users/{uid}", headers=h, timeout=30)


# ---- Admin user CRUD ----
class TestAdminUsers:
    def test_create_user_visible_in_list(self, admin_headers, created_user):
        r = requests.get(f"{API}/admin/users", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        ids = [u["id"] for u in r.json()]
        assert created_user["id"] in ids

    def test_duplicate_mobile_400(self, admin_headers, created_user):
        r = requests.post(f"{API}/admin/users", json={
            "name": "dup", "mobile": created_user["mobile"], "password": "pw1234"
        }, headers=admin_headers, timeout=30)
        assert r.status_code == 400

    def test_wallet_credit_debit(self, admin_headers, created_user):
        # credit
        r = requests.post(f"{API}/admin/users/{created_user['id']}/wallet",
                          json={"amount": 50, "note": "credit"}, headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["wallet_balance"] == 150
        # debit
        r = requests.post(f"{API}/admin/users/{created_user['id']}/wallet",
                          json={"amount": -30}, headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["wallet_balance"] == 120
        # overdraft
        r = requests.post(f"{API}/admin/users/{created_user['id']}/wallet",
                          json={"amount": -100000}, headers=admin_headers, timeout=30)
        assert r.status_code == 400

    def test_block_unblock(self, admin_headers, created_user):
        r = requests.post(f"{API}/admin/users/{created_user['id']}/block",
                          json={"blocked": True}, headers=admin_headers, timeout=30)
        assert r.status_code == 200
        # blocked login -> 403
        r2 = _login(created_user["mobile"], created_user["password"])
        assert r2.status_code == 403
        # unblock
        r = requests.post(f"{API}/admin/users/{created_user['id']}/block",
                          json={"blocked": False}, headers=admin_headers, timeout=30)
        assert r.status_code == 200
        r3 = _login(created_user["mobile"], created_user["password"])
        assert r3.status_code == 200

    def test_delete_nonexistent_user(self, admin_headers):
        r = requests.delete(f"{API}/admin/users/does-not-exist-{uuid.uuid4()}",
                            headers=admin_headers, timeout=30)
        assert r.status_code == 404

    def test_non_admin_forbidden(self):
        # signup a user then try admin endpoints
        m = _unique_mobile()
        s = requests.post(f"{API}/auth/signup", json={"name": "TEST_nonadmin", "mobile": m, "password": "pw1234"}, timeout=30)
        token = s.json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{API}/admin/users", headers=h, timeout=30)
        assert r.status_code == 403
        r = requests.post(f"{API}/admin/users", json={"name": "x", "mobile": _unique_mobile(), "password": "pw1234"}, headers=h, timeout=30)
        assert r.status_code == 403
        # cleanup
        ah = _admin_headers()
        requests.delete(f"{API}/admin/users/{s.json()['user']['id']}", headers=ah, timeout=30)


# ---- Payment settings ----
class TestPaymentSettings:
    def test_get_and_update_settings(self, admin_headers):
        # get
        r = requests.get(f"{API}/admin/payment-settings", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        original = r.json()
        # update
        new_upi = f"testupi{uuid.uuid4().hex[:6]}@okhdfc"
        payload = {"upi_id": new_upi, "payee_name": "TEST_Payee", "instructions": "Pay & upload SS"}
        r = requests.put(f"{API}/admin/payment-settings", json=payload, headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["upi_id"] == new_upi
        assert d["payee_name"] == "TEST_Payee"

    def test_wallet_config_reflects_settings(self, admin_headers):
        r = requests.get(f"{API}/wallet/config", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "admin_upi_id" in d
        assert "payee_name" in d
        assert "instructions" in d


# ---- End-to-end contest flow ----
class TestContestFlow:
    def test_full_flow(self, admin_headers):
        # signup user
        m = _unique_mobile()
        s = requests.post(f"{API}/auth/signup", json={"name": "TEST_flow", "mobile": m, "password": "pw1234"}, timeout=30)
        assert s.status_code == 200
        uid = s.json()["user"]["id"]
        utoken = s.json()["token"]
        uheaders = {"Authorization": f"Bearer {utoken}"}

        # admin creates contest
        r = requests.post(f"{API}/contests", json={
            "title": "TEST_Contest",
            "description": "d",
            "external_link": "https://example.com/game",
            "entry_fee": 50,
            "prize_pool": 500,
            "max_participants": 10,
        }, headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        contest_id = r.json()["id"]

        # user lists contests -> external_link is hidden
        r = requests.get(f"{API}/contests", headers=uheaders, timeout=30)
        assert r.status_code == 200
        c = next(x for x in r.json() if x["id"] == contest_id)
        assert c["external_link"] is None

        # user joins contest with screenshot
        files = {"screenshot": ("ss.png", io.BytesIO(b"\x89PNG\r\n\x1a\ntestdata"), "image/png")}
        data = {"contest_id": contest_id, "utr": "TESTUTR123"}
        r = requests.post(f"{API}/entries", data=data, files=files, headers=uheaders, timeout=60)
        assert r.status_code == 200, r.text
        entry_id = r.json()["id"]

        # admin approves
        r = requests.post(f"{API}/entries/{entry_id}/decision", json={"action": "approve"}, headers=admin_headers, timeout=30)
        assert r.status_code == 200 and r.json()["status"] == "approved"

        # user contests now include external_link
        r = requests.get(f"{API}/contests", headers=uheaders, timeout=30)
        c = next(x for x in r.json() if x["id"] == contest_id)
        assert c["external_link"] == "https://example.com/game"

        # declare winner
        r = requests.post(f"{API}/entries/{entry_id}/declare-winner",
                          json={"entry_id": entry_id, "prize_amount": 250}, headers=admin_headers, timeout=30)
        assert r.status_code == 200

        # wallet credited
        r = requests.get(f"{API}/auth/me", headers=uheaders, timeout=30)
        assert r.json()["wallet_balance"] == 250

        # withdrawal
        r = requests.post(f"{API}/withdrawals", json={"amount": 100, "upi_id": "test@upi"}, headers=uheaders, timeout=30)
        assert r.status_code == 200, r.text
        wid = r.json()["id"]

        r = requests.get(f"{API}/auth/me", headers=uheaders, timeout=30)
        assert r.json()["wallet_balance"] == 150

        # admin rejects -> refund
        r = requests.post(f"{API}/withdrawals/{wid}/decision", json={"action": "reject", "note": "test"}, headers=admin_headers, timeout=30)
        assert r.status_code == 200

        r = requests.get(f"{API}/auth/me", headers=uheaders, timeout=30)
        assert r.json()["wallet_balance"] == 250

        # withdrawal again + approve
        r = requests.post(f"{API}/withdrawals", json={"amount": 50, "upi_id": "test@upi"}, headers=uheaders, timeout=30)
        wid2 = r.json()["id"]
        r = requests.post(f"{API}/withdrawals/{wid2}/decision", json={"action": "approve"}, headers=admin_headers, timeout=30)
        assert r.status_code == 200

        # cleanup
        requests.delete(f"{API}/contests/{contest_id}", headers=admin_headers, timeout=30)
        requests.delete(f"{API}/admin/users/{uid}", headers=admin_headers, timeout=30)

        # user + entries + withdrawals removed
        r = requests.get(f"{API}/admin/users", headers=admin_headers, timeout=30)
        assert uid not in [u["id"] for u in r.json()]
