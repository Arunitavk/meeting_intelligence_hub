from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from app.database import get_db
from app.models.domain import Project, Meeting, ActionItem
from pydantic import BaseModel
from typing import List, Optional
import datetime

router = APIRouter()

class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    meeting_count: int
    action_item_count: int
    overall_sentiment: Optional[float]
    created_at: Optional[datetime.datetime]
    
    class Config:
        from_attributes = True

@router.get("/", response_model=List[ProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project))
    projects = result.scalars().all()
    
    res = []
    for p in projects:
        m_res = await db.execute(select(func.count(Meeting.id)).where(Meeting.project_id == p.id))
        m_count = m_res.scalar() or 0
        a_res = await db.execute(select(func.count(ActionItem.id)).join(Meeting).where(Meeting.project_id == p.id))
        a_count = a_res.scalar() or 0
        s_res = await db.execute(select(func.avg(Meeting.overall_sentiment)).where(Meeting.project_id == p.id))
        s_val = s_res.scalar()
        
        res.append(ProjectResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            meeting_count=m_count,
            action_item_count=a_count,
            overall_sentiment=s_val,
            created_at=p.created_at
        ))
    return res

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None

@router.post("/")
async def create_project(project: ProjectCreate, db: AsyncSession = Depends(get_db)):
    new_project = Project(name=project.name, description=project.description)
    db.add(new_project)
    await db.commit()
    await db.refresh(new_project)
    return new_project
