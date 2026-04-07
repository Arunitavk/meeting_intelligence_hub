from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
from app.models.domain import ChatSession, ChatMessage
import uuid

class ChatSessionService:
    @staticmethod
    async def create_session(db: AsyncSession, user_id: str, project_id: int | None = None, meeting_id: int | None = None) -> ChatSession:
        sess = ChatSession(user_id=user_id, project_id=project_id, meeting_id=meeting_id)
        db.add(sess)
        await db.commit()
        await db.refresh(sess)
        return sess

    @staticmethod
    async def get_session(db: AsyncSession, session_id: str) -> ChatSession | None:
        result = await db.execute(select(ChatSession).where(ChatSession.id == session_id))
        return result.scalars().first()

class ChatMemoryService:
    @staticmethod
    async def add_message(db: AsyncSession, session_id: str, role: str, content: str) -> ChatMessage:
        msg = ChatMessage(session_id=session_id, role=role, content=content)
        db.add(msg)
        await db.commit()
        await db.refresh(msg)
        return msg

    @staticmethod
    async def get_history(db: AsyncSession, session_id: str, limit: int = 10) -> list[ChatMessage]:
        result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(desc(ChatMessage.created_at))
            .limit(limit)
        )
        return list(result.scalars().all())[::-1]
