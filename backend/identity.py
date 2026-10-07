"""Firm accounts, password sign-in, revocable sessions and role permissions.

Every authenticated record is scoped by the firm id stored on the session, never by
a firm id supplied in a request body.
"""
import base64
import hashlib
import hmac
import os
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, StringConstraints
from pymongo.errors import DuplicateKeyError

ROLES = ("admin", "partner", "associate", "paralegal", "client")
STAFF_ROLES = frozenset(ROLES) - {"client"}
PLANS = ("solo", "practice", "enterprise")

# One table decides who may do what; endpoints only name the permission they need.
PERMISSIONS = {
    "firm.manage": {"admin"},
    "member.invite": {"admin", "partner"},
    "session.revoke": {"admin"},
    "matter.create": {"admin", "partner", "associate"},
    "matter.read": STAFF_ROLES,
    "matter.work": STAFF_ROLES,
    "matter.approve": {"admin", "partner"},
    "matter.wall": {"admin", "partner"},
    "portal.read": {"client"},
}

# Routes under these prefixes enforce sessions themselves, so they bypass the
# loopback-only gate that still protects the legacy unauthenticated endpoints.
AUTHENTICATED_PREFIXES = ("/api/auth/", "/api/firm/")

SESSION_SECONDS = int(float(os.environ.get("LAW_SUITE_SESSION_HOURS", "12")) * 3600)
MIN_PASSWORD_LENGTH = 8

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Email = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
Password = Annotated[str, StringConstraints(min_length=MIN_PASSWORD_LENGTH, max_length=256)]

_database = None


def bind(database):
    global _database
    _database = database


def get_db():
    return _database


def can(role: str, permission: str) -> bool:
    return role in PERMISSIONS.get(permission, ())


# ============== PASSWORDS AND TOKENS ==============

_SCRYPT = {"n": 2**14, "r": 8, "p": 1}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, dklen=32, **_SCRYPT)
    return "scrypt${n}${r}${p}${salt}${digest}".format(
        **_SCRYPT,
        salt=base64.b64encode(salt).decode(),
        digest=base64.b64encode(digest).decode(),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
        if scheme != "scrypt":
            return False
        candidate = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), dklen=32, n=int(n), r=int(r), p=int(p))
        return hmac.compare_digest(candidate, base64.b64decode(digest))
    except (ValueError, TypeError):
        return False


# Verified against when the email is unknown so both failure paths cost the same.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def public_user(user: dict) -> dict:
    return {key: user.get(key) for key in ("id", "firm_id", "name", "email", "role", "active")}


def public_firm(firm: dict) -> dict:
    return {key: firm.get(key) for key in ("id", "name", "plan")}


async def start_session(db, user: dict) -> str:
    token = secrets.token_urlsafe(32)
    issued = time.time()
    await db.sessions.insert_one({
        "id": str(uuid.uuid4()),
        "token_hash": token_digest(token),
        "user_id": user["id"],
        "firm_id": user["firm_id"],
        "issued_ts": issued,
        "expires_ts": issued + SESSION_SECONDS,
        "revoked": False,
    })
    return token


async def revoke_user_sessions(db, user_id: str) -> int:
    result = await db.sessions.update_many({"user_id": user_id, "revoked": False}, {"$set": {"revoked": True}})
    return result.modified_count


async def ensure_indexes(db):
    await db.users.create_index("email", unique=True)
    await db.sessions.create_index("token_hash", unique=True)


# ============== DEPENDENCIES ==============

UNAUTHENTICATED = HTTPException(status_code=401, detail="Sign in to continue.", headers={"WWW-Authenticate": "Bearer"})


async def current_session(authorization: Optional[str] = Header(default=None), db=Depends(get_db)) -> dict:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise UNAUTHENTICATED
    session = await db.sessions.find_one({"token_hash": token_digest(token.strip())}, {"_id": 0})
    if not session or session.get("revoked") or session.get("expires_ts", 0) < time.time():
        raise UNAUTHENTICATED
    user = await db.users.find_one({"id": session["user_id"], "firm_id": session["firm_id"]}, {"_id": 0})
    if not user or not user.get("active", True):
        raise UNAUTHENTICATED
    return {"session": session, "user": user}


async def current_user(context: dict = Depends(current_session)) -> dict:
    return context["user"]


def require(permission: str):
    async def check(user: dict = Depends(current_user)) -> dict:
        if not can(user["role"], permission):
            raise HTTPException(status_code=403, detail="Your role does not allow this action.")
        return user
    return check


# ============== ROUTES ==============

class SignupRequest(BaseModel):
    firm_name: Name
    name: Name
    email: Email
    password: Password
    plan: Literal["solo", "practice", "enterprise"] = "solo"


class LoginRequest(BaseModel):
    email: Email
    password: Annotated[str, StringConstraints(min_length=1, max_length=256)]


router = APIRouter(prefix="/api")


@router.post("/auth/signup", status_code=201)
async def signup(request: SignupRequest, db=Depends(get_db)):
    """Create a firm and its first user, who administers the firm."""
    if await db.users.find_one({"email": request.email}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    firm = {"id": str(uuid.uuid4()), "name": request.firm_name, "plan": request.plan, "created_at": now_iso()}
    user = {
        "id": str(uuid.uuid4()),
        "firm_id": firm["id"],
        "name": request.name,
        "email": request.email,
        "password_hash": hash_password(request.password),
        "role": "admin",
        "active": True,
        "created_at": now_iso(),
    }
    try:
        await db.users.insert_one(dict(user))
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    await db.firms.insert_one(dict(firm))
    token = await start_session(db, user)
    return {"token": token, "user": public_user(user), "firm": public_firm(firm)}


@router.post("/auth/login")
async def login(request: LoginRequest, db=Depends(get_db)):
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    valid = verify_password(request.password, user["password_hash"] if user else _DUMMY_HASH)
    if not user or not valid or not user.get("active", True):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    firm = await db.firms.find_one({"id": user["firm_id"]}, {"_id": 0})
    token = await start_session(db, user)
    return {"token": token, "user": public_user(user), "firm": public_firm(firm or {})}


@router.post("/auth/logout")
async def logout(context: dict = Depends(current_session), db=Depends(get_db)):
    await db.sessions.update_one({"id": context["session"]["id"]}, {"$set": {"revoked": True}})
    return {"signed_out": True}


@router.get("/auth/me")
async def me(user: dict = Depends(current_user), db=Depends(get_db)):
    firm = await db.firms.find_one({"id": user["firm_id"]}, {"_id": 0})
    return {"user": public_user(user), "firm": public_firm(firm or {})}


@router.post("/firm/members/{user_id}/revoke-sessions")
async def revoke_member_sessions(user_id: str, admin: dict = Depends(require("session.revoke")), db=Depends(get_db)):
    """Sign a member out everywhere. Members of other firms are reported as not found."""
    member = await db.users.find_one({"id": user_id, "firm_id": admin["firm_id"]}, {"_id": 0, "id": 1})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found.")
    return {"revoked": await revoke_user_sessions(db, user_id)}
