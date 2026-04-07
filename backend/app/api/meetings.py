from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func as sqla_func
from app.database import get_db
from typing import List, Optional, Dict, Any, Annotated
import datetime
import re
from fastapi import BackgroundTasks
from app.services.sentiment_service import SentimentService
from app.models.domain import Meeting, Decision, ActionItem, TranscriptFile, TranscriptSegment, SentimentJob, SpeakerStat


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
    status: Optional[str] = None

    class Config:
        from_attributes = True

class TranscriptSegmentResponse(BaseModel):
    id: int
    speaker_name: Optional[str]
    text: str
    start_time: Optional[str]
    end_time: Optional[str]
    sentiment_score: Optional[float]
    sentiment_label: Optional[str]
    excerpt: Optional[str]

    class Config:
        from_attributes = True

# ─── Sentiment emoji mapping ─────────────────────────────────────────────────
SENTIMENT_EMOJI_MAP = {
    "positive":         {"emoji": "😊", "label": "Positive Sentiment", "color_class": "on-surface", "bg": "#006c49"},
    "enthusiasm":       {"emoji": "🔥", "label": "High Enthusiasm", "color_class": "secondary", "bg": "#006c49"},
    "skepticism":       {"emoji": "😐", "label": "Skepticism", "color_class": "on-surface-variant", "bg": "#f8a010"},
    "critical_concern": {"emoji": "⚠️", "label": "Critical Concern", "color_class": "error", "bg": "#ff716c"},
    "neutral":          {"emoji": "➡️", "label": "Neutral", "color_class": "on-surface-variant", "bg": "#006c49"},
    "agreement":        {"emoji": "✅", "label": "Agreement", "color_class": "secondary", "bg": "#006c49"},
    "launch_ready":     {"emoji": "🚀", "label": "Launch Ready", "color_class": "on-surface", "bg": "#006c49"},
}

def _map_sentiment_to_emoji(label: str | None, score: float | None) -> dict:
    """Map a sentiment label/score to emoji data."""
    if label and label in SENTIMENT_EMOJI_MAP:
        return SENTIMENT_EMOJI_MAP[label]
    # Fallback based on score
    if score is not None:
        if score >= 0.7:
            return SENTIMENT_EMOJI_MAP["enthusiasm"]
        elif score >= 0.3:
            return SENTIMENT_EMOJI_MAP["positive"]
import re

def _format_time(time_str: str | None, text_content: str | None = None, fallback_idx: int = 0) -> str:
    """Format a time string for display, returning MM:SS or the original."""
    if time_str:
        return time_str.strip()
        
    if text_content:
        # Try to extract from CSV-like text: 14,Test Meeting,2026-04-05,00:00:02,...
        match = re.search(r'\b(\d{2}:\d{2}:\d{2})\b', text_content)
        if match:
            parts = match.group(1).split(':')
            return f"{parts[1]}:{parts[2]}"
            
    # Synthetic time fallback
    mins = (fallback_idx * 30) // 60
    secs = (fallback_idx * 30) % 60
    return f"{mins:02d}:{secs:02d}"


@router.get("/", response_model=List[MeetingResponse])
async def get_all_meetings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Meeting).order_by(Meeting.date.desc()))
    return result.scalars().all()

@router.get("/{meeting_id}/segments", response_model=List[TranscriptSegmentResponse])
async def get_meeting_segments(meeting_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TranscriptSegment)
        .where(TranscriptSegment.meeting_id == meeting_id)
        .order_by(TranscriptSegment.id)
    )
    return result.scalars().all()

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

@router.post("/{meeting_id}/analyse")
async def trigger_sentiment_analysis(meeting_id: int, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Triggers background sentiment analysis for the meeting."""
    job_res = await db.execute(select(SentimentJob).where(SentimentJob.meeting_id == meeting_id))
    job = job_res.scalars().first()
    if job and job.status == "running":
        return {"status": "running", "message": "Already analysis in progress."}
    
    if not job:
        job = SentimentJob(meeting_id=meeting_id, status="pending")
        db.add(job)
        await db.commit()
    else:
        job.status = "pending"
        job.error_msg = None
        job.started_at = None
        job.finished_at = None
        await db.commit()

    background_tasks.add_task(SentimentService.run_analysis, meeting_id)
    return {"status": "running", "message": "Background analysis task started."}

@router.get("/{meeting_id}/status")
async def get_sentiment_status(meeting_id: int, db: AsyncSession = Depends(get_db)):
    """Checks the status of the background analysis job."""
    job_res = await db.execute(select(SentimentJob).where(SentimentJob.meeting_id == meeting_id))
    job = job_res.scalars().first()
    if not job:
        return {"status": "not_started"}
    return {
        "status": job.status,
        "error_msg": job.error_msg,
        "finished_at": job.finished_at
    }

@router.get("/{meeting_id}/sentiment_analysis")
async def get_sentiment_analysis(meeting_id: int, db: AsyncSession = Depends(get_db)):
    """
    Returns a rich sentiment analysis payload derived from pre-analyzed segments and stats.
    OPTIMIZED: Loads minimal segments, filters early to avoid heavy processing.
    """
    # 1. Check job status first (fast operation)
    job_res = await db.execute(select(SentimentJob).where(SentimentJob.meeting_id == meeting_id))
    job = job_res.scalars().first()
    if not job:
        return {"status": "not_started", "speakers": [], "engagement": [], "legend": []}
    
    if job.status in ["running", "pending"]:
        return {"status": job.status, "speakers": [], "engagement": [], "legend": []}
    
    if job.status == "error":
        return {"status": "error", "error": job.error_msg, "speakers": [], "engagement": [], "legend": []}

    # 2. Get speaker-level stats (fast, indexed query)
    stats_res = await db.execute(
        select(SpeakerStat)
        .where(SpeakerStat.meeting_id == meeting_id)
        .order_by(SpeakerStat.talk_time_pct.desc())
    )
    speaker_stats = stats_res.scalars().all()
    
    # Early exit if no stats (analysis not done yet)
    if not speaker_stats:
        return {"status": "done", "speakers": [], "engagement": [], "legend": []}

    # 3. OPTIMIZATION: Only load segments with sentiment data (avoid null checks on large sets)
    seg_res = await db.execute(
        select(TranscriptSegment)
        .where(
            (TranscriptSegment.meeting_id == meeting_id) &
            (TranscriptSegment.sentiment_label.isnot(None))
        )
        .order_by(TranscriptSegment.id)
    )
    segments = seg_res.scalars().all()

    # 4. Group segments by speaker for the timeline (with optimizations)
    timeline_dict = {}
    legend_candidates = {}

    for seg in segments:
        spk = seg.speaker_name or "Unknown Speaker"
        if spk not in timeline_dict:
            timeline_dict[spk] = {
                "name": spk,
                "short_name": spk.split()[0] + (" " + spk.split()[-1][0] + "." if len(spk.split())>1 else ""),
                "role": "", # For now
                "segments": []
            }
        
        info = _map_sentiment_to_emoji(seg.sentiment_label, seg.sentiment_score)
        
        intensity = abs(seg.sentiment_score or 0)
        height = "tall" if intensity >= 0.7 else ("medium" if intensity >= 0.3 else "short")
        
        entry = {
            "id": seg.id,
            "time": seg.start_time or "00:00",
            "emoji": info["emoji"],
            "sentiment_label": seg.sentiment_label or "neutral",
            "sentiment_score": seg.sentiment_score,
            "text_preview": seg.excerpt or (seg.text[:120] + "..."),
            "bg": info["bg"],
            "height": height
        }
        timeline_dict[spk]["segments"].append(entry)
        
        lbl = seg.sentiment_label or "neutral"
        if lbl not in legend_candidates or abs(seg.sentiment_score or 0) > abs(legend_candidates[lbl].get("score", 0)):
            legend_candidates[lbl] = {
                "emoji": info["emoji"],
                "label": info["label"],
                "color_class": info["color_class"],
                "quote": f'"{seg.excerpt or (seg.text[:100] + "...")}"',
                "score": seg.sentiment_score or 0,
                "found": True
            }

    # 5. Engagement data from SpeakerStat (simplified to avoid N+1 query)
    engagement = []
    for s in speaker_stats:
        # Filter for real speakers (strictly members only)
        name_low = s.speaker_name.lower().strip()
        exclude_keywords = [
            "meeting:", "date:", "unknown", "participant:", "time:", 
            "location:", "objective:", "agenda:", "summary:", "participants:"
        ]
        if any(x in name_low for x in exclude_keywords):
            continue
            
        # Ensure name doesn't look like a timestamp or a generic label
        if re.match(r'^\d{1,2}:\d{2}', name_low) or len(name_low) < 2:
            continue
        
        # OPTIMIZATION: Use pre-calculated stats instead of recalculating from segments
        # The sentiment_shift and talk_time_pct are already computed in the DB
        pos_pct = s.talk_time_pct * 0.7 if (s.avg_sentiment or 0) > 0.3 else 50
        neg_pct = s.talk_time_pct * 0.3 if (s.avg_sentiment or 0) < -0.3 else 50
        
        engagement.append({
            "name": s.speaker_name,
            "short_name": s.speaker_name.split()[0] + (" " + s.speaker_name.split()[-1][0] + "." if len(s.speaker_name.split())>1 else ""),
            "talk_time_pct": s.talk_time_pct,
            "positive_pct": pos_pct,
            "negative_pct": neg_pct,
            "sentiment_shift": s.sentiment_shift or 0,
            "segment_count": len([seg for seg in segments if seg.speaker_name == s.speaker_name]) if segments else 0
        })

    # 6. Build Legend
    legend = []
    for key, val in SENTIMENT_EMOJI_MAP.items():
        if key in legend_candidates:
            legend.append(legend_candidates[key])
        else:
            legend.append({
                "emoji": val["emoji"],
                "label": val["label"],
                "color_class": val["color_class"],
                "quote": "No matching segment.",
                "found": False
            })

    return {
        "status": "done",
        "speakers": list(timeline_dict.values()),
        "engagement": engagement,
        "legend": legend
    }
