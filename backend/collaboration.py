"""Matter discussion, @mentions, personal notifications and the activity feed.

Comments are internal to the firm: they are never returned by any client-facing
route. Every read goes through the same matter guard as tasks, so walls apply.
"""
import uuid
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StringConstraints

try:
    from . import identity
    from .workspace import load_matter, notify, record
except ImportError:
    import identity
    from workspace import load_matter, notify, record

router = APIRouter(prefix="/api")

Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class CommentCreate(BaseModel):
    body: Body
    mention_ids: List[str] = Field(default_factory=list, max_length=50)


@router.get("/firm/matters/{matter_id}/comments")
async def list_comments(matter_id: str, user: dict = Depends(identity.require("matter.read")), db=Depends(identity.get_db)):
    await load_matter(db, user, matter_id)
    return await db.comments.find({"firm_id": user["firm_id"], "matter_id": matter_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)


@router.post("/firm/matters/{matter_id}/comments", status_code=201)
async def post_comment(matter_id: str, request: CommentCreate, user: dict = Depends(identity.require("matter.work")), db=Depends(identity.get_db)):
    matter = await load_matter(db, user, matter_id)
    # Only current members can be mentioned; anyone else is dropped silently so
    # a mention never confirms who can or cannot see a matter.
    mentions = [m for m in dict.fromkeys(request.mention_ids) if m in matter["member_ids"] and m != user["id"]]
    comment = {
        "id": str(uuid.uuid4()),
        "firm_id": user["firm_id"],
        "matter_id": matter_id,
        "author_id": user["id"],
        "author_name": user["name"],
        "author_role": user["role"],
        "body": request.body,
        "mention_ids": mentions,
        "visibility": "internal",
        "created_at": identity.now_iso(),
    }
    await db.comments.insert_one(dict(comment))
    await record(db, user, matter_id, "comment.posted", request.body[:120])
    await notify(db, user["firm_id"], mentions, user, matter_id, "mention", f"{user['name']} mentioned you on {matter['name']}: {request.body[:140]}")
    return comment


@router.get("/firm/matters/{matter_id}/activity")
async def matter_activity(matter_id: str, user: dict = Depends(identity.require("matter.read")), db=Depends(identity.get_db)):
    await load_matter(db, user, matter_id)
    return await db.activity.find({"firm_id": user["firm_id"], "matter_id": matter_id}, {"_id": 0}).sort("at", -1).to_list(200)


async def _visible_notifications(db, user: dict) -> List[dict]:
    rows = await db.notifications.find({"firm_id": user["firm_id"], "user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    shown = []
    for row in rows:
        # A later wall or removal hides earlier notifications about that matter.
        try:
            await load_matter(db, user, row["matter_id"])
        except HTTPException:
            continue
        shown.append(row)
    return shown


@router.get("/firm/notifications")
async def list_notifications(user: dict = Depends(identity.current_user), db=Depends(identity.get_db)):
    rows = await _visible_notifications(db, user)
    return {"unread": sum(1 for r in rows if not r["read"]), "items": rows[:50]}


@router.post("/firm/notifications/{notification_id}/read")
async def mark_read(notification_id: str, user: dict = Depends(identity.current_user), db=Depends(identity.get_db)):
    result = await db.notifications.update_one({"id": notification_id, "user_id": user["id"]}, {"$set": {"read": True}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Notification not found.")
    return {"read": notification_id}


@router.post("/firm/notifications/read-all")
async def mark_all_read(user: dict = Depends(identity.current_user), db=Depends(identity.get_db)):
    result = await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"read": result.modified_count}
