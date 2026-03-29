import random

async def generate_embeddings(text: str) -> list[float]:
    """Mock generating embeddings. Returns a 1536-dimensional random vector."""
    return [random.uniform(-0.1, 0.1) for _ in range(1536)]

async def analyze_sentiment(text: str) -> dict:
    """Mock sentiment analysis."""
    score = random.uniform(-1, 1) # -1 is negative, 1 is positive
    if score > 0.3:
        label = "positive"
    elif score < -0.3:
        label = "negative"
    else:
        label = "neutral"
    
    # Add random conflict/enthusiasm metadata occasionally
    if score > 0.8:
        label = "enthusiasm"
    if score < -0.8:
        label = "conflict"
        
    return {"score": score, "label": label}

async def extract_decisions_and_actions(text: str) -> dict:
    """Mock LLM extraction of decisions and action items from full text."""
    # In a real app, this would send the text to an LLM like OpenAI with a structured prompt
    return {
        "decisions": [
            {
                "summary": "Agreed to proceed with the modern web stack.",
                "rationale": "Better component ecosystem and performance.",
                "time_reference": "05:20",
                "speakers": "Alice, Bob"
            }
        ],
        "action_items": [
            {
                "assignee": "Charlie",
                "task_description": "Setup the database infrastructure",
                "due_date": "Next Friday"
            }
        ]
    }

async def query_llm_with_context(query: str, context_segments: list) -> dict:
    """Mock RAG generation."""
    citations = []
    for idx, seg in enumerate(context_segments):
        citations.append({
            "meeting_id": seg.meeting_id,
            "text_snippet": seg.text[:50] + "...",
            "speaker": seg.speaker_name
        })
    
    return {
        "answer": f"Based on the transcripts, here is the answer: The team heavily discussed '{query}'. See citations for exact details.",
        "citations": citations
    }
