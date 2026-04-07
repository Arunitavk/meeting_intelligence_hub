import re
import math
import hashlib
import json
import logging
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from app.core.config import settings

logger = logging.getLogger(__name__)

_analyzer = SentimentIntensityAnalyzer()

from app.services.llm_provider import GeminiProvider, GEMINI_AVAILABLE

print(f"DEBUG: GEMINI_AVAILABLE = {GEMINI_AVAILABLE}")

async def generate_embeddings(text: str) -> list[float]:
    """Generates 1536-dimensional embeddings. Uses OpenAI if available and key provided, else deterministic hash fallback."""
    if GEMINI_AVAILABLE and settings.GEMINI_API_KEY:
        try:
            return await GeminiProvider.generate_embeddings(text)
        except Exception as e:
            print(f"Gemini embedding failed: {e}, falling back to hash.")
    
    # Deterministic fallback logic to 1536 dimensions
    hash_obj = hashlib.sha256(text.encode('utf-8', errors='ignore'))
    digest = hash_obj.digest()
    
    vector = []
    # 32 bytes in sha256 -> expand to 1536
    for i in range(1536):
        byte_val = digest[i % 32]
        # value varies from -1 to 1 based on byte and position
        val = (byte_val / 128.0 - 1.0) * math.sin(i * 0.1)
        vector.append(val)
        
    # normalize to unit length for cosine similarity
    norm = math.sqrt(sum([x*x for x in vector]))
    if norm == 0: norm = 1
    return [x/norm for x in vector]

async def analyze_sentiment(text: str) -> dict:
    """Real sentiment analysis using VADER."""
    scores = _analyzer.polarity_scores(text)
    score = scores['compound']
    
    if score >= 0.3:
        if score >= 0.7:
            label = "enthusiasm"
        else:
            label = "positive"
    elif score <= -0.3:
        if score <= -0.7:
            label = "conflict"
        else:
            label = "negative"
    else:
        label = "neutral"
        
    return {"score": score, "label": label}

UNIVERSAL_EXTRACTION_PROMPT = """You are a universal meeting transcript intelligence engine.

Your job is to analyze any meeting transcript and extract:
1. Decisions
2. Action Items
3. Key discussion points
4. Speaker-specific concerns or commitments when clearly supported
5. Any unresolved items only if they are explicitly mentioned

You must work for any transcript format and any topic.

CRITICAL RULES
- Use only information present in the transcript.
- Do not guess missing owners, due dates, or decisions.
- Do not invent facts.
- If a field is missing, return null.
- Every extracted decision or action item must include a short evidence quote from the transcript.
- Prefer explicit statements over inferred ones.
- If the transcript is ambiguous, still extract only the items that are strongly supported.
- If no valid decision or action item exists, return empty arrays.
- Keep the output in valid JSON only.
- If the transcript is very long, analyze it in chunks and merge the results carefully without duplicates.

WHAT TO EXTRACT

A. Decisions
Extract only statements where the team clearly agreed on something.
Examples of decision cues:
- "Decision:"
- "We decided"
- "We will"
- "Let's do X"
- "The team agreed"
- "Final decision"

For each decision, return:
- id: string
- title: short title
- summary: one-sentence explanation
- speaker: who stated it or led it
- evidence: exact short quote from the transcript
- timestamp: if available, otherwise null
- confidence: number between 0 and 1

B. Action Items
Extract every task assigned to a specific person or group.
Examples of action cues:
- "I will"
- "I'll"
- "X will"
- "X, please..."
- "Action Item:"
- "Owner:"
- "Due:"
- "Can you..."
- "Please handle..."

For each action item, return:
- id: string
- owner: person or group responsible, or null if unclear
- task: what needs to be done
- due_date: exact date if stated, otherwise null
- speaker: who assigned or discussed it
- evidence: exact short quote from the transcript
- timestamp: if available, otherwise null
- confidence: number between 0 and 1

C. Key Discussion Points
Extract only important discussion topics that explain context for decisions or action items.
For each point, return:
- topic
- summary
- speakers_involved
- evidence
- timestamp
- confidence

D. Speaker-Specific Concerns / Commitments
If a speaker clearly raises concerns, objections, or commitments, summarize them briefly.
For each item, return:
- speaker
- type: concern | commitment | objection | agreement
- summary
- evidence
- timestamp
- confidence

OUTPUT FORMAT
Return JSON in this exact structure:
{
  "decisions": [
    {
      "id": "d1",
      "title": "...",
      "summary": "...",
      "speaker": "...",
      "evidence": "...",
      "timestamp": null,
      "confidence": 0.0
    }
  ],
  "action_items": [
    {
      "id": "a1",
      "owner": "...",
      "task": "...",
      "due_date": null,
      "speaker": "...",
      "evidence": "...",
      "timestamp": null,
      "confidence": 0.0
    }
  ],
  "discussion_points": [],
  "speaker_items": [],
  "unconfirmed": []
}"""

async def extract_decisions_and_actions(text: str = None, use_llm: bool = True, segments: list = None) -> dict:
    """Extract decisions, action items, and more using a chunked universal extraction engine.
    
    Args:
        text: Full concatenated transcript text (legacy, deprecated)
        use_llm: Whether to use LLM for extraction fallback
        segments: List of segment dicts with 'text', 'speaker', 'start_time', 'end_time' keys
    """
    import asyncio
    
    # If segments provided, reconstruct text with speaker labels for better context
    if segments:
        text_lines = []
        for seg in segments:
            speaker = seg.get('speaker', 'Unknown')
            seg_text = seg.get('text', '').strip()
            if seg_text:
                # Remove timestamp prefix if present (e.g., "[00:10:20] Speaker" -> "Speaker")
                # Pattern: [HH:MM:SS] prefix
                speaker_clean = re.sub(r'^\[\d{2}:\d{2}:\d{2}\]\s*', '', speaker) if speaker else 'Unknown'
                # Format: "Speaker: text" to preserve context
                if speaker_clean and speaker_clean != 'Unknown' and speaker_clean not in ['MEETING', 'DATE', 'PARTICIPANTS']:
                    text_lines.append(f"{speaker_clean}: {seg_text}")
                elif seg_text:
                    text_lines.append(seg_text)
        text = "\n".join(text_lines)
    
    
    if not text:
        return {
            "decisions": [],
            "action_items": [],
            "discussion_points": [],
            "speaker_items": [],
            "unconfirmed": []
        }
    
    def is_valid_decision_text(raw_line: str) -> bool:
        if not raw_line:
            return False
        text = raw_line.strip()
        lower = text.lower()
        if len(text) < 20:
            return False
        low_strip = lower.strip(" .!?,;:\n\r")
        noise_phrases = {
            "agreed",
            "sounds good",
            "okay",
            "ok",
            "yes",
            "yep",
            "sure",
            "great decision captured",
            "decision captured",
            "good idea",
            "understood"
        }
        if any(low_strip == phrase for phrase in noise_phrases):
            return False
        return True

    # ── Chunking Logic ──
    # Split text into chunks ~4000 characters, respecting newlines
    chunks = []
    lines = text.split('\n')
    current_chunk = []
    current_length = 0
    for line in lines:
        if current_length + len(line) > 4000 and current_chunk:
            chunks.append("\n".join(current_chunk))
            current_chunk = [line]
            current_length = len(line)
        else:
            current_chunk.append(line)
            current_length += len(line) + 1
    if current_chunk:
        chunks.append("\n".join(current_chunk))
        
    global_decisions = []
    global_actions = []
    global_discussion = []
    global_speaker_items = []
    global_unconfirmed = []

    # ── 1. Deterministic Pass ──
    def parse_action_line(raw_line: str) -> dict:
        assignee = None
        due_date = None
        text = raw_line.strip()

        # Strategy 1: Extract speaker from "Speaker: text" format
        if ": " in text:
            parts = text.split(": ", 1)
            if len(parts[0].split()) <= 3 and parts[0][0].isupper():  # likely a speaker name
                speaker_candidate = parts[0]
                action_text = parts[1]
                # Only use as assignee if it looks like a name
                if re.match(r'^[A-Z][a-z]+(\s+[A-Z][a-z]+)?$', speaker_candidate):
                    assignee = speaker_candidate
                    # Extract due date from the action text
                    due_match = re.search(r'by\s+([^.!?,\n]+?)(?=[.!?,\n]|$)', action_text, re.I)
                    if due_match:
                        due_date = due_match.group(1).strip()
                    # Use action text for task
                    text = action_text
        
        # Strategy 2: Look for explicit "owner:" or "due:" labels
        owner_match = re.search(r'owner[:\-]\s*([^\|\-–—]+)', text, re.I)
        if owner_match:
            assignee = owner_match.group(1).strip()

        due_match = re.search(r'due[:\-]\s*([A-Za-z0-9\-/ ,]+)', text, re.I)
        if due_match:
            due_date = due_match.group(1).strip()

        # Strategy 3: Extract name from dash-prefixed format (e.g., "- John will do X")
        if not assignee:
            name_match = re.search(r'[-–—]\s*([A-Z][a-z]+)\b', text)
            if name_match:
                assignee = name_match.group(1).strip()

        # Strategy 4: Extract name from "FirstName will/shall/can" pattern (backward compat)
        if not assignee:
            person_match = re.search(r'([A-Z][a-z]+)\s+(?:will|shall|can you|please|must|needs to|should|\'ll|\'re)\b', text)
            if person_match:
                assignee = person_match.group(1).strip()

        # Strategy 5: Extract due date from "by [date]" pattern if not already found
        if not due_date:
            due_match = re.search(r'by\s+([^.!?,\n]+?)(?=[.!?,\n]|$)', text, re.I)
            if due_match:
                due_date_candidate = due_match.group(1).strip()
                # Only accept if it looks like a date (contains day/month/date keywords)
                if any(x in due_date_candidate.lower() for x in ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'day', 'week', 'month', 'th', 'st', 'nd', 'rd']) or re.search(r'\d{1,2}', due_date_candidate):
                    due_date = due_date_candidate

        return {
            "assignee": assignee,
            "task_description": text[:400],
            "due_date": due_date,
            "speaker": assignee,
            "evidence": text[:400],
            "timestamp": None,
            "confidence": 0.5,
            "_source": "heuristic"
        }

    def parse_decision_line(raw_line: str) -> dict:
        text = raw_line.strip()
        lower = text.lower()
        summary = text

        if lower.startswith('decision:'):
            summary = text.split(':', 1)[1].strip()
        elif 'decision:' in lower:
            summary = text.split(':', 1)[1].strip()
        elif lower.startswith(('we decided', 'it was decided', 'it was agreed', 'the team decided', 'the team agreed', "let's", "lets", 'we should', 'we will', 'we are going to', 'we are going with', 'go ahead', 'move forward', 'approved', 'approve')):
            summary = text
        elif 'approved' in lower and ':' in lower:
            summary = text.split(':', 1)[1].strip()

        return {
            "summary": summary[:200],
            "rationale": text[:400],
            "time_reference": None,
            "speakers": None,
            "evidence": text[:400],
            "confidence": 0.5,
            "_source": "heuristic"
        }

    decision_cues = re.compile(r'\b(?:decision|decided|agreed|consensus|resolved|final decision|approved|approve|we will|we\'ll|we are going to|we are going with|we should|we should proceed|we should move forward|the team agreed|the team decided|it was decided|it was agreed|let\'s|lets|go ahead|move forward|sign off|authorize|authorise|authorised)\b', re.I)
    action_cues = re.compile(r'\b(action item|to-?do|i\'ll|i will|we\'ll|will (investigate|look into|complete|follow up|do|create|update|deploy|deliver|review|refactor|prepare|send|draft|schedule|coordinate|take|optimize|provide|expand|analyze|inform)|please (do|review|send|prepare|coordinate|follow up|ensure)|can you|follow[ -]?up|needs to|must (review|update|complete|send|prepare|coordinate|investigate)|owner:|task:|due:)\b', re.I)

    # First pass: explicit line-level patterns for clearly labeled actions/decisions
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        low_line = line.lower()

        if 'action item' in low_line or 'owner:' in low_line or 'task:' in low_line or 'due:' in low_line:
            global_actions.append(parse_action_line(line))
            continue

        if 'decision:' in low_line or decision_cues.search(low_line):
            if is_valid_decision_text(line):
                global_decisions.append(parse_decision_line(line))
            continue

    # Second pass: sentence-level heuristics for implicit decisions and tasks
    for idx, sentence in enumerate(re.split(r'(?<=[.!?])\s+|\n+', text)):
        s = sentence.strip()
        if not s:
            continue
        low = s.lower()

        if action_cues.search(low):
            global_actions.append(parse_action_line(s))
            continue

        if decision_cues.search(low) and is_valid_decision_text(s):
            global_decisions.append(parse_decision_line(s))

    # ── 2. LLM Pass ──
    if use_llm and GEMINI_AVAILABLE and settings.GEMINI_API_KEY:
        async def process_chunk(chunk_text):
            try:
                out = await GeminiProvider.extract_decisions_actions(UNIVERSAL_EXTRACTION_PROMPT, chunk_text)
                return out if isinstance(out, dict) else {}
            except Exception as e:
                print(f"Chunk extraction failed: {e}")
                return {}

        results = await asyncio.gather(*(process_chunk(c) for c in chunks))
        
        for res in results:
            for d in res.get("decisions", []):
                global_decisions.append({
                    "summary": f"{d.get('title', '')}: {d.get('summary', '')}".strip(": "),
                    "rationale": d.get("evidence", ""),
                    "time_reference": d.get("timestamp"),
                    "speakers": d.get("speaker"),
                    "raw_extracted": d
                })
            for a in res.get("action_items", []):
                global_actions.append({
                    "assignee": a.get("owner"),
                    "task_description": a.get("task", ""),
                    "due_date": a.get("due_date"),
                    "raw_extracted": a
                })
            global_discussion.extend(res.get("discussion_points", []))
            global_speaker_items.extend(res.get("speaker_items", []))
            global_unconfirmed.extend(res.get("unconfirmed", []))

    # ── 3. Deduplication ──
    def normalize_str(s):
        return re.sub(r'\W+', '', str(s).lower()) if s else ""

    dedup_decisions = []
    seen_dec = set()
    # Process LLM results first (if any) since they're higher quality, then heuristics are dropped if duplicate
    global_decisions.sort(key=lambda x: 0 if "raw_extracted" in x else 1)
    
    for d in global_decisions:
        norm = normalize_str(d.get("summary"))
        if norm and len(norm) > 10 and norm in seen_dec:
            continue
        if norm: seen_dec.add(norm)
        dedup_decisions.append(d)

    dedup_actions = []
    seen_act = set()
    global_actions.sort(key=lambda x: 0 if "raw_extracted" in x else 1)
    
    for a in global_actions:
        norm = normalize_str(a.get("task_description")) + normalize_str(a.get("assignee"))
        if norm and len(norm) > 10 and norm in seen_act:
            continue
        if norm: seen_act.add(norm)
        dedup_actions.append(a)

    logger.info(f"Universal Extraction complete. Returning {len(dedup_decisions)} decisions, {len(dedup_actions)} action items.")
    logger.info(f"Ignored {len(global_discussion)} discussion points, {len(global_speaker_items)} speaker items, and {len(global_unconfirmed)} unconfirmed items.")

    return {
        "decisions": dedup_decisions,
        "action_items": dedup_actions,
        "discussion_points": global_discussion,
        "speaker_items": global_speaker_items,
        "unconfirmed": global_unconfirmed
    }

async def query_llm_with_context(query: str, context_segments: list) -> dict:
    """Generate answer backed by transcript context using an LLM or fallback summarization."""
    citations = []
    combined_context = ""
    
    for idx, seg in enumerate(context_segments):
        speaker = getattr(seg, "speaker_name", "Unknown") if getattr(seg, "speaker_name", None) else "Unknown"
        snippet = str(getattr(seg, "text", ""))
        
        citations.append({
            "meeting_id": getattr(seg, "meeting_id", -1),
            "text_snippet": snippet[:100] + ("..." if len(snippet) > 100 else ""),
            "speaker": speaker
        })
        combined_context += f"- [Meeting {getattr(seg, 'meeting_id', -1)}] {speaker}: {snippet}\n"

    if GEMINI_AVAILABLE and settings.GEMINI_API_KEY:
        try:
            sys_msg = "You are a meeting assistant. Answer the user query using strictly the provided context. Cite speakers and meetings where applicable."
            prompt = f"Context:\n{combined_context}\n\nUser Query: {query}"
            
            answer = await GeminiProvider.generate_answer(system_prompt=sys_msg, user_prompt=prompt)
            return {
                "answer": answer,
                "citations": citations
            }
        except Exception as e:
            print(f"Gemini Chat failed: {e}, falling back to heuristics.")

    # Fallback reasoning logic
    if not context_segments:
        answer = "No relevant context found in meetings to answer this query."
    else:
        answer = f"Based on keyword alignment, I found {len(context_segments)} relevant remarks regarding your query.\n\n"
        answer += "Heuristic Summary of closest points:\n"
        for i, cit in enumerate(citations[:3]):
            answer += f"{i+1}. {cit['speaker']} stated: \"{cit['text_snippet']}\"\n"
            
    return {
        "answer": answer,
        "citations": citations
    }
