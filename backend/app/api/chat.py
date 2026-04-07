import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
import traceback
import json

logger = logging.getLogger(__name__)
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from pydantic import BaseModel
from typing import List, Optional, Union, Any
from app.services.chat_memory_service import ChatSessionService, ChatMemoryService
from app.services.user_memory_service import UserMemoryService
from app.services.assistant_agent_service import AssistantAgentService

router = APIRouter()

# Fixed mock user UUID as requested
MOCK_USER_ID = "00000000-0000-0000-0000-000000000001"

class SessionCreateRequest(BaseModel):
    project_id: Optional[int] = None
    meeting_id: Optional[int] = None

class SessionResponse(BaseModel):
    session_id: Any

class ChatRequest(BaseModel):
    session_id: Any
    message: str
    project_id: Optional[int] = None
    meeting_ids: Optional[List[int]] = None

class Citation(BaseModel):
    meeting: str
    date: str
    timestamp: str
    speaker: Optional[str] = None
    text_snippet: str

class ChatResponse(BaseModel):
    answer: str
    citations: List[Citation]
    session_id: Any
    mode: str

class HistoryMessage(BaseModel):
    role: str
    content: str
    timestamp: str

class MemoryRequest(BaseModel):
    preference: str

@router.post("/session", response_model=SessionResponse)
async def create_session(request: SessionCreateRequest, db: AsyncSession = Depends(get_db)):
    session = await ChatSessionService.create_session(db, MOCK_USER_ID, request.project_id, request.meeting_id)
    return SessionResponse(session_id=session.id)

@router.post("/message/stream")
async def chat_message_stream(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    async def event_generator():
        try:
            async for chunk in AssistantAgentService.process_chat_stream(
                db=db,
                session_id=request.session_id,
                message=request.message,
                project_id=request.project_id,
                meeting_ids=request.meeting_ids
            ):
                yield f"data: {json.dumps(chunk)}\n\n"
        except Exception as e:
            logger.error(f"SSE Error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/session/{session_id}/history", response_model=List[HistoryMessage])
async def get_history(session_id: Any, db: AsyncSession = Depends(get_db)):
    history = await ChatMemoryService.get_history(db, session_id, limit=50)
    return [
        HistoryMessage(
            role=m.role,
            content=m.content,
            timestamp=m.created_at.isoformat() if m.created_at else ""
        ) for m in history
    ]

@router.post("/memory")
async def save_memory(request: MemoryRequest, db: AsyncSession = Depends(get_db)):
    mem = await UserMemoryService.save_preference(db, MOCK_USER_ID, request.preference)
    return {"status": "ok", "id": mem.id}

@router.get("/memory")
async def get_memories(db: AsyncSession = Depends(get_db)):
    mems = await UserMemoryService.get_memories(db, MOCK_USER_ID)
    return [{"id": str(m.id), "content": m.content, "type": m.memory_type} for m in mems]
