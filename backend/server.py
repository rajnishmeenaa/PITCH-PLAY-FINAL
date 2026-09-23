from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Header, Query
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import requests
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT / Admin config
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
JWT_EXP_DAYS = 30
ADMIN_MOBILE = os.environ['ADMIN_MOBILE']
ADMIN_PASSWORD = os.environ['ADMIN_PASSWORD']
ADMIN_UPI_ID = os.environ['ADMIN_UPI_ID']

# Storage
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = os.environ.get("APP_NAME", "fantasy-contest")
storage_key: Optional[str] = None


def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple[bytes, str]:
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------- Utility ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("blocked"):
        raise HTTPException(status_code=403, detail="Account blocked")
    return user


async def require_admin(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sanitize_user(u: dict, hide_mobile: bool = True) -> dict:
    out = {k: v for k, v in u.items() if k not in ("password_hash",)}
    if hide_mobile and out.get("role") != "admin":
        # For non-admin viewing themselves, we do show their own mobile — handled by caller.
        pass
    return out


# ---------- Models ----------
class SignupBody(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    mobile: str = Field(min_length=6, max_length=15)
    password: str = Field(min_length=4, max_length=100)


class LoginBody(BaseModel):
    mobile: str
    password: str


class ContestCreate(BaseModel):
    title: str
    description: str = ""
    external_link: str
    entry_fee: float
    prize_pool: float
    max_participants: int = 100
    match_time: Optional[str] = None  # ISO string


class ContestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    external_link: Optional[str] = None
    entry_fee: Optional[float] = None
    prize_pool: Optional[float] = None
    max_participants: Optional[int] = None
    match_time: Optional[str] = None
    status: Optional[str] = None  # "open", "closed", "completed"


class WithdrawalCreate(BaseModel):
    amount: float
    upi_id: str


class DeclareWinnerBody(BaseModel):
    entry_id: str
    prize_amount: float


class ApproveBody(BaseModel):
    action: str  # "approve" or "reject"
    note: Optional[str] = None


class AdminUserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    mobile: str = Field(min_length=6, max_length=15)
    password: str = Field(min_length=4, max_length=100)
    wallet_balance: float = 0.0


class WalletAdjustBody(BaseModel):
    amount: float  # positive = credit, negative = debit
    note: Optional[str] = None


class BlockBody(BaseModel):
    blocked: bool


class PaymentSettingsBody(BaseModel):
    upi_id: str = Field(min_length=3, max_length=100)
    payee_name: str = Field(default="", max_length=60)
    instructions: str = Field(default="", max_length=500)


async def get_payment_settings() -> dict:
    s = await db.settings.find_one({"key": "payment"}, {"_id": 0})
    if not s:
        s = {"key": "payment", "upi_id": ADMIN_UPI_ID, "payee_name": "Admin", "instructions": ""}
    return s


# ---------- Auth ----------
@api_router.post("/auth/signup")
async def signup(body: SignupBody):
    mobile = body.mobile.strip()
    existing = await db.users.find_one({"mobile": mobile})
    if existing:
        raise HTTPException(status_code=400, detail="Mobile already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "name": body.name.strip(),
        "mobile": mobile,
        "password_hash": hash_password(body.password),
        "role": "user",
        "wallet_balance": 0.0,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    token = create_token(user_id, "user")
    return {"token": token, "user": {"id": user_id, "name": doc["name"], "mobile": mobile, "role": "user", "wallet_balance": 0.0}}


@api_router.post("/auth/login")
async def login(body: LoginBody):
    mobile = body.mobile.strip()
    user = await db.users.find_one({"mobile": mobile}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid mobile or password")
    if user.get("blocked"):
        raise HTTPException(status_code=403, detail="Your account is blocked. Contact admin.")
    token = create_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "mobile": user["mobile"],
            "role": user["role"],
            "wallet_balance": user.get("wallet_balance", 0.0),
        },
    }


@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return {
        "id": user["id"],
        "name": user["name"],
        "mobile": user["mobile"],
        "role": user["role"],
        "wallet_balance": user.get("wallet_balance", 0.0),
    }


# ---------- Contests ----------
@api_router.get("/contests")
async def list_contests(user=Depends(get_current_user)):
    contests = await db.contests.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # For non-admin, hide external_link unless user has approved entry
    if user["role"] != "admin":
        approved_entries = await db.entries.find(
            {"user_id": user["id"], "status": "approved"}, {"_id": 0, "contest_id": 1}
        ).to_list(500)
        approved_ids = {e["contest_id"] for e in approved_entries}
        for c in contests:
            if c["id"] not in approved_ids:
                c["external_link"] = None
    # Attach participant counts
    for c in contests:
        c["participants_count"] = await db.entries.count_documents(
            {"contest_id": c["id"], "status": {"$in": ["approved", "pending"]}}
        )
    return contests


@api_router.post("/contests")
async def create_contest(body: ContestCreate, admin=Depends(require_admin)):
    doc = {
        "id": str(uuid.uuid4()),
        "title": body.title,
        "description": body.description,
        "external_link": body.external_link,
        "entry_fee": body.entry_fee,
        "prize_pool": body.prize_pool,
        "max_participants": body.max_participants,
        "match_time": body.match_time,
        "status": "open",
        "created_at": now_iso(),
        "created_by": admin["id"],
    }
    await db.contests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/contests/{contest_id}")
async def update_contest(contest_id: str, body: ContestUpdate, admin=Depends(require_admin)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await db.contests.update_one({"id": contest_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contest not found")
    contest = await db.contests.find_one({"id": contest_id}, {"_id": 0})
    return contest


@api_router.delete("/contests/{contest_id}")
async def delete_contest(contest_id: str, admin=Depends(require_admin)):
    await db.contests.delete_one({"id": contest_id})
    return {"ok": True}


# ---------- Entries (Join contest with UPI screenshot) ----------
@api_router.post("/entries")
async def create_entry(
    contest_id: str = Form(...),
    utr: str = Form(""),
    screenshot: UploadFile = File(...),
    user=Depends(get_current_user),
):
    if user["role"] == "admin":
        raise HTTPException(status_code=400, detail="Admin cannot join contests")
    contest = await db.contests.find_one({"id": contest_id}, {"_id": 0})
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")
    if contest.get("status") != "open":
        raise HTTPException(status_code=400, detail="Contest not open")
    # One entry per user per contest (unless previously rejected)
    existing = await db.entries.find_one(
        {"contest_id": contest_id, "user_id": user["id"], "status": {"$in": ["pending", "approved"]}}
    )
    if existing:
        raise HTTPException(status_code=400, detail="You already have an entry for this contest")

    data = await screenshot.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (>5MB)")
    ext = (screenshot.filename or "png").rsplit(".", 1)[-1].lower()
    if ext not in {"png", "jpg", "jpeg", "webp"}:
        ext = "png"
    path = f"{APP_NAME}/screenshots/{user['id']}/{uuid.uuid4()}.{ext}"
    try:
        result = put_object(path, data, screenshot.content_type or "image/png")
    except Exception as e:
        logger.exception("Upload failed")
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

    entry_id = str(uuid.uuid4())
    doc = {
        "id": entry_id,
        "contest_id": contest_id,
        "contest_title": contest["title"],
        "user_id": user["id"],
        "user_name": user["name"],
        "user_mobile": user["mobile"],
        "entry_fee": contest["entry_fee"],
        "utr": utr,
        "screenshot_path": result["path"],
        "screenshot_content_type": screenshot.content_type or "image/png",
        "status": "pending",
        "winner_prize": 0.0,
        "created_at": now_iso(),
    }
    await db.entries.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/entries/mine")
async def my_entries(user=Depends(get_current_user)):
    items = await db.entries.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Attach external link if approved
    for it in items:
        if it["status"] == "approved":
            c = await db.contests.find_one({"id": it["contest_id"]}, {"_id": 0})
            it["external_link"] = c.get("external_link") if c else None
    return items


@api_router.get("/entries")
async def all_entries(status: Optional[str] = None, admin=Depends(require_admin)):
    q = {}
    if status:
        q["status"] = status
    items = await db.entries.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api_router.post("/entries/{entry_id}/decision")
async def approve_entry(entry_id: str, body: ApproveBody, admin=Depends(require_admin)):
    entry = await db.entries.find_one({"id": entry_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Entry already {entry['status']}")
    new_status = "approved" if body.action == "approve" else "rejected"
    await db.entries.update_one(
        {"id": entry_id},
        {"$set": {"status": new_status, "decision_note": body.note or "", "decided_at": now_iso()}},
    )
    return {"ok": True, "status": new_status}


@api_router.post("/entries/{entry_id}/declare-winner")
async def declare_winner(entry_id: str, body: DeclareWinnerBody, admin=Depends(require_admin)):
    entry = await db.entries.find_one({"id": entry_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry["status"] != "approved":
        raise HTTPException(status_code=400, detail="Entry must be approved first")
    if body.prize_amount <= 0:
        raise HTTPException(status_code=400, detail="Prize must be positive")
    await db.entries.update_one(
        {"id": entry_id},
        {"$set": {"status": "won", "winner_prize": body.prize_amount, "won_at": now_iso()}},
    )
    # Credit to user wallet
    await db.users.update_one(
        {"id": entry["user_id"]},
        {"$inc": {"wallet_balance": body.prize_amount}},
    )
    return {"ok": True}


# ---------- Wallet & Withdrawals ----------
@api_router.get("/wallet/config")
async def wallet_config(user=Depends(get_current_user)):
    s = await get_payment_settings()
    return {"admin_upi_id": s["upi_id"], "payee_name": s.get("payee_name", ""), "instructions": s.get("instructions", "")}


@api_router.get("/admin/payment-settings")
async def admin_get_payment_settings(admin=Depends(require_admin)):
    return await get_payment_settings()


@api_router.put("/admin/payment-settings")
async def admin_put_payment_settings(body: PaymentSettingsBody, admin=Depends(require_admin)):
    doc = {"key": "payment", "upi_id": body.upi_id.strip(), "payee_name": body.payee_name.strip(),
           "instructions": body.instructions.strip(), "updated_at": now_iso()}
    await db.settings.update_one({"key": "payment"}, {"$set": doc}, upsert=True)
    return doc


@api_router.post("/withdrawals")
async def create_withdrawal(body: WithdrawalCreate, user=Depends(get_current_user)):
    if user["role"] == "admin":
        raise HTTPException(status_code=400, detail="Admin cannot request withdrawal")
    balance = user.get("wallet_balance", 0.0)
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if body.amount > balance:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance")
    # Deduct immediately (held) — refund on rejection
    await db.users.update_one({"id": user["id"]}, {"$inc": {"wallet_balance": -body.amount}})
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user["name"],
        "user_mobile": user["mobile"],
        "amount": body.amount,
        "upi_id": body.upi_id,
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.withdrawals.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/withdrawals/mine")
async def my_withdrawals(user=Depends(get_current_user)):
    items = await db.withdrawals.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api_router.get("/withdrawals")
async def list_withdrawals(status: Optional[str] = None, admin=Depends(require_admin)):
    q = {}
    if status:
        q["status"] = status
    items = await db.withdrawals.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api_router.post("/withdrawals/{wid}/decision")
async def decide_withdrawal(wid: str, body: ApproveBody, admin=Depends(require_admin)):
    w = await db.withdrawals.find_one({"id": wid})
    if not w:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Already {w['status']}")
    if body.action == "approve":
        await db.withdrawals.update_one(
            {"id": wid},
            {"$set": {"status": "paid", "decision_note": body.note or "", "decided_at": now_iso()}},
        )
    else:
        # refund
        await db.users.update_one({"id": w["user_id"]}, {"$inc": {"wallet_balance": w["amount"]}})
        await db.withdrawals.update_one(
            {"id": wid},
            {"$set": {"status": "rejected", "decision_note": body.note or "", "decided_at": now_iso()}},
        )
    return {"ok": True}


# ---------- Admin: users ----------
@api_router.get("/admin/users")
async def admin_users(admin=Depends(require_admin)):
    users = await db.users.find({"role": "user"}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    for u in users:
        u["entries_count"] = await db.entries.count_documents({"user_id": u["id"]})
        u["total_won"] = 0
        cur = db.entries.find({"user_id": u["id"], "status": "won"}, {"_id": 0, "winner_prize": 1})
        async for e in cur:
            u["total_won"] += e.get("winner_prize", 0)
    return users


@api_router.post("/admin/users")
async def admin_create_user(body: AdminUserCreate, admin=Depends(require_admin)):
    mobile = body.mobile.strip()
    if await db.users.find_one({"mobile": mobile}):
        raise HTTPException(status_code=400, detail="Mobile already registered")
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "mobile": mobile,
        "password_hash": hash_password(body.password),
        "role": "user",
        "wallet_balance": float(body.wallet_balance),
        "blocked": False,
        "created_by_admin": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id, "role": "user"})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.delete_one({"id": user_id})
    await db.entries.delete_many({"user_id": user_id})
    await db.withdrawals.delete_many({"user_id": user_id})
    return {"ok": True}


@api_router.post("/admin/users/{user_id}/block")
async def admin_block_user(user_id: str, body: BlockBody, admin=Depends(require_admin)):
    res = await db.users.update_one({"id": user_id, "role": "user"}, {"$set": {"blocked": body.blocked}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "blocked": body.blocked}


@api_router.post("/admin/users/{user_id}/wallet")
async def admin_adjust_wallet(user_id: str, body: WalletAdjustBody, admin=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id, "role": "user"}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if body.amount == 0:
        raise HTTPException(status_code=400, detail="Amount cannot be zero")
    new_balance = u.get("wallet_balance", 0.0) + body.amount
    if new_balance < 0:
        raise HTTPException(status_code=400, detail="Balance cannot go negative")
    await db.users.update_one({"id": user_id}, {"$set": {"wallet_balance": new_balance}})
    await db.wallet_logs.insert_one({
        "id": str(uuid.uuid4()), "user_id": user_id, "amount": body.amount,
        "note": body.note or "", "by": admin["id"], "created_at": now_iso(),
    })
    return {"ok": True, "wallet_balance": new_balance}


@api_router.get("/admin/stats")
async def admin_stats(admin=Depends(require_admin)):
    total_users = await db.users.count_documents({"role": "user"})
    total_contests = await db.contests.count_documents({})
    pending_entries = await db.entries.count_documents({"status": "pending"})
    pending_withdrawals = await db.withdrawals.count_documents({"status": "pending"})
    return {
        "total_users": total_users,
        "total_contests": total_contests,
        "pending_entries": pending_entries,
        "pending_withdrawals": pending_withdrawals,
    }


# ---------- Files (image serve for admin/user) ----------
@api_router.get("/files")
async def serve_file(path: str = Query(...), user=Depends(get_current_user)):
    # Any authenticated user can view their own screenshots; admin can view all.
    # Since entries store screenshot_path, allow if user is admin OR path startswith user id folder.
    if user["role"] != "admin":
        expected_prefix = f"{APP_NAME}/screenshots/{user['id']}/"
        if not path.startswith(expected_prefix):
            raise HTTPException(status_code=403, detail="Forbidden")
    try:
        data, content_type = get_object(path)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Not found: {e}")
    return Response(content=data, media_type=content_type)


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    # Seed admin
    admin = await db.users.find_one({"mobile": ADMIN_MOBILE})
    if not admin:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "name": "Admin",
            "mobile": ADMIN_MOBILE,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "wallet_balance": 0.0,
            "created_at": now_iso(),
        })
        logger.info("Admin user seeded")
    else:
        # Ensure role is admin (idempotent)
        await db.users.update_one({"mobile": ADMIN_MOBILE}, {"$set": {"role": "admin"}})
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
