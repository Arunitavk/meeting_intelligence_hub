from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.domain import Project, Meeting, TranscriptFile, TranscriptSegment, Decision, ActionItem
from app.services.parser_service import parse_txt, parse_vtt, parse_pdf
from app.services.nlp_service import generate_embeddings, analyze_sentiment, extract_decisions_and_actions
from typing import List, Optional
import datetime

router = APIRouter()

async def process_transcript_background(file_id: int, content: str, file_type: str, meeting_id: int):
    # This relies on a fresh DB session since it's background async
    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            # 1. Parse content
            if file_type == 'vtt':
                segments = parse_vtt(content)
            elif file_type == 'pdf':
                segments = parse_pdf(content)
            else:
                segments = parse_txt(content)
                
            full_text = " ".join([s["text"] for s in segments])
            
            # Update word count
            t_file = await db.get(TranscriptFile, file_id)
            if t_file:
                t_file.word_count = len(full_text.split())
                
            overall_sentiment_sum = 0
            total_segs = 0
                
            # 2. Process segments (embed & sentiment)
            for seg in segments:
                emb = await generate_embeddings(seg["text"])
                sent = await analyze_sentiment(seg["text"])
                
                db_seg = TranscriptSegment(
                    meeting_id=meeting_id,
                    speaker_name=seg["speaker"],
                    text=seg["text"],
                    start_time=seg["start_time"],
                    end_time=seg["end_time"],
                    embedding=emb,
                    sentiment_score=sent["score"],
                    sentiment_label=sent["label"]
                )
                db.add(db_seg)
                overall_sentiment_sum += sent["score"]
                total_segs += 1
                
            # 3. Process meeting-level extraction
            extractions = await extract_decisions_and_actions(full_text)
            
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
                
            # Update meeting sentiment
            meeting = await db.get(Meeting, meeting_id)
            if meeting and total_segs > 0:
                meeting.overall_sentiment = overall_sentiment_sum / total_segs
                
            await db.commit()
        except Exception as e:
            print(f"Background processing failed: {e}")

@router.post("/")
async def upload_transcripts(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    project_id: Optional[int] = Form(None),
    project_name: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db)
):
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
        if not file.filename.endswith('.txt') and not file.filename.endswith('.vtt') and not file.filename.endswith('.pdf'):
            results.append({"filename": file.filename, "status": "error", "error": "Unsupported file type"})
            continue
            
        content_bytes = await file.read()
        
        file_type = 'txt'
        if file.filename.endswith('.vtt'): file_type = 'vtt'
        elif file.filename.endswith('.pdf'): file_type = 'pdf'
        
        # Determine content to pass to background worker
        # PDFs need bytes, TXT/VTT need string
        if file_type == 'pdf':
            content = content_bytes
        else:
            try:
                content = content_bytes.decode('utf-8')
            except UnicodeDecodeError:
                content = content_bytes.decode('latin-1')
        
        # Create meeting (using filename as title for simplicity)
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
        
        # Trigger background processing
        background_tasks.add_task(process_transcript_background, t_file.id, content, file_type, meeting.id)
        
        results.append({"filename": file.filename, "status": "processing", "meeting_id": meeting.id})
        
    return {"uploads": results}
