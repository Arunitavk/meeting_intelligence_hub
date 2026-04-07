import { getDb } from '../db/database.js';

const MAX_CHUNKS = 15;       // max chunks to send to Claude per request
const MAX_HISTORY = 10;      // last N chat turns to include as memory

/**
 * Score a chunk against a user query using keyword overlap.
 * Simple but effective for a local first implementation.
 * Swap this function for an embedding cosine-similarity call
 * when you want semantic search (OpenAI/Cohere/local embeddings).
 */
function scoreChunk(chunkText, queryWords) {
  const lower = chunkText.toLowerCase();
  return queryWords.reduce((score, word) => {
    if (word.length < 3) return score;
    // Exact match scores more than partial
    const exact = lower.includes(` ${word} `) ? 2 : 0;
    const partial = lower.includes(word) ? 1 : 0;
    return score + exact + partial;
  }, 0);
}

/**
 * Retrieve the most relevant transcript chunks for a given query.
 * Returns an array of { meetingName, meetingDate, content } objects.
 */
export function getRelevantChunks(query) {
  const db = getDb();
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  // Fetch all chunks (for large deployments, pre-filter by FTS or date here)
  const allChunks = db.prepare(`
    SELECT meeting_name, meeting_date, content
    FROM chunks
  `).all();

  if (allChunks.length === 0) return [];

  // Score and sort
  const scored = allChunks
    .map(chunk => ({ ...chunk, score: scoreChunk(chunk.content, queryWords) }))
    .sort((a, b) => b.score - a.score);

  // If no chunk matched at all, return the first MAX_CHUNKS as a fallback
  const relevant = scored[0].score === 0
    ? scored.slice(0, MAX_CHUNKS)
    : scored.filter(c => c.score > 0).slice(0, MAX_CHUNKS);

  return relevant;
}

/**
 * Fetch the last N chat turns for a session.
 * Used to give Claude short-term memory within and across sessions.
 */
export function getRecentHistory(sessionId) {
  const db = getDb();
  return db.prepare(`
    SELECT role, content FROM chat_history
    WHERE session_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(sessionId, MAX_HISTORY).reverse();
}

/**
 * Save a single chat turn to the database.
 */
export function saveChatTurn(sessionId, role, content) {
  const db = getDb();
  db.prepare(`
    INSERT INTO chat_history (session_id, role, content) VALUES (?, ?, ?)
  `).run(sessionId, role, content);
}

/**
 * Build the full system prompt from retrieved chunks.
 */
export function buildSystemPrompt(chunks) {
  const contextBlock = chunks.length > 0
    ? chunks.map(c =>
        `[Meeting: ${c.meeting_name} | Date: ${c.meeting_date}]\n${c.content}`
      ).join('\n\n---\n\n')
    : 'No transcripts have been uploaded yet.';

  return `You are a Meeting Intelligence Assistant with access to the content of one or more meeting transcripts.

Your job is to answer user questions by reasoning over the transcript context provided below.

Rules:
- Always cite which meeting your information came from using the format [Meeting: <name>].
- If the answer spans multiple meetings, cite all relevant ones.
- If information is not found in the transcripts, say so clearly — do not guess.
- For action items always include: who is responsible, what the task is, and deadline if mentioned.
- Use clear formatting: **bold** for names and key terms, bullet points for lists.
- Be concise but thorough.

--- TRANSCRIPT CONTEXT ---
${contextBlock}
--- END CONTEXT ---`;
}
