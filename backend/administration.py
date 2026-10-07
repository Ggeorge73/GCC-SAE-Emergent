"""Firm administration: member roles, deactivation and plan seat limits.

Seats count active staff plus outstanding staff invitations. Client accounts
never use a seat.
"""
import time
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

try:
    from . import identity
except ImportError:
    import identity

SEAT_LIMITS = {"solo": 3, "practice": 50, "enterprise": None}
STAFF = sorted(identity.STAFF_ROLES)

router = APIRouter(prefix="/api")


async def seats_used(db, firm_id: str) -> int:
    staff = await db.users.count_documents({"firm_id": firm_id, "active": True, "role": {"$in": STAFF}})
    pending = await db.invites.count_documents({"firm_id": firm_id, "used": False, "role": {"$in": STAFF}, "expires_ts": {"$gt": time.time()}})
    return staff + pending


async def ensure_seat(db, firm_id: str):
    firm = await db.firms.find_one({"id": firm_id}, {"_id": 0}) or {}
    limit = SEAT_LIMITS.get(firm.get("plan", "solo"))
    if limit is not None and await seats_used(db, firm_id) >= limit:
        raise HTTPException(status_code=409, detail=f"All {limit} staff seats on the {firm.get('plan', 'solo')} plan are in use. Change plan or deactivate a member first.")


async def active_admins(db, firm_id: str) -> int:
    return await db.users.count_documents({"firm_id": firm_id, "role": "admin", "active": True})


class PlanChange(BaseModel):
    plan: Literal["solo", "practice", "enterprise"]


class MemberChange(BaseModel):
    role: Optional[Literal["admin", "partner", "associate", "paralegal"]] = None
    active: Optional[bool] = None


@router.get("/firm/plan")
async def get_plan(user: dict = Depends(identity.require("matter.read")), db=Depends(identity.get_db)):
    firm = await db.firms.find_one({"id": user["firm_id"]}, {"_id": 0}) or {}
    plan = firm.get("plan", "solo")
    return {"plan": plan, "seat_limit": SEAT_LIMITS[plan], "seats_used": await seats_used(db, user["firm_id"])}


@router.patch("/firm/plan")
async def change_plan(request: PlanChange, admin: dict = Depends(identity.require("firm.manage")), db=Depends(identity.get_db)):
    used = await seats_used(db, admin["firm_id"])
    limit = SEAT_LIMITS[request.plan]
    if limit is not None and used > limit:
        raise HTTPException(status_code=409, detail=f"The {request.plan} plan allows {limit} staff seats but {used} are in use.")
    await db.firms.update_one({"id": admin["firm_id"]}, {"$set": {"plan": request.plan}})
    return {"plan": request.plan, "seat_limit": limit, "seats_used": used}


@router.patch("/firm/members/{member_id}")
async def change_member(member_id: str, request: MemberChange, admin: dict = Depends(identity.require("firm.manage")), db=Depends(identity.get_db)):
    member = await db.users.find_one({"id": member_id, "firm_id": admin["firm_id"]}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found.")
    changes = request.model_dump(exclude_none=True)
    if member["role"] == "client" and "role" in changes:
        raise HTTPException(status_code=409, detail="Client accounts cannot be given staff roles.")
    losing_admin = member["role"] == "admin" and member.get("active", True) and (
        changes.get("role", "admin") != "admin" or changes.get("active") is False
    )
    if losing_admin and await active_admins(db, admin["firm_id"]) <= 1:
        raise HTTPException(status_code=409, detail="A firm needs at least one active admin.")
    if changes.get("active") is True and not member.get("active", True) and member["role"] != "client":
        await ensure_seat(db, admin["firm_id"])
    if changes:
        await db.users.update_one({"id": member_id}, {"$set": changes})
    if changes.get("active") is False:
        # Signing out everywhere at once; old tokens stop working on the next request.
        await identity.revoke_user_sessions(db, member_id)
    return identity.public_user({**member, **changes})
