from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text
from app.models.domain import TranscriptSegment

async def search_segments(db: AsyncSession, query_embedding: list[float], limit: int = 5, project_id: int = None, meeting_ids: list[int] = None):
    """
    Search pgvector for closest segments.
    Uses Cosine distance (<=>).
    """
    # Convert list to string formatted for pgvector: '[0.1, 0.2, ...]'
    embedding_str = "[" + ",".join(map(str, query_embedding)) + "]"
    
    # Base query for cosine similarity
    sql = """
        SELECT ts.id, ts.meeting_id, ts.speaker_name, ts.text, ts.start_time, 
               1 - (ts.embedding <=> :embedding) as similarity
        FROM transcript_segments ts
        JOIN meetings m ON ts.meeting_id = m.id
        WHERE 1=1
    """
    params = {"embedding": embedding_str}
    
    if project_id:
        sql += " AND m.project_id = :project_id"
        params["project_id"] = project_id
        
    if meeting_ids:
        sql += " AND m.id = ANY(:meeting_ids)"
        params["meeting_ids"] = meeting_ids
        
    sql += " ORDER BY ts.embedding <=> :embedding LIMIT :limit"
    params["limit"] = limit
    
    result = await db.execute(text(sql), params)
    
    segments = []
    for row in result:
        segments.append({
            "id": row.id,
            "meeting_id": row.meeting_id,
            "speaker_name": row.speaker_name,
            "text": row.text,
            "start_time": row.start_time,
            "similarity": row.similarity
        })
        
    return segments
