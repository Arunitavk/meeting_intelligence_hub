from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.nlp_service import generate_embeddings, query_llm_with_context
from app.services.vector_store import search_segments
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    project_id: Optional[int] = None
    meeting_ids: Optional[List[int]] = None

class Citation(BaseModel):
    meeting_id: int
    text_snippet: str
    speaker: Optional[str] = None

class ChatResponse(BaseModel):
    answer: str
    citations: List[Citation]

@router.post("/query", response_model=ChatResponse)
async def chat_query(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    # 1. Embed query
    query_emb = await generate_embeddings(request.message)
    
    # 2. Search Similar Segments
    results = await search_segments(
        db=db, 
        query_embedding=query_emb, 
        limit=5, 
        project_id=request.project_id, 
        meeting_ids=request.meeting_ids
    )
    
    # Convert raw row dicts to mock objects for the LLM
    class DummySegment:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)
            
    context_objs = [DummySegment(**row) for row in results]
    
    # 3. Generate Answer
    llm_response = await query_llm_with_context(request.message, context_objs)
    
    return ChatResponse(
        answer=llm_response["answer"],
        citations=[Citation(**c) for c in llm_response["citations"]]
    )
