/**
 * routes/sentiment.js
 * Mount this in your main Express app:
 *   import sentimentRouter from './routes/sentiment.js';
 *   app.use('/api/sentiment', sentimentRouter);
 */

import { Router } from 'express';
import { getDb }   from '../db/database.js';
import { parseAndAnalyse } from '../services/sentimentService.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * GET /api/sentiment/:meetingId
 *
 * Runs sentiment analysis on a stored transcript.
 * Caches result in the DB so repeat requests are instant.
 *
 * Response:
 * {
 *   meetingId, meetingName, meetingDate, meetingDuration,
 *   overallScore, overallClassification,
 *   totalTurns,
 *   speakers: [{ name, avgScore, classification, talkPercent, sentimentShift, turns }],
 *   timeline: [{ speaker, buckets: [{ minuteStart, label, score, emoji, color, label, snippets }] }],
 *   generatedAt
 * }
 */
router.get('/:meetingId', (req, res) => {
  const db = getDb();
  const { meetingId } = req.params;

  // Check meeting exists
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meetingId);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found.' });

  // Return cached result if available
  const cached = db.prepare(
    'SELECT result FROM sentiment_cache WHERE meeting_id = ?'
  ).get(meetingId);
  if (cached) {
    return res.json({ ...JSON.parse(cached.result), meetingId, cached: true });
  }

  // Fetch all chunks and reconstruct full transcript
  const chunks = db.prepare(
    'SELECT content FROM chunks WHERE meeting_id = ? ORDER BY chunk_index ASC'
  ).all(meetingId);

  if (chunks.length === 0) {
    return res.status(422).json({ error: 'No transcript content found for this meeting.' });
  }

  const fullText = chunks.map(c => c.content).join('\n\n');

  // Estimate duration from word count (average speaking pace ~130 wpm)
  const wordCount = fullText.split(/\s+/).length;
  const estimatedDuration = Math.ceil(wordCount / 130);

  const result = parseAndAnalyse(fullText, estimatedDuration);

  if (result.error) return res.status(422).json({ error: result.error });

  // Persist result in cache
  db.prepare(`
    INSERT OR REPLACE INTO sentiment_cache (meeting_id, result, created_at)
    VALUES (?, ?, datetime('now'))
  `).run(meetingId, JSON.stringify({ ...result, meetingName: meeting.name, meetingDate: meeting.date }));

  res.json({ ...result, meetingId, meetingName: meeting.name, meetingDate: meeting.date, cached: false });
});

/**
 * DELETE /api/sentiment/:meetingId/cache
 * Force re-analysis by clearing the cache for a meeting.
 */
router.delete('/:meetingId/cache', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM sentiment_cache WHERE meeting_id = ?').run(req.params.meetingId);
  res.json({ success: true });
});

export default router;
