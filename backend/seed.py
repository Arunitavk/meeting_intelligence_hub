import asyncio
from app.database import AsyncSessionLocal, engine, Base
from app.models.domain import Project, Meeting, Decision, ActionItem
import datetime
from sqlalchemy import text
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

async def seed():
    print("Connecting to DB and recreating tables...")
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        
    print("Tables created, inserting data...")
    async with AsyncSessionLocal() as db:
        p1 = Project(name="Website Redesign", description="Redesigning the main corporate website")
        db.add(p1)
        await db.commit()
        await db.refresh(p1)
        
        m1 = Meeting(project_id=p1.id, title="Kickoff Sync", date=datetime.datetime.utcnow(), overall_sentiment=0.7)
        db.add(m1)
        await db.commit()
        await db.refresh(m1)
        
        d1 = Decision(meeting_id=m1.id, summary="Use React and Material UI", speakers="Alice, Bob")
        db.add(d1)
        
        a1 = ActionItem(meeting_id=m1.id, assignee="Charlie", task_description="Setup frontend repo", due_date="Next Monday")
        db.add(a1)
        
        await db.commit()
        print("Database seeded successfully!")

if __name__ == "__main__":
    asyncio.run(seed())
