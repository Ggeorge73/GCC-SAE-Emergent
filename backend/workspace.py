"""Shared firm workspace: colleague invitations, matters, ethical walls and tasks.

Every lookup is filtered by the firm on the caller's session. A matter the caller
may not open is reported as not found, so its existence is never revealed.
"""
import secrets
import time
import uuid
from datetime import date
from typing import Annotated, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, StringConstraints
from pymongo.errors import DuplicateKeyError

try:
    from . import identity
    from .administration import ensure_seat
except ImportError:
    import identity
    from administration import ensure_seat

INVITE_SECONDS = 7 * 24 * 3600
STAFF_ROLE = Literal["admin", "partner", "associate", "paralegal"]
TASK_STATUS = Literal["to do", "in progress", "done"]

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=250)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)]

router = APIRouter(prefix="/api")
NOT_FOUND = HTTPException(status_code=404, detail="Matter not found.")


async def record(db, user: dict, matter_id: str, action: str, detail: str = ""):
    """Append-only activity entry written by the server, never by the browser."""
    await db.activity.insert_one({
        "id": str(uuid.uuid4()),
        "firm_id": user["firm_id"],
        "matter_id": matter_id,
        "actor_id": user["id"],
        "actor_name": user["name"],
        "action": action,
        "detail": detail,
        "at": identity.now_iso(),
    })


async def notify(db, firm_id: str, user_ids, actor: dict, matter_id: str, kind: str, text: str):
    """Personal inbox entries. Nobody is notified about their own action."""
    for user_id in {u for u in user_ids if u and u != actor["id"]}:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "firm_id": firm_id,
            "user_id": user_id,
            "matter_id": matter_id,
            "kind": kind,
            "text": text,
            "actor_name": actor["name"],
            "read": False,
            "created_at": identity.now_iso(),
        })


def visible_query(user: dict) -> dict:
    """Matters this user may open: same firm, not walled, and a member unless admin."""
    query = {"firm_id": user["firm_id"], "walled_ids": {"$nin": [user["id"]]}}
    if user["role"] != "admin":
        query["member_ids"] = user["id"]
    return query


async def load_matter(db, user: dict, matter_id: str) -> dict:
    if user["role"] not in identity.STAFF_ROLES:
        raise NOT_FOUND
    matter = await db.matters.find_one({**visible_query(user), "id": matter_id}, {"_id": 0})
    if not matter:
        raise NOT_FOUND
    return matter


async def firm_member(db, firm_id: str, user_id: str, staff_only: bool = True) -> dict:
    member = await db.users.find_one({"id": user_id, "firm_id": firm_id, "active": True}, {"_id": 0})
    if not member or (staff_only and member["role"] not in identity.STAFF_ROLES):
        raise HTTPException(status_code=404, detail="Member not found.")
    return member


def public_matter(matter: dict, viewer: dict) -> dict:
    shown = {k: matter.get(k) for k in ("id", "name", "client_name", "practice_area", "jurisdiction", "status", "responsible_id", "member_ids", "created_at", "updated_at")}
    # Only people who manage walls see who is walled.
    if identity.can(viewer["role"], "matter.wall"):
        shown["walled_ids"] = matter.get("walled_ids", [])
    return shown


# ============== FIRM DIRECTORY AND INVITATIONS ==============

class InviteRequest(BaseModel):
    name: Text
    email: identity.Email
    role: STAFF_ROLE


class JoinRequest(BaseModel):
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=8, max_length=100)]
    password: identity.Password


@router.get("/firm/members")
async def list_members(user: dict = Depends(identity.require("matter.read")), db=Depends(identity.get_db)):
    members = await db.users.find({"firm_id": user["firm_id"]}, {"_id": 0}).sort("name", 1).to_list(500)
    return [identity.public_user(m) for m in members]


@router.post("/firm/invites", status_code=201)
async def invite_member(request: InviteRequest, user: dict = Depends(identity.require("member.invite")), db=Depends(identity.get_db)):
    if request.role == "admin" and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only an admin can invite another admin.")
    if await db.users.find_one({"email": request.email}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    await ensure_seat(db, user["firm_id"])
    code = secrets.token_urlsafe(12)
    invite = {
        "id": str(uuid.uuid4()),
        "firm_id": user["firm_id"],
        "name": request.name,
        "email": request.email,
        "role": request.role,
        "code_hash": identity.token_digest(code),
        "expires_ts": time.time() + INVITE_SECONDS,
        "used": False,
        "invited_by": user["id"],
        "created_at": identity.now_iso(),
    }
    await db.invites.insert_one(dict(invite))
    # The code is shown once to the inviter; only its digest is stored.
    return {"code": code, "invite": {k: invite[k] for k in ("id", "name", "email", "role")}}


@router.post("/auth/join", status_code=201)
async def join_firm(request: JoinRequest, db=Depends(identity.get_db)):
    invite = await db.invites.find_one({"code_hash": identity.token_digest(request.code)}, {"_id": 0})
    if not invite or invite["used"] or invite["expires_ts"] < time.time():
        raise HTTPException(status_code=400, detail="This invitation code is not valid. Ask your firm for a new one.")
    claimed = await db.invites.update_one({"id": invite["id"], "used": False}, {"$set": {"used": True}})
    if not claimed.modified_count:
        raise HTTPException(status_code=400, detail="This invitation code is not valid. Ask your firm for a new one.")
    user = {
        "id": str(uuid.uuid4()),
        "firm_id": invite["firm_id"],
        "name": invite["name"],
        "email": invite["email"],
        "password_hash": identity.hash_password(request.password),
        "role": invite["role"],
        "active": True,
        "created_at": identity.now_iso(),
    }
    try:
        await db.users.insert_one(dict(user))
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    for matter_id in invite.get("matter_ids", []):
        await db.matters.update_one({"id": matter_id, "firm_id": user["firm_id"]}, {"$addToSet": {"client_ids": user["id"]}})
    firm = await db.firms.find_one({"id": user["firm_id"]}, {"_id": 0})
    token = await identity.start_session(db, user)
    return {"token": token, "user": identity.public_user(user), "firm": identity.public_firm(firm or {})}


# ============== MATTERS ==============

class MatterCreate(BaseModel):
    name: Text
    client_name: Text
    practice_area: Optional[Text] = None
    jurisdiction: Optional[Text] = None


class MatterUpdate(BaseModel):
    name: Optional[Text] = None
    client_name: Optional[Text] = None
    practice_area: Optional[Text] = None
    jurisdiction: Optional[Text] = None
    status: Optional[Literal["open", "on hold", "closed"]] = None
    responsible_id: Optional[str] = None


class MemberRequest(BaseModel):
    user_id: str


class WallRequest(BaseModel):
    user_id: str
    reason: Text


@router.get("/firm/matters")
async def list_matters(user: dict = Depends(identity.require("matter.read")), db=Depends(identity.get_db)):
    matters = await db.matters.find(visible_query(user), {"_id": 0}).sort("updated_at", -1).to_list(500)
    return [public_matter(m, user) for m in matters]


@router.post("/firm/matters", status_code=201)
async def create_matter(request: MatterCreate, user: dict = Depends(identity.require("matter.create")), db=Depends(identity.get_db)):
    now = identity.now_iso()
    matter = {
        "id": str(uuid.uuid4()),
        "firm_id": user["firm_id"],
        **request.model_dump(),
        "status": "open",
        "responsible_id": user["id"],
        "member_ids": [user["id"]],
        "walled_ids": [],
        "client_ids": [],
        "created_by": user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.matters.insert_one(dict(matter))
    await record(db, user, matter["id"], "matter.opened", matter["name"])
    return public_matter(matter, user)


@router.get("/firm/matters/{matter_id}")
async def get_matter(matter_id: str, user: dict = Depends(identity.require("matter.read")), db=Depends(identity.get_db)):
    return public_matter(await load_matter(db, user, matter_id), user)


@router.patch("/firm/matters/{matter_id}")
async def update_matter(matter_id: str, request: MatterUpdate, user: dict = Depends(identity.require("matter.work")), db=Depends(identity.get_db)):
    matter = await load_matter(db, user, matter_id)
    changes = request.model_dump(exclude_none=True)
    if "responsible_id" in changes and changes["responsible_id"] not in matter["member_ids"]:
        raise HTTPException(status_code=422, detail="The responsible lawyer must be a member of the matter.")
    if not changes:
        return public_matter(matter, user)
    changes["updated_at"] = identity.now_iso()
    await db.matters.update_one({"id": matter_id, "firm_id": user["firm_id"]}, {"$set": changes})
    await record(db, user, matter_id, "matter.updated", ", ".join(sorted(k for k in changes if k != "updated_at")))
    return public_matter({**matter, **changes}, user)


@router.post("/firm/matters/{matter_id}/members")
async def add_member(matter_id: str, request: MemberRequest, user: dict = Depends(identity.require("matter.create")), db=Depends(identity.get_db)):
    matter = await load_matter(db, user, matter_id)
    member = await firm_member(db, user["firm_id"], request.user_id)
    if member["id"] in matter.get("walled_ids", []):
        raise HTTPException(status_code=409, detail="This person is walled off this matter.")
    await db.matters.update_one({"id": matter_id}, {"$addToSet": {"member_ids": member["id"]}, "$set": {"updated_at": identity.now_iso()}})
    await record(db, user, matter_id, "member.added", member["name"])
    return public_matter(await load_matter(db, user, matter_id), user)


@router.delete("/firm/matters/{matter_id}/members/{member_id}")
async def remove_member(matter_id: str, member_id: str, user: dict = Depends(identity.require("matter.create")), db=Depends(identity.get_db)):
    matter = await load_matter(db, user, matter_id)
    if member_id not in matter["member_ids"]:
        raise HTTPException(status_code=404, detail="Member not found.")
    if matter["member_ids"] == [member_id]:
        raise HTTPException(status_code=409, detail="A matter needs at least one member.")
    member = await firm_member(db, user["firm_id"], member_id)
    await db.matters.update_one({"id": matter_id}, {"$pull": {"member_ids": member_id}, "$set": {"updated_at": identity.now_iso()}})
    await record(db, user, matter_id, "member.removed", member["name"])
    return {"removed": member_id}


@router.post("/firm/matters/{matter_id}/walls")
async def add_wall(matter_id: str, request: WallRequest, user: dict = Depends(identity.require("matter.wall")), db=Depends(identity.get_db)):
    matter = await load_matter(db, user, matter_id)
    target = await firm_member(db, user["firm_id"], request.user_id)
    if target["id"] == user["id"]:
        raise HTTPException(status_code=409, detail="You cannot wall yourself off a matter.")
    if len([m for m in matter["member_ids"] if m != target["id"]]) == 0:
        raise HTTPException(status_code=409, detail="A matter needs at least one member.")
    await db.matters.update_one(
        {"id": matter_id},
        {"$addToSet": {"walled_ids": target["id"]}, "$pull": {"member_ids": target["id"]}, "$set": {"updated_at": identity.now_iso()}},
    )
    await db.tasks.update_many({"matter_id": matter_id, "assignee_id": target["id"]}, {"$set": {"assignee_id": None}})
    await record(db, user, matter_id, "wall.added", f"{target['name']}: {request.reason}")
    return public_matter(await load_matter(db, user, matter_id), user)


@router.delete("/firm/matters/{matter_id}/walls/{member_id}")
async def remove_wall(matter_id: str, member_id: str, user: dict = Depends(identity.require("matter.wall")), db=Depends(identity.get_db)):
    matter = await load_matter(db, user, matter_id)
    if member_id not in matter.get("walled_ids", []):
        raise HTTPException(status_code=404, detail="No wall for this person.")
    target = await firm_member(db, user["firm_id"], member_id)
    await db.matters.update_one({"id": matter_id}, {"$pull": {"walled_ids": member_id}, "$set": {"updated_at": identity.now_iso()}})
    await record(db, user, matter_id, "wall.removed", target["name"])
    return public_matter(await load_matter(db, user, matter_id), user)


# ============== TASKS ==============

class TaskCreate(BaseModel):
    title: Text
    details: LongText = ""
    assignee_id: Optional[str] = None
    due: Optional[date] = None


class TaskUpdate(BaseModel):
    title: Optional[Text] = None
    details: Optional[LongText] = None
    assignee_id: Optional[str] = None
    due: Optional[date] = None
    status: Optional[TASK_STATUS] = None


def check_assignee(matter: dict, assignee_id: Optional[str]):
    if assignee_id and assignee_id not in matter["member_ids"]:
        raise HTTPException(status_code=422, detail="Tasks can only be assigned to members of the matter.")


@router.get("/firm/matters/{matter_id}/tasks")
async def list_tasks(matter_id: str, user: dict = Depends(identity.require("matter.read")), db=Depends(identity.get_db)):
    await load_matter(db, user, matter_id)
    return await db.tasks.find({"firm_id": user["firm_id"], "matter_id": matter_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)


@router.post("/firm/matters/{matter_id}/tasks", status_code=201)
async def create_task(matter_id: str, request: TaskCreate, user: dict = Depends(identity.require("matter.work")), db=Depends(identity.get_db)):
    matter = await load_matter(db, user, matter_id)
    check_assignee(matter, request.assignee_id)
    now = identity.now_iso()
    task = {
        "id": str(uuid.uuid4()),
        "firm_id": user["firm_id"],
        "matter_id": matter_id,
        "title": request.title,
        "details": request.details,
        "assignee_id": request.assignee_id,
        "due": request.due.isoformat() if request.due else None,
        "status": "to do",
        "created_by": user["id"],
        "created_at": now,
        "updated_by": user["id"],
        "updated_at": now,
    }
    await db.tasks.insert_one(dict(task))
    await record(db, user, matter_id, "task.created", task["title"])
    await notify(db, user["firm_id"], [task["assignee_id"]], user, matter_id, "task.assigned", f"{user['name']} assigned you “{task['title']}” on {matter['name']}.")
    task.pop("_id", None)
    return task


@router.patch("/firm/tasks/{task_id}")
async def update_task(task_id: str, request: TaskUpdate, user: dict = Depends(identity.require("matter.work")), db=Depends(identity.get_db)):
    task = await db.tasks.find_one({"id": task_id, "firm_id": user["firm_id"]}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    try:
        matter = await load_matter(db, user, task["matter_id"])
    except HTTPException:
        raise HTTPException(status_code=404, detail="Task not found.")
    changes = request.model_dump(exclude_unset=True)
    if "assignee_id" in changes:
        check_assignee(matter, changes["assignee_id"])
    if "due" in changes and changes["due"] is not None:
        changes["due"] = changes["due"].isoformat()
    changes.update({"updated_by": user["id"], "updated_at": identity.now_iso()})
    await db.tasks.update_one({"id": task_id}, {"$set": changes})
    if "status" in changes:
        await record(db, user, task["matter_id"], "task.status", f"{task['title']}: {changes['status']}")
    if "assignee_id" in changes:
        await record(db, user, task["matter_id"], "task.assigned", task["title"])
        if changes["assignee_id"] != task.get("assignee_id"):
            await notify(db, user["firm_id"], [changes["assignee_id"]], user, task["matter_id"], "task.assigned", f"{user['name']} assigned you “{task['title']}” on {matter['name']}.")
    return {**task, **changes}
