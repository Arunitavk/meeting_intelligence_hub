from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.domain import Project, Meeting, TranscriptFile, TranscriptSegment, Decision, ActionItem
from app.services.parser_service import parse_txt, parse_vtt, parse_pdf
from app.services.nlp_service import generate_embeddings, analyze_sentiment, extract_decisions_and_actions
from typing import List, Optional
import datetime
import logging
from app.services.sentiment_service import SentimentService
import asyncio

logger = logging.getLogger(__name__)

router = APIRouter()

async def extract_and_store_meeting_items(db: AsyncSession, meeting_id: int, content: str | bytes, file_type: str):
    if file_type == 'pdf':
        segments = parse_pdf(content)
    elif file_type == 'vtt':
        segments = parse_vtt(content)
    else:
        segments = parse_txt(content)

    if not segments:
        logger.warning(f"No transcript segments found for meeting {meeting_id} during extraction.")
        return

    full_text = "\n".join([s["text"] for s in segments]).strip()
    if not full_text:
        logger.warning(f"Transcript text was empty for meeting {meeting_id} during extraction.")
        return

    await db.execute(delete(Decision).where(Decision.meeting_id == meeting_id))
    await db.execute(delete(ActionItem).where(ActionItem.meeting_id == meeting_id))
    await db.commit()

    extractions = await extract_decisions_and_actions(full_text)
    logger.info(f"Immediate extraction for meeting {meeting_id}: {len(extractions.get('decisions', []))} decisions, {len(extractions.get('action_items', []))} actions")
    for d in extractions.get("decisions", []):
        db.add(Decision(
            meeting_id=meeting_id,
            summary=d.get("summary"),
            rationale=d.get("rationale"),
            time_reference=d.get("time_reference"),
            speakers=d.get("speakers")
        ))
    for a in extractions.get("action_items", []):
        db.add(ActionItem(
            meeting_id=meeting_id,
            assignee=a.get("assignee"),
            task_description=a.get("task_description"),
            due_date=a.get("due_date")
        ))
    await db.commit()


async def process_transcript_background(file_id: int, content: str, file_type: str, meeting_id: int):
    # Isolated session for SQLite background tasks
    from app.database import AsyncSessionLocal
    import traceback
    
    async with AsyncSessionLocal() as db:
        try:
            logger.info(f"Starting background processing for file_id {file_id}")
            
            # 1. Parse content
            if file_type == 'vtt':
                segments = parse_vtt(content)
            elif file_type == 'pdf':
                segments = parse_pdf(content)
            else:
                segments = parse_txt(content)
                
            if not segments:
                logger.warning(f"No segments parsed for file_id {file_id}")
                return
                
            full_text = " ".join([s["text"] for s in segments])
            
            # Update word count
            t_file = await db.get(TranscriptFile, file_id)
            if t_file:
                t_file.word_count = len(full_text.split())
                
            overall_sentiment_sum = 0
            total_segs = 0
                
            # 2. Process segments (embed & sentiment) - PARALLELIZED
            # Process up to 5 segments in parallel to reduce upload time
            async def process_segment(seg):
                emb = await generate_embeddings(seg["text"])
                sent = await analyze_sentiment(seg["text"])
                return {
                    "embedding": emb,
                    "sentiment": sent,
                    "segment": seg
                }
            
            # Use semaphore to limit to 5 concurrent tasks (avoid overwhelming API)
            semaphore = asyncio.Semaphore(5)
            async def bounded_process(seg):
                async with semaphore:
                    return await process_segment(seg)
            
            # Process all segments in parallel batches
            segment_results = await asyncio.gather(
                *[bounded_process(seg) for seg in segments],
                return_exceptions=True
            )
            
            # Add processed segments to DB
            for result in segment_results:
                if isinstance(result, Exception):
                    logger.error(f"Failed to process segment: {result}")
                    continue
                    
                db_seg = TranscriptSegment(
                    meeting_id=meeting_id,
                    speaker_name=result["segment"]["speaker"],
                    text=result["segment"]["text"],
                    start_time=result["segment"]["start_time"],
                    end_time=result["segment"]["end_time"],
                    embedding=result["embedding"],
                    sentiment_score=result["sentiment"]["score"],
                    sentiment_label=result["sentiment"]["label"]
                )
                db.add(db_seg)
                overall_sentiment_sum += result["sentiment"]["score"]
                total_segs += 1
                
            # Final meeting update
            meeting = await db.get(Meeting, meeting_id)
            if meeting and total_segs > 0:
                meeting.overall_sentiment = overall_sentiment_sum / total_segs
                
            await db.commit()
            
            # --- TRIGGER NEW SENTIMENT ANALYSIS ---
            await SentimentService.run_analysis(meeting_id)
            
            logger.info(f"Successfully processed file_id {file_id}")
        except Exception as e:
            logger.error(f"Background processing failed for file_id {file_id}: {str(e)}")
            logger.error(traceback.format_exc())
            await db.rollback()

from typing import List, Optional, Annotated

@router.post("/")
async def upload_transcripts(
    background_tasks: BackgroundTasks,
    files: Annotated[List[UploadFile], File(...)],
    project_id: Annotated[Optional[int], Form()] = None,
    project_name: Annotated[Optional[str], Form()] = None,
    db: AsyncSession = Depends(get_db)
):
    # Log the incoming upload request
    logger.info(f"Received upload request: project_name={project_name}, project_id={project_id}, files={len(files)}")
    if not project_id and not project_name:
        raise HTTPException(status_code=400, detail="Must provide project_id or project_name")
        
    # Get or create project
    if not project_id:
        new_proj = Project(name=project_name)
        db.add(new_proj)
        await db.commit()
        await db.refresh(new_proj)
        project_id = new_proj.id
        
    results = []
    
    for file in files:
        if not file.filename.lower().endswith('.txt') and not file.filename.lower().endswith('.vtt') and not file.filename.lower().endswith('.pdf'):
            results.append({"filename": file.filename, "status": "error", "error": "Unsupported file type"})
            continue
            
        content_bytes = await file.read()
        
        file_type = 'txt'
        if file.filename.lower().endswith('.vtt'): file_type = 'vtt'
        elif file.filename.lower().endswith('.pdf'): file_type = 'pdf'
        
        # Determine content to pass to background worker
        # PDFs need bytes, TXT/VTT need string
        if file_type == 'pdf':
            content = content_bytes
        else:
            try:
                content = content_bytes.decode('utf-8')
            except UnicodeDecodeError:
                content = content_bytes.decode('latin-1')
        
        # Create or Get meeting (check for existing to avoid duplicates)
        result = await db.execute(
            select(Meeting).where(Meeting.title == file.filename, Meeting.project_id == project_id)
        )
        meeting = result.scalar_one_or_none()
        
        if meeting:
            # Update existing meeting timestamp
            meeting.date = datetime.datetime.utcnow()
            # Optionally clear old segments if we want a fresh start
            # For now, just link new files
        else:
            meeting = Meeting(project_id=project_id, title=file.filename, date=datetime.datetime.utcnow())
            db.add(meeting)
            
        await db.commit()
        await db.refresh(meeting)
        
        # Create transcript file record
        t_file = TranscriptFile(
            meeting_id=meeting.id,
            filename=file.filename,
            file_type=file_type
        )
        db.add(t_file)
        await db.commit()
        await db.refresh(t_file)

        try:
            await extract_and_store_meeting_items(db, meeting.id, content, file_type)
        except Exception as e:
            logger.error(f"Immediate extraction failed for meeting {meeting.id}: {e}")

        # Trigger background processing for segment embeddings and sentiment only
        background_tasks.add_task(process_transcript_background, t_file.id, content, file_type, meeting.id)
        
        results.append({"filename": file.filename, "status": "processing", "meeting_id": meeting.id})
        
    return {"uploads": results}
