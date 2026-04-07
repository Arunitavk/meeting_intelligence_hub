from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.domain import UserMemory
import uuid

class UserMemoryService:
    @staticmethod
    async def save_preference(db: AsyncSession, user_id: str, content: str) -> UserMemory:
        mem = UserMemory(user_id=user_id, memory_type="preference", content=content)
        db.add(mem)
        await db.commit()
        await db.refresh(mem)
        return mem

    @staticmethod
    async def get_memories(db: AsyncSession, user_id: str) -> list[UserMemory]:
        result = await db.execute(
            select(UserMemory).where(UserMemory.user_id == user_id)
        )
        return list(result.scalars().all())
