import logging
import json
import re
import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.domain import Meeting, TranscriptSegment, SentimentJob, SpeakerStat
from app.services.llm_provider import GeminiProvider, GEMINI_AVAILABLE
from app.core.config import settings

logger = logging.getLogger(__name__)

# --- Sentiment Label Definitions ---
SENTIMENT_LABELS = {
    "positive":         {"emoji": "😊", "color": "#34c98a", "description": "Positive Sentiment"},
    "enthusiasm":       {"emoji": "🔥", "color": "#f5a623", "description": "High Enthusiasm"},
    "skepticism":       {"emoji": "😐", "color": "#f5c518", "description": "Skepticism"},
    "critical_concern": {"emoji": "⚠️",  "color": "#e05555", "description": "Critical Concern"},
    "neutral":          {"emoji": "➡️",  "color": "#6b7280", "description": "Neutral"},
    "agreement":        {"emoji": "✅",  "color": "#22c55e", "description": "Agreement"},
    "launch_ready":     {"emoji": "🚀",  "color": "#818cf8", "description": "Launch Ready"},
}

class SentimentService:
    @staticmethod
    def parse_speaker_turns(raw_text: str):
        """
        Parses raw transcript text into per-speaker turns.
        Each turn: { "speaker": str, "role": str|None, "text": str, "timestamp": str|None }
        """
        turns = []
        lines = raw_text.replace('\r\n', '\n').split('\n')
        
        # Pattern 1: Name (Role) [timestamp]: text
        p1 = re.compile(r'^([A-Za-z][A-Za-z.\s]{1,35}?)\s*(?:\(([^)]+)\))?\s*\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*:\s*(.+)')
        # Pattern 2: [timestamp] Name: text
        p2 = re.compile(r'^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s+([A-Za-z][A-Za-z.\s]{1,35}?)\s*:\s*(.+)')
        # Pattern 3: Name: text (no timestamp)
        p3 = re.compile(r'^([A-Z][A-Za-z.\s]{1,35}?):\s*(.+)')

        for line in lines:
            line = line.strip()
            if not line: continue
            
            matched = False
            m = p1.match(line)
            if m:
                turns.append({"speaker": m.group(1).strip(), "role": m.group(2).strip() if m.group(2) else None, "timestamp": m.group(3), "text": m.group(4).strip()})
                matched = True
            
            if not matched:
                m = p2.match(line)
                if m:
                    turns.append({"speaker": m.group(2).strip(), "role": None, "timestamp": m.group(1), "text": m.group(3).strip()})
                    matched = True
            
            if not matched:
                m = p3.match(line)
                if m:
                    turns.append({"speaker": m.group(1).strip(), "role": None, "timestamp": None, "text": m.group(2).strip()})
                    matched = True
            
            if not matched and turns:
                turns[-1]["text"] += " " + line
                
        return turns

    @staticmethod
    def group_into_segments(turns: list, segment_words: int = 120):
        """Groups turns into segments of ~120 words."""
        # Merge consecutive turns by the same speaker
        merged = []
        for turn in turns:
            if merged and merged[-1]["speaker"] == turn["speaker"]:
                merged[-1]["text"] += " " + turn["text"]
                merged[-1]["end_timestamp"] = turn["timestamp"] or merged[-1].get("end_timestamp")
            else:
                merged.append({**turn, "end_timestamp": turn["timestamp"]})
        
        segments = []
        for block in merged:
            words = block["text"].split()
            if len(words) <= segment_words:
                segments.append(block)
            else:
                for i in range(0, len(words), segment_words):
                    sub_text = " ".join(words[i : i + segment_words])
                    segments.append({**block, "text": sub_text})
        return segments

    @staticmethod
    async def run_analysis(meeting_id: int):
        """Runs the full analysis pipeline in the background."""
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            try:
                # 1. Mark job as running
                job_res = await db.execute(select(SentimentJob).where(SentimentJob.meeting_id == meeting_id))
                job = job_res.scalars().first()
                if not job:
                    job = SentimentJob(meeting_id=meeting_id)
                    db.add(job)
                
                job.status = "running"
                job.started_at = datetime.datetime.utcnow()
                job.error_msg = None
                await db.commit()

                # 2. Pull all transcript segments for the meeting
                res = await db.execute(
                    select(TranscriptSegment)
                    .where(TranscriptSegment.meeting_id == meeting_id)
                    .order_by(TranscriptSegment.id)
                )
                segments_db = res.scalars().all()
                if not segments_db:
                    raise Exception("No transcript segments found for analysis.")

                full_text = "\n".join([f"{s.speaker_name or 'Unknown'}: {s.text}" for s in segments_db])
                
                # 3. Parse and group
                turns = SentimentService.parse_speaker_turns(full_text)
                if not turns:
                    # Fallback if parsing fails (no Speaker: prefix)
                    turns = [{"speaker": s.speaker_name or "Unknown", "role": None, "timestamp": s.start_time, "text": s.text} for s in segments_db]
                
                segments = SentimentService.group_into_segments(turns)
                
                # 4. Classify in batches
                BATCH_SIZE = 10
                all_classified = []
                
                sys_msg = """You are a meeting sentiment analyser. Classify the sentiment of each speaker segment below.

For each segment return a JSON object with:
- "index": the segment index (same as input)
- "label": one of: "positive", "enthusiasm", "skepticism", "critical_concern", "neutral", "agreement", "launch_ready"
- "score": a float from -1.0 (very negative) to 1.0 (very positive)
- "excerpt": a single short representative quote (max 12 words) from the text that best captures the sentiment

Label definitions:
- positive: general positivity, satisfaction, encouragement
- enthusiasm: high energy, excitement, strong advocacy
- skepticism: doubt, uncertainty, questioning assumptions
- critical_concern: serious risk, blocker, warning, frustration
- neutral: factual, informational, no clear emotional tone
- agreement: explicit consensus, approval, sign-off
- launch_ready: readiness, confidence to ship, forward momentum

Respond ONLY with a JSON array, no markdown, no explanation."""

                for i in range(0, len(segments), BATCH_SIZE):
                    batch = segments[i : i + BATCH_SIZE]
                    input_data = [{"index": idx, "speaker": s["speaker"], "text": s["text"][:500]} for idx, s in enumerate(batch)]
                    user_prompt = f"Segments:\n{json.dumps(input_data, indent=2)}"
                    
                    batch_results = await GeminiProvider.analyze_sentiment_batch(sys_msg, user_prompt)
                    # Merge results (careful with indexing)
                    for r in batch_results:
                        idx = r.get("index")
                        if idx is not None and idx < len(batch):
                            all_classified.append({**batch[idx], **r})

                # 5. Compute stats
                by_speaker = {}
                for seg in all_classified:
                    spk = seg["speaker"]
                    if spk not in by_speaker: by_speaker[spk] = []
                    by_speaker[spk].append(seg)
                
                total_segs = len(all_classified)
                speaker_stats_list = []
                for speaker, segs in by_speaker.items():
                    scores = [s.get("score", 0) for s in segs]
                    avg_score = sum(scores) / len(scores) if scores else 0
                    
                    # Sentiment shift calculation
                    third = max(1, len(scores) // 3)
                    first_avg = sum(scores[:third]) / third
                    last_avg = sum(scores[-third:]) / third
                    shift = (last_avg - first_avg) * 100
                    
                    # Dominant label
                    labels = [s.get("label", "neutral") for s in segs]
                    dominant = max(set(labels), key=labels.count) if labels else "neutral"
                    
                    talk_time = (len(segs) / total_segs) * 100 if total_segs > 0 else 0
                    
                    initials = "".join([n[0] for n in speaker.split() if n]).upper()[:2]
                    
                    speaker_stats_list.append({
                        "name": speaker,
                        "talk_time": talk_time,
                        "shift": shift,
                        "avg": avg_score,
                        "dominant": dominant,
                        "initials": initials
                    })

                # 6. Persist to DB
                # Clear old segments and stats for this meeting
                from sqlalchemy import delete
                await db.execute(delete(SpeakerStat).where(SpeakerStat.meeting_id == meeting_id))
                # Note: We don't delete TranscriptSegments, we update them
                
                # Update segments with new sentiment
                # This is tricky because segments shifted. 
                # Simplest is to clear TranscriptSegments and re-insert or add new sentiment rows?
                # The reference uses its own tables. We'll update the existing TranscriptSegments based on time/index.
                # Actually, let's just clear and re-insert for clean timeline matching
                await db.execute(delete(TranscriptSegment).where(TranscriptSegment.meeting_id == meeting_id))
                
                for idx, seg in enumerate(all_classified):
                    new_seg = TranscriptSegment(
                        meeting_id=meeting_id,
                        speaker_name=seg["speaker"],
                        text=seg["text"],
                        start_time=seg.get("timestamp") or f"{idx // 2:02d}:{(idx % 2) * 30:02d}",
                        sentiment_score=seg.get("score"),
                        sentiment_label=seg.get("label"),
                        excerpt=seg.get("excerpt")
                    )
                    db.add(new_seg)
                
                for stat in speaker_stats_list:
                    db_stat = SpeakerStat(
                        meeting_id=meeting_id,
                        speaker_name=stat["name"],
                        talk_time_pct=stat["talk_time"],
                        sentiment_shift=stat["shift"],
                        avg_sentiment=stat["avg"],
                        dominant_label=stat["dominant"],
                        avatar_initials=stat["initials"]
                    )
                    db.add(db_stat)

                job.status = "done"
                job.finished_at = datetime.datetime.utcnow()
                await db.commit()
                logger.info(f"Sentiment analysis for meeting {meeting_id} completed.")

            except Exception as e:
                logger.error(f"Sentiment analysis failed for meeting {meeting_id}: {e}", exc_info=True)
                if job:
                    job.status = "error"
                    job.error_msg = str(e)
                    job.finished_at = datetime.datetime.utcnow()
                await db.commit()
