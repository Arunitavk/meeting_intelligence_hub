import math
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.domain import TranscriptSegment, Meeting

def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot_product = sum(a * b for a, b in zip(v1, v2))
    magnitude1 = math.sqrt(sum(a * a for a in v1))
    magnitude2 = math.sqrt(sum(a * a for a in v2))
    if magnitude1 == 0 or magnitude2 == 0:
        return 0.0
    return dot_product / (magnitude1 * magnitude2)

async def search_segments(db: AsyncSession, query_embedding: list[float], limit: int = 5, project_id: int = None, meeting_ids: list[int] = None):
    """
    Search SQLite segments using manual cosine similarity.
    """
    # 1. Build filtered query - fetch both Segment and Meeting
    from sqlalchemy.orm import joinedload
    stmt = select(TranscriptSegment).options(joinedload(TranscriptSegment.meeting)).join(Meeting)
    if project_id:
        stmt = stmt.where(Meeting.project_id == project_id)
    if meeting_ids:
        stmt = stmt.where(Meeting.id.in_(meeting_ids))
    
    result = await db.execute(stmt)
    all_segments = result.scalars().all()
    
    # 2. Compute similarities in memory
    scored_segments = []
    for seg in all_segments:
        if not seg.embedding:
            continue
        
        # SQLite stores JSON field as list or string depending on driver; handle both
        import json
        emb = seg.embedding
        if isinstance(emb, str):
            emb = json.loads(emb)
            
        sim = cosine_similarity(query_embedding, emb)
        scored_segments.append({
            "id": seg.id,
            "meeting_id": seg.meeting_id,
            "meeting_title": seg.meeting.title if seg.meeting else "Unknown Meeting",
            "meeting_date": seg.meeting.date.strftime("%Y-%m-%d") if seg.meeting and seg.meeting.date else "Unknown Date",
            "speaker_name": seg.speaker_name,
            "text": seg.text,
            "start_time": seg.start_time,
            "similarity": sim
        })
    
    # 3. Sort and limit
    scored_segments.sort(key=lambda x: x["similarity"], reverse=True)
    return scored_segments[:limit]
