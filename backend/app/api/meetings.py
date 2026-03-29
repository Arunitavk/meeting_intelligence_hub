from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models.domain import Meeting, Decision, ActionItem, TranscriptFile
from pydantic import BaseModel
from typing import List, Optional
import datetime


router = APIRouter()

class MeetingResponse(BaseModel):
    id: int
    project_id: Optional[int]
    title: str
    date: Optional[datetime.datetime]
    overall_sentiment: Optional[float]
    
    class Config:
        from_attributes = True

class DecisionResponse(BaseModel):
    id: int
    summary: str
    rationale: Optional[str]
    time_reference: Optional[str]
    speakers: Optional[str]

    class Config:
        from_attributes = True

class ActionItemResponse(BaseModel):
    id: int
    assignee: Optional[str]
    task_description: str
    due_date: Optional[str]
    status: str

    class Config:
        from_attributes = True

@router.get("/{meeting_id}", response_model=MeetingResponse)
async def get_meeting(meeting_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalars().first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting

@router.get("/{meeting_id}/decisions", response_model=List[DecisionResponse])
async def get_meeting_decisions(meeting_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Decision).where(Decision.meeting_id == meeting_id))
    return result.scalars().all()

@router.get("/{meeting_id}/action_items", response_model=List[ActionItemResponse])
async def get_meeting_action_items(meeting_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ActionItem).where(ActionItem.meeting_id == meeting_id))
    return result.scalars().all()
