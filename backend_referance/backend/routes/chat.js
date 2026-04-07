import { Router } from 'express';
import {
  getRelevantChunks,
  getRecentHistory,
  saveChatTurn,
  buildSystemPrompt,
} from '../services/contextService.js';
import { streamChat } from '../services/claudeService.js';

const router = Router();

/**
 * POST /api/chat
 *
 * Body:
 *   { message: string, sessionId: string }
 *
 * - sessionId ties this conversation to a specific user/browser tab.
 *   Generate it on the frontend (e.g. crypto.randomUUID()) and persist
 *   it in localStorage so the user gets the same history on reload.
 *
 * Response: text/event-stream (SSE)
 *   data: { type: 'delta', text: '...' }
 *   data: { type: 'done' }
 *   data: { type: 'error', message: '...' }
 *
 * Your frontend should:
 *   const es = new EventSource(...)  <-- doesn't work with POST
 *   Instead use fetch() with a ReadableStream reader. See README.
 */
router.post('/', async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'message is required.' });
  }
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required.' });
  }

  // --- SSE headers ---
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    // 1. Retrieve relevant transcript chunks for this query
    const chunks = getRelevantChunks(message);

    // 2. Fetch recent chat history for memory continuity
    const history = getRecentHistory(sessionId);

    // 3. Build the system prompt with transcript context injected
    const systemPrompt = buildSystemPrompt(chunks);

    // 4. Assemble the messages array: history turns + current user message
    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    // 5. Save user turn to DB before streaming (so it's persisted even on error)
    saveChatTurn(sessionId, 'user', message);

    // 6. Stream Claude's response back to the client
    const reply = await streamChat(systemPrompt, messages, res);

    // 7. Save assistant reply
    saveChatTurn(sessionId, 'assistant', reply);

  } catch (err) {
    console.error('[chat] error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

/**
 * GET /api/chat/history?sessionId=xxx
 * Returns full chat history for a session (for re-hydrating the UI on page load).
 */
router.get('/history', (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  try {
    const { getDb } = await import('../db/database.js');
    const rows = getDb()
      .prepare(`SELECT role, content, created_at FROM chat_history WHERE session_id = ? ORDER BY id ASC`)
      .all(sessionId);
    res.json({ history: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
