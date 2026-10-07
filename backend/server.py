from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Request, Header, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, StringConstraints
from typing import List, Optional, Dict, Any, Annotated, Literal
from datetime import date
import asyncio
from pymongo.errors import DuplicateKeyError
from google import genai
from google.genai import types
import uuid
from datetime import datetime, timezone
import hashlib
import json
import base64
try:
    from .research_safety import get_research_prompt, unavailable_response
    from . import identity, workspace
    from .memory_store import MemoryClient, MemoryDatabase
except ImportError:
    from research_safety import get_research_prompt, unavailable_response
    import identity
    import workspace
    from memory_store import MemoryClient, MemoryDatabase

# Load environment variables FIRST
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
if mongo_url == "memory":
    # Process-local store for tests and demos; records vanish on restart.
    client = MemoryClient()
    db = MemoryDatabase()
else:
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'law_suite')]
identity.bind(db)

# LLM Configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-pro')
LAW_SUITE_AI_MODE = os.environ.get('LAW_SUITE_AI_MODE', 'offline').lower()
genai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY and LAW_SUITE_AI_MODE == 'live' else None

# Create the main app
app = FastAPI(title="Law Suite API", description="Enterprise legal advisory and document workspace")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

@app.middleware("http")
async def require_local_demo_opt_in(request: Request, call_next):
    """Fail closed until real authentication and matter authorization are implemented.

    The opt-in is exclusively for isolated, loopback-only synthetic-data development.
    It is not authentication and must not be exposed through a public reverse proxy.
    """
    from starlette.responses import JSONResponse
    if request.url.path.startswith(identity.AUTHENTICATED_PREFIXES):
        return await call_next(request)
    if request.url.path.startswith("/api") and request.url.path not in {"/api", "/api/"}:
        if os.environ.get("LAW_SUITE_ALLOW_LOCAL_DEMO", "false").lower() != "true":
            return JSONResponse(status_code=503, content={"detail": "Data endpoints are disabled until authentication is implemented. Local synthetic-data development requires explicit LAW_SUITE_ALLOW_LOCAL_DEMO=true."})
        if not request.client or request.client.host not in {"127.0.0.1", "::1", "testclient"}:
            return JSONResponse(status_code=403, content={"detail": "The unauthenticated prototype is restricted to local development."})
    return await call_next(request)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== MODELS ==============
RequiredName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=250)]
ChecklistStatus = Literal["pending", "compliant", "overdue"]
creation_lock = asyncio.Lock()

class DealRoom(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: RequiredName
    jurisdiction: str = "US (DELAWARE DGCL)"
    total_raise: Optional[str] = None
    primary_counsel: Optional[str] = None
    status: str = "active"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DealRoomCreate(BaseModel):
    name: RequiredName
    jurisdiction: str = "US (DELAWARE DGCL)"
    total_raise: Optional[str] = None
    primary_counsel: Optional[str] = None

class AdvisoryLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    deal_room_id: str
    type: str  # "strategic_directive" | "legal_opinion" | "user_query"
    content: str
    prompt_used: Optional[str] = None
    jurisdiction_context: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Optional[Dict[str, Any]] = None

class AdvisoryLogCreate(BaseModel):
    deal_room_id: RequiredName
    type: Literal["strategic_directive", "legal_opinion", "user_query"]
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20000)]
    prompt_used: Optional[str] = None
    jurisdiction_context: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class ComplianceChecklist(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    deal_room_id: str
    name: RequiredName
    description: Optional[str] = None
    status: ChecklistStatus = "pending"
    due_date: Optional[date] = None
    regulatory_body: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ComplianceChecklistCreate(BaseModel):
    deal_room_id: RequiredName
    name: RequiredName
    description: Optional[str] = None
    status: ChecklistStatus = "pending"
    due_date: Optional[date] = None
    regulatory_body: Optional[str] = None

class DocumentMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    deal_room_id: str
    file_name: str
    file_size: int
    file_type: str
    folder: str  # "Legal_Drafts" | "Due_Diligence" | "CBRNE_Technical" | "KYC_Docs"
    file_hash: str
    access_level: str = "Team"  # "Admin Only" | "Team" | "Public"
    storage_path: str
    indexing_status: str = "processing"  # "processing" | "indexed" | "failed"
    version: str = "1.0"
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    indexed_at: Optional[datetime] = None

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatRequest(BaseModel):
    deal_room_id: Optional[str] = None
    message: str = Field(min_length=1, max_length=20000)
    jurisdiction: str = "US (DELAWARE DGCL)"

class ChatResponse(BaseModel):
    response: str
    status: str = "unverified_draft"
    sources_verified: bool = False
    reference_id: str
    jurisdiction: str
    timestamp: datetime

# ============== HELPER FUNCTIONS ==============

def compute_file_hash(content: bytes) -> str:
    """Compute SHA-256 hash for file integrity verification"""
    return hashlib.sha256(content).hexdigest()

def get_law_suite_system_prompt(jurisdiction: str, context_docs: List[str] = None) -> str:
    return get_research_prompt(jurisdiction, context_docs or [])


# ============== DEAL ROOMS ENDPOINTS ==============

@api_router.get("/")
async def root():
    return {"message": "Law Suite API - Enterprise Legal Advisory Workspace", "version": "1.0.0"}

@api_router.post("/deal-rooms", response_model=DealRoom)
async def create_deal_room(deal_room: DealRoomCreate, idempotency_key: Optional[str] = Header(default=None, min_length=8, max_length=128)):
    """Create a new deal room"""
    # The local prototype uses recoverable staging on standalone MongoDB.
    # Only the final parent insert publishes the matter. A stable request key
    # makes a retry resume the same initialization, including after a crash.
    async with creation_lock:
        return await initialize_matter(deal_room, idempotency_key)

async def initialize_matter(deal_room, idempotency_key):
    identity = str(uuid.uuid5(uuid.NAMESPACE_URL, "law-suite:" + idempotency_key)) if idempotency_key else str(uuid.uuid4())
    payload_hash = hashlib.sha256(deal_room.model_dump_json().encode()).hexdigest()
    existing = await db.deal_rooms.find_one({"id": identity}, {"_id": 0})
    if existing:
        if existing.get("initialization_hash") != payload_hash:
            raise HTTPException(409, "Idempotency key was already used for different matter details")
        return DealRoom(**existing)
    deal_obj = DealRoom(id=identity, **deal_room.model_dump())
    doc = deal_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    doc['_id'] = identity
    doc['initialization_hash'] = payload_hash
    
    # Start internal review tasks; jurisdiction alone does not establish obligations.
    default_checklists = [
        {"name": "Confirm scope and responsible lawyer", "regulatory_body": "Internal planning — applicability unverified", "status": "pending"},
        {"name": "Document conflicts and engagement review", "regulatory_body": "Internal planning — not conflicts clearance", "status": "pending"},
        {"name": "Identify applicable obligations and verified deadlines", "regulatory_body": "Requires matter-specific lawyer review", "status": "pending"},
    ]
    
    for index, checklist in enumerate(default_checklists):
        cl = ComplianceChecklist(
            deal_room_id=deal_obj.id,
            name=checklist["name"],
            regulatory_body=checklist["regulatory_body"],
            status=checklist["status"]
        )
        cl_doc = cl.model_dump()
        cl_doc['_id'] = f"{identity}:initial:{index}"
        cl_doc['id'] = cl_doc['_id']
        cl_doc['initialization_hash'] = payload_hash
        cl_doc['created_at'] = cl_doc['created_at'].isoformat()
        cl_doc['updated_at'] = cl_doc['updated_at'].isoformat()
        try:
            await db.compliance_checklists.insert_one(cl_doc)
        except DuplicateKeyError:
            staged = await db.compliance_checklists.find_one({'_id': cl_doc['_id']})
            if not staged or staged.get('initialization_hash') != payload_hash:
                raise HTTPException(409, "Initialization key conflicts with staged details")
    try:
        await db.deal_rooms.insert_one(doc)
    except DuplicateKeyError:
        existing = await db.deal_rooms.find_one({'id': identity}, {'_id': 0})
        if not existing or existing.get('initialization_hash') != payload_hash:
            raise HTTPException(409, "Initialization conflict; retry using the original request details")
        return DealRoom(**existing)
    
    return deal_obj

@api_router.get("/deal-rooms", response_model=List[DealRoom])
async def get_deal_rooms(offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500)):
    """Get all deal rooms"""
    deal_rooms = await db.deal_rooms.find({}, {"_id": 0}).sort("id", 1).skip(offset).to_list(limit)
    for dr in deal_rooms:
        if isinstance(dr.get('created_at'), str):
            dr['created_at'] = datetime.fromisoformat(dr['created_at'])
        if isinstance(dr.get('updated_at'), str):
            dr['updated_at'] = datetime.fromisoformat(dr['updated_at'])
    return deal_rooms

@api_router.get("/deal-rooms/{deal_room_id}", response_model=DealRoom)
async def get_deal_room(deal_room_id: str):
    """Get a specific deal room"""
    deal_room = await db.deal_rooms.find_one({"id": deal_room_id}, {"_id": 0})
    if not deal_room:
        raise HTTPException(status_code=404, detail="Deal room not found")
    if isinstance(deal_room.get('created_at'), str):
        deal_room['created_at'] = datetime.fromisoformat(deal_room['created_at'])
    if isinstance(deal_room.get('updated_at'), str):
        deal_room['updated_at'] = datetime.fromisoformat(deal_room['updated_at'])
    return deal_room

@api_router.delete("/deal-rooms/{deal_room_id}")
async def delete_deal_room(deal_room_id: str):
    """Delete a deal room and all related data"""
    result = await db.deal_rooms.delete_one({"id": deal_room_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Deal room not found")
    # Cascade delete related data
    await db.advisory_logs.delete_many({"deal_room_id": deal_room_id})
    await db.compliance_checklists.delete_many({"deal_room_id": deal_room_id})
    await db.documents.delete_many({"deal_room_id": deal_room_id})
    return {"message": "Deal room and all related data deleted"}

# ============== ADVISORY LOGS ENDPOINTS ==============

@api_router.post("/advisory-logs", response_model=AdvisoryLog)
async def create_advisory_log(log: AdvisoryLogCreate):
    """Create a new advisory log entry"""
    await get_deal_room(log.deal_room_id)
    log_obj = AdvisoryLog(**log.model_dump())
    doc = log_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.advisory_logs.insert_one(doc)
    return log_obj

@api_router.get("/advisory-logs/{deal_room_id}", response_model=List[AdvisoryLog])
async def get_advisory_logs(deal_room_id: str, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500)):
    """Get all advisory logs for a deal room"""
    await get_deal_room(deal_room_id)
    logs = await db.advisory_logs.find(
        {"deal_room_id": deal_room_id}, 
        {"_id": 0}
    ).sort([("timestamp", -1), ("id", 1)]).skip(offset).to_list(limit)
    for log in logs:
        if isinstance(log.get('timestamp'), str):
            log['timestamp'] = datetime.fromisoformat(log['timestamp'])
    return logs

# ============== COMPLIANCE CHECKLISTS ENDPOINTS ==============

@api_router.post("/compliance-checklists", response_model=ComplianceChecklist)
async def create_compliance_checklist(checklist: ComplianceChecklistCreate):
    """Create a new compliance checklist item"""
    if not await db.deal_rooms.find_one({"id": checklist.deal_room_id}, {"id": 1}):
        raise HTTPException(404, "Matter not found")
    cl_obj = ComplianceChecklist(**checklist.model_dump())
    doc = cl_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    if doc['due_date'] is not None:
        doc['due_date'] = doc['due_date'].isoformat()
    await db.compliance_checklists.insert_one(doc)
    return cl_obj

@api_router.get("/compliance-checklists/{deal_room_id}", response_model=List[ComplianceChecklist])
async def get_compliance_checklists(deal_room_id: str, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500)):
    """Get all compliance checklists for a deal room"""
    await get_deal_room(deal_room_id)
    checklists = await db.compliance_checklists.find(
        {"deal_room_id": deal_room_id}, 
        {"_id": 0}
    ).sort("id", 1).skip(offset).to_list(limit)
    for cl in checklists:
        if isinstance(cl.get('created_at'), str):
            cl['created_at'] = datetime.fromisoformat(cl['created_at'])
        if isinstance(cl.get('updated_at'), str):
            cl['updated_at'] = datetime.fromisoformat(cl['updated_at'])
    return checklists

@api_router.put("/compliance-checklists/{checklist_id}")
async def update_compliance_checklist(checklist_id: str, status: ChecklistStatus = Form(...)):
    """Update compliance checklist status"""
    if status not in {"pending", "compliant", "overdue"}:
        raise HTTPException(status_code=422, detail="Invalid checklist status")
    result = await db.compliance_checklists.update_one(
        {"id": checklist_id},
        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()},
         "$push": {"history": {"status": status, "at": datetime.now(timezone.utc).isoformat(), "actor": "unauthenticated local demo"}}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return {"message": "Checklist updated", "status": status}

# ============== DOCUMENT RECORDS ENDPOINTS ==============

@api_router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    deal_room_id: str = Form(...),
    folder: str = Form(default="Legal_Drafts"),
    access_level: str = Form(default="Team"),
    storage_path: Optional[str] = Form(default=None),
    download_url: Optional[str] = Form(default=None),
    file_hash: Optional[str] = Form(default=None)
):
    """Upload a document to document records with metadata indexing"""
    if not await db.deal_rooms.find_one({"id": deal_room_id}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=404, detail="Matter not found")
    if folder not in {"Legal_Drafts", "Due_Diligence", "CBRNE_Technical", "KYC_Docs"}:
        raise HTTPException(status_code=422, detail="Unsupported document folder")
    if access_level not in {"Team", "Admin Only"}:
        raise HTTPException(status_code=422, detail="Public document access is not supported")
    if download_url or storage_path:
        raise HTTPException(status_code=422, detail="External storage registration is disabled until authorized storage is implemented")
    content = await file.read(10 * 1024 * 1024 + 1)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Prototype upload limit is 10 MiB")
    if not content:
        raise HTTPException(status_code=422, detail="Empty documents are not supported")
    computed_hash = compute_file_hash(content)
    if file_hash and file_hash != computed_hash:
        raise HTTPException(status_code=422, detail="Document integrity hash does not match the uploaded bytes")
    file_hash = computed_hash
    
    # Use provided storage path or create default
    if not storage_path:
        storage_path = f"/deals/{deal_room_id}/{folder}/{file.filename}"
    
    # Create document metadata
    doc_metadata = DocumentMetadata(
        deal_room_id=deal_room_id,
        file_name=file.filename,
        file_size=len(content),
        file_type=file.content_type or "application/octet-stream",
        folder=folder,
        file_hash=file_hash,
        access_level=access_level,
        storage_path=storage_path,
        indexing_status="stored"
    )
    
    doc = doc_metadata.model_dump()
    doc['uploaded_at'] = doc['uploaded_at'].isoformat()
    
    # If Firebase URL provided, store it; otherwise store base64 content
    if download_url:
        doc['download_url'] = download_url
    else:
        doc['file_content'] = base64.b64encode(content).decode('utf-8')
    
    await db.documents.insert_one(doc)
    
    # Storage is not extraction, indexing, or source verification.
    return {
        "id": doc_metadata.id,
        "file_name": doc_metadata.file_name,
        "file_hash": doc_metadata.file_hash,
        "storage_path": storage_path,
        "download_url": download_url,
        "indexing_status": "stored"
    }

@api_router.get("/documents/{deal_room_id}")
async def get_documents(deal_room_id: str, folder: Optional[str] = None, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500)):
    """Get all documents for a deal room"""
    await get_deal_room(deal_room_id)
    query = {"deal_room_id": deal_room_id}
    if folder:
        query["folder"] = folder
    
    documents = await db.documents.find(
        query, 
        {"_id": 0, "file_content": 0}  # Exclude binary content
    ).sort("id", 1).skip(offset).to_list(limit)
    
    for doc in documents:
        if isinstance(doc.get('uploaded_at'), str):
            doc['uploaded_at'] = datetime.fromisoformat(doc['uploaded_at'])
        if doc.get('indexed_at') and isinstance(doc['indexed_at'], str):
            doc['indexed_at'] = datetime.fromisoformat(doc['indexed_at'])
    
    # Serialize to JSON-compatible format
    result = []
    for doc in documents:
        serialized = {
            "id": doc.get("id"),
            "deal_room_id": doc.get("deal_room_id"),
            "file_name": doc.get("file_name"),
            "file_size": doc.get("file_size"),
            "file_type": doc.get("file_type"),
            "folder": doc.get("folder"),
            "file_hash": doc.get("file_hash"),
            "access_level": doc.get("access_level"),
            "storage_path": doc.get("storage_path"),
            "download_url": doc.get("download_url"),
            "indexing_status": doc.get("indexing_status"),
            "version": doc.get("version"),
            "uploaded_at": doc.get("uploaded_at").isoformat() if doc.get("uploaded_at") else None,
            "indexed_at": doc.get("indexed_at").isoformat() if doc.get("indexed_at") else None,
        }
        result.append(serialized)
    
    return result

@api_router.get("/documents/download/{document_id}")
async def download_document(document_id: str):
    """Download a document from document records"""
    doc = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {
        "file_name": doc["file_name"],
        "file_type": doc["file_type"],
        "content": doc.get("file_content", "")
    }

@api_router.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    """Delete a document from document records"""
    result = await db.documents.delete_one({"id": document_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted"}

# ============== CHAT / ADVISORY ENDPOINT ==============


@api_router.post("/chat", response_model=ChatResponse)
async def chat_with_advocate(request: ChatRequest):
    """Chat with the Law Suite Legal Advisor powered by Gemini."""
    reference_id = f"LAW-{uuid.uuid4().hex[:8].upper()}"
    
    # Only a filename inventory is available, not source text.
    if request.deal_room_id and not await db.deal_rooms.find_one({"id": request.deal_room_id}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=404, detail="Matter not found")
    # Get document metadata when a matter is supplied
    context_docs = []
    if request.deal_room_id:
        docs = await db.documents.find(
            {"deal_room_id": request.deal_room_id},
            {"_id": 0, "file_name": 1, "folder": 1}
        ).to_list(10)
        context_docs = [f"{d['folder']}/{d['file_name']}" for d in docs]
    
    response_status = "unverified_draft"
    
    try:
        if genai_client is None:
            raise RuntimeError("Gemini is unavailable or LAW_SUITE_AI_MODE is offline")

        # Request-scoped chat prevents cross-user or stale-jurisdiction history reuse.
        chat = genai_client.aio.chats.create(
            model=GEMINI_MODEL,
            config=types.GenerateContentConfig(
                system_instruction=get_law_suite_system_prompt(request.jurisdiction, context_docs),
                temperature=0.2,
            ),
        )

        # Get AI response
        ai_result = await chat.send_message(request.message)
        ai_response = ai_result.text or ""
        if not ai_response.strip():
            raise RuntimeError("Empty model response")
        
        # Format response with proper header and reference at top
        formatted_response = f"""**UNVERIFIED RESEARCH DRAFT — LAWYER REVIEW REQUIRED**
**REF:** {reference_id}
**JURISDICTION:** {request.jurisdiction}
**DATE:** {datetime.now(timezone.utc).strftime('%d %B %Y')}

---

{ai_response}"""
        
        # Explicitly identify the limits of the supplied inventory
        if context_docs:
            formatted_response += f"\n\n---\n*Filename inventory only (contents not analyzed): {', '.join(context_docs)}*"
        
        response = formatted_response
        
    except Exception as e:
        logger.warning("Research service unavailable (%s)", type(e).__name__)
        response_status = "unavailable"
        # Never substitute canned legal advice for a failed model request
        response = generate_fallback_response(request.message, request.jurisdiction, context_docs, reference_id)
    
    # Log the advisory
    if request.deal_room_id:
        log = AdvisoryLog(
            deal_room_id=request.deal_room_id,
            type="research_draft" if response_status == "unverified_draft" else "service_notice",
            content=response,
            prompt_used=request.message,
            jurisdiction_context=request.jurisdiction
        )
        log_doc = log.model_dump()
        log_doc['timestamp'] = log_doc['timestamp'].isoformat()
        await db.advisory_logs.insert_one(log_doc)
    
    return ChatResponse(
        response=response,
        status=response_status,
        reference_id=reference_id,
        jurisdiction=request.jurisdiction,
        timestamp=datetime.now(timezone.utc)
    )


def generate_fallback_response(query: str, jurisdiction: str, context_docs: List[str], reference_id: str) -> str:
    return unavailable_response(reference_id)

# ============== AUDIT TRAIL ==============

@api_router.get("/audit-trail/{deal_room_id}")
async def get_audit_trail(deal_room_id: str):
    """Get complete audit trail for a deal room"""
    # Get advisory logs
    logs = await db.advisory_logs.find(
        {"deal_room_id": deal_room_id},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(100)
    
    # Get document uploads
    docs = await db.documents.find(
        {"deal_room_id": deal_room_id},
        {"_id": 0, "file_content": 0}
    ).sort("uploaded_at", -1).to_list(100)
    
    # Get compliance updates
    checklists = await db.compliance_checklists.find(
        {"deal_room_id": deal_room_id},
        {"_id": 0}
    ).sort("updated_at", -1).to_list(50)
    
    return {
        "advisory_logs": logs,
        "document_uploads": docs,
        "compliance_updates": checklists
    }

# ============== STATS ==============

@api_router.get("/stats")
async def get_stats():
    """Get system statistics"""
    deal_rooms_count = await db.deal_rooms.count_documents({})
    documents_count = await db.documents.count_documents({})
    advisory_logs_count = await db.advisory_logs.count_documents({})
    
    # Compliance stats
    compliant_count = await db.compliance_checklists.count_documents({"status": "compliant"})
    pending_count = await db.compliance_checklists.count_documents({"status": "pending"})
    overdue_count = await db.compliance_checklists.count_documents({"status": "overdue"})
    
    return {
        "deal_rooms": deal_rooms_count,
        "documents": documents_count,
        "advisory_logs": advisory_logs_count,
        "compliance": {
            "compliant": compliant_count,
            "pending": pending_count,
            "overdue": overdue_count
        }
    }

# Include the router in the main app
app.include_router(api_router)
app.include_router(identity.router)
app.include_router(workspace.router)

@app.on_event("startup")
async def create_identity_indexes():
    await identity.ensure_indexes(db)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=[origin.strip() for origin in os.environ.get('CORS_ORIGINS', 'http://localhost:3000').split(',') if origin.strip() and origin.strip() != '*'],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
