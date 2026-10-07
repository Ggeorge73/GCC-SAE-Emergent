"""Client collaboration: client invitations, shared updates, client messages and
document requests, plus the client-facing portal routes.

Firm routes (/api/firm/...) are staff-only. Portal routes (/api/portal/...) are
client-only and return only items explicitly shared with that client. Internal
comments, tasks, activity and wall details are never read by a portal route.
"""
import base64
import hashlib
import secrets
import time
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, StringConstraints

try:
    from . import identity
    from .workspace import INVITE_SECONDS, load_matter, notify, record
except ImportError:
    import identity
    from workspace import INVITE_SECONDS, load_matter, notify, record

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=250)]
Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]

router = APIRouter(prefix="/api")
NOT_FOUND = HTTPException(status_code=404, detail="Matter not found.")


def stamp(user: dict) -> dict:
    return {"author_id": user["id"], "author_name": user["name"], "author_kind": "client" if user["role"] == "client" else "firm"}


def file_meta(doc: dict) -> dict:
    return {k: doc.get(k) for k in ("id", "file_name", "size", "content_type", "sha256", "uploaded_by_name", "uploaded_at")}


async def client_matter(db, user: dict, matter_id: str) -> dict:
    """A matter this client was invited to, or 404."""
    matter = await db.matters.find_one({"id": matter_id, "firm_id": user["firm_id"], "client_ids": user["id"]}, {"_id": 0})
    if not matter:
        raise NOT_FOUND
    return matter


async def store_upload(db, user: dict, matter: dict, request_id: str, upload: UploadFile) -> dict:
    content = await upload.read(MAX_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(status_code=422, detail="The file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Files are limited to 10 MiB.")
    doc = {
        "id": str(uuid.uuid4()),
        "firm_id": user["firm_id"],
        "matter_id": matter["id"],
        "request_id": request_id,
        "file_name": (upload.filename or "upload").replace("/", "_").replace("\\", "_")[:200],
        "content_type": upload.content_type or "application/octet-stream",
        "size": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "content_b64": base64.b64encode(content).decode(),
        "uploaded_by": user["id"],
        "uploaded_by_name": user["name"],
        "uploaded_at": identity.now_iso(),
    }
    await db.client_documents.insert_one(dict(doc))
    return doc


def download(doc: dict) -> Response:
    return Response(
        content=base64.b64decode(doc["content_b64"]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc["file_name"]}"', "X-Content-SHA256": doc["sha256"]},
    )


# ============== FIRM SIDE ==============

class ClientInvite(BaseModel):
    name: Text
    email: identity.Email


class UpdateCreate(BaseModel):
    title: Text
    body: Body


class MessageCreate(BaseModel):
    body: Body


class DocumentRequestCreate(BaseModel):
    title: Text
    details: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] = ""


@router.get("/firm/matters/{matter_id}/clients")
async def list_clients(matter_id: str, user: dict = Depends(identity.require("matter.read")), db=Depends(identity.get_db)):
    matter = await load_matter(db, user, matter_id)
    clients = await db.users.find({"firm_id": user["firm_id"], "id": {"$in": matter.get("client_ids", [])}}, {"_id": 0}).to_list(100)
    pending = await db.invites.find({"firm_id": user["firm_id"], "matter_ids": matter_id, "used": False, "expires_ts": {"$gt": time.time()}}, {"_id": 0}).to_list(100)
    return {"clients": [identity.public_user(c) for c in clients], "pending": [{k: p[k] for k in ("id", "name", "email")} for p in pending]}


@router.post("/firm/matters/{matter_id}/clients", status_code=201)
async def invite_client(matter_id: str, request: ClientInvite, user: dict = Depends(identity.require("matter.create")), db=Depends(identity.get_db)):
    matter = await load_matter(db, user, matter_id)
    existing = await db.users.find_one({"email": request.email}, {"_id": 0})
    if existing:
        if existing["firm_id"] != user["firm_id"] or existing["role"] != "client":
            raise HTTPException(status_code=409, detail="This email belongs to an account that cannot be added as this firm's client.")
        await db.matters.update_one({"id": matter_id}, {"$addToSet": {"client_ids": existing["id"]}})
        await record(db, user, matter_id, "client.added", existing["name"])
        return {"code": None, "client": identity.public_user(existing)}
    code = secrets.token_urlsafe(12)
    await db.invites.insert_one({
        "id": str(uuid.uuid4()),
        "firm_id": user["firm_id"],
        "name": request.name,
        "email": request.email,
        "role": "client",
        "matter_ids": [matter_id],
        "code_hash": identity.token_digest(code),
        "expires_ts": time.time() + INVITE_SECONDS,
        "used": False,
        "invited_by": user["id"],
        "created_at": identity.now_iso(),
    })
    await record(db, user, matter_id, "client.invited", request.name)
    return {"code": code, "client": None}


@router.get("/firm/matters/{matter_id}/client-room")
async def firm_client_room(matter_id: str, user: dict = Depends(identity.require("matter.read")), db=Depends(identity.get_db)):
    await load_matter(db, user, matter_id)
    scope = {"firm_id": user["firm_id"], "matter_id": matter_id}
    updates = await db.client_updates.find(scope, {"_id": 0}).sort("created_at", -1).to_list(200)
    messages = await db.client_messages.find(scope, {"_id": 0}).sort("created_at", 1).to_list(1000)
    requests = await db.document_requests.find(scope, {"_id": 0}).sort("created_at", 1).to_list(200)
    docs = await db.client_documents.find(scope, {"_id": 0, "content_b64": 0}).to_list(500)
    for r in requests:
        r["documents"] = [file_meta(d) for d in docs if d["request_id"] == r["id"]]
    return {"updates": updates, "messages": messages, "requests": requests}


@router.post("/firm/matters/{matter_id}/updates", status_code=201)
async def draft_update(matter_id: str, request: UpdateCreate, user: dict = Depends(identity.require("matter.work")), db=Depends(identity.get_db)):
    await load_matter(db, user, matter_id)
    update = {"id": str(uuid.uuid4()), "firm_id": user["firm_id"], "matter_id": matter_id, "title": request.title, "body": request.body,
              "status": "draft", "drafted_by": user["name"], "approved_by": None, "shared_at": None, "created_at": identity.now_iso()}
    await db.client_updates.insert_one(dict(update))
    await record(db, user, matter_id, "update.drafted", request.title)
    return update


async def _update(db, user, matter_id, update_id):
    await load_matter(db, user, matter_id)
    update = await db.client_updates.find_one({"id": update_id, "firm_id": user["firm_id"], "matter_id": matter_id}, {"_id": 0})
    if not update:
        raise HTTPException(status_code=404, detail="Update not found.")
    return update


@router.post("/firm/matters/{matter_id}/updates/{update_id}/approve")
async def approve_update(matter_id: str, update_id: str, user: dict = Depends(identity.require("matter.approve")), db=Depends(identity.get_db)):
    update = await _update(db, user, matter_id, update_id)
    if update["status"] != "draft":
        raise HTTPException(status_code=409, detail="Only drafts can be approved.")
    await db.client_updates.update_one({"id": update_id}, {"$set": {"status": "approved", "approved_by": user["name"]}})
    await record(db, user, matter_id, "update.approved", update["title"])
    return {**update, "status": "approved", "approved_by": user["name"]}


@router.post("/firm/matters/{matter_id}/updates/{update_id}/share")
async def share_update(matter_id: str, update_id: str, user: dict = Depends(identity.require("matter.work")), db=Depends(identity.get_db)):
    update = await _update(db, user, matter_id, update_id)
    if update["status"] != "approved":
        raise HTTPException(status_code=409, detail="A partner must approve this update before it is shared.")
    shared_at = identity.now_iso()
    await db.client_updates.update_one({"id": update_id}, {"$set": {"status": "shared", "shared_at": shared_at}})
    await record(db, user, matter_id, "update.shared", update["title"])
    return {**update, "status": "shared", "shared_at": shared_at}


@router.post("/firm/matters/{matter_id}/client-messages", status_code=201)
async def firm_message(matter_id: str, request: MessageCreate, user: dict = Depends(identity.require("matter.work")), db=Depends(identity.get_db)):
    await load_matter(db, user, matter_id)
    message = {"id": str(uuid.uuid4()), "firm_id": user["firm_id"], "matter_id": matter_id, **stamp(user), "body": request.body, "created_at": identity.now_iso()}
    await db.client_messages.insert_one(dict(message))
    await record(db, user, matter_id, "client.message.sent", request.body[:120])
    return message


@router.post("/firm/matters/{matter_id}/document-requests", status_code=201)
async def request_document(matter_id: str, request: DocumentRequestCreate, user: dict = Depends(identity.require("matter.work")), db=Depends(identity.get_db)):
    await load_matter(db, user, matter_id)
    doc_request = {"id": str(uuid.uuid4()), "firm_id": user["firm_id"], "matter_id": matter_id, "title": request.title, "details": request.details,
                   "status": "requested", "requested_by": user["name"], "created_at": identity.now_iso()}
    await db.document_requests.insert_one(dict(doc_request))
    await record(db, user, matter_id, "document.requested", request.title)
    return doc_request


@router.get("/firm/client-documents/{document_id}")
async def firm_download(document_id: str, user: dict = Depends(identity.require("matter.read")), db=Depends(identity.get_db)):
    doc = await db.client_documents.find_one({"id": document_id, "firm_id": user["firm_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    try:
        await load_matter(db, user, doc["matter_id"])
    except HTTPException:
        raise HTTPException(status_code=404, detail="Document not found.")
    return download(doc)


# ============== CLIENT PORTAL ==============

client_only = identity.require("portal.read")


@router.get("/portal/matters")
async def portal_matters(user: dict = Depends(client_only), db=Depends(identity.get_db)):
    matters = await db.matters.find({"firm_id": user["firm_id"], "client_ids": user["id"]}, {"_id": 0}).to_list(100)
    return [{k: m.get(k) for k in ("id", "name", "client_name", "status")} for m in matters]


@router.get("/portal/matters/{matter_id}")
async def portal_matter(matter_id: str, user: dict = Depends(client_only), db=Depends(identity.get_db)):
    matter = await client_matter(db, user, matter_id)
    scope = {"firm_id": user["firm_id"], "matter_id": matter_id}
    responsible = await db.users.find_one({"id": matter.get("responsible_id"), "firm_id": user["firm_id"]}, {"_id": 0, "name": 1})
    updates = await db.client_updates.find({**scope, "status": "shared"}, {"_id": 0}).sort("shared_at", -1).to_list(200)
    messages = await db.client_messages.find(scope, {"_id": 0}).sort("created_at", 1).to_list(1000)
    requests = await db.document_requests.find(scope, {"_id": 0}).sort("created_at", 1).to_list(200)
    docs = await db.client_documents.find(scope, {"_id": 0, "content_b64": 0}).to_list(500)
    return {
        "matter": {k: matter.get(k) for k in ("id", "name", "client_name", "status")},
        "responsible": (responsible or {}).get("name"),
        "updates": [{k: u[k] for k in ("id", "title", "body", "shared_at")} for u in updates],
        "messages": [{k: m[k] for k in ("id", "author_name", "author_kind", "body", "created_at")} for m in messages],
        "requests": [
            {**{k: r[k] for k in ("id", "title", "details", "status", "created_at")},
             "documents": [file_meta(d) for d in docs if d["request_id"] == r["id"]]}
            for r in requests
        ],
    }


@router.post("/portal/matters/{matter_id}/messages", status_code=201)
async def portal_message(matter_id: str, request: MessageCreate, user: dict = Depends(client_only), db=Depends(identity.get_db)):
    matter = await client_matter(db, user, matter_id)
    message = {"id": str(uuid.uuid4()), "firm_id": user["firm_id"], "matter_id": matter_id, **stamp(user), "body": request.body, "created_at": identity.now_iso()}
    await db.client_messages.insert_one(dict(message))
    await record(db, user, matter_id, "client.message.received", request.body[:120])
    await notify(db, user["firm_id"], matter["member_ids"], user, matter_id, "client.message", f"{user['name']} (client) wrote on {matter['name']}: {request.body[:140]}")
    return {k: message[k] for k in ("id", "author_name", "author_kind", "body", "created_at")}


@router.post("/portal/document-requests/{request_id}/upload", status_code=201)
async def portal_upload(request_id: str, file: UploadFile = File(...), user: dict = Depends(client_only), db=Depends(identity.get_db)):
    doc_request = await db.document_requests.find_one({"id": request_id, "firm_id": user["firm_id"]}, {"_id": 0})
    if not doc_request:
        raise HTTPException(status_code=404, detail="Request not found.")
    matter = await client_matter(db, user, doc_request["matter_id"])
    doc = await store_upload(db, user, matter, request_id, file)
    await db.document_requests.update_one({"id": request_id}, {"$set": {"status": "fulfilled"}})
    await record(db, user, matter["id"], "document.uploaded", f"{doc['file_name']} for {doc_request['title']}")
    await notify(db, user["firm_id"], matter["member_ids"], user, matter["id"], "client.document", f"{user['name']} (client) uploaded {doc['file_name']} for “{doc_request['title']}” on {matter['name']}.")
    return file_meta(doc)


@router.get("/portal/documents/{document_id}")
async def portal_download(document_id: str, user: dict = Depends(client_only), db=Depends(identity.get_db)):
    doc = await db.client_documents.find_one({"id": document_id, "firm_id": user["firm_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    try:
        await client_matter(db, user, doc["matter_id"])
    except HTTPException:
        raise HTTPException(status_code=404, detail="Document not found.")
    return download(doc)
