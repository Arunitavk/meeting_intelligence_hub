/**
 * routes/sentiment.js
 *
 * Endpoints:
 *
 *  POST   /api/sentiment/:meetingId/analyse
 *    Triggers background sentiment analysis for the meeting.
 *    Returns immediately with { status: 'running' }.
 *    Poll GET /status to track progress.
 *
 *  GET    /api/sentiment/:meetingId/status
 *    Returns current job status: pending | running | done | error | not_started
 *
 *  GET    /api/sentiment/:meetingId
 *    Returns full sentiment result once status === 'done'.
 *    Shape: { timeline, speakerStats, legend }
 *
 *  DELETE /api/sentiment/:meetingId
 *    Clears stored sentiment data for the meeting (but not the meeting itself).
 */

import { Router } from 'express';
import { getDb } from '../db/database.js';
import {
  runSentimentAnalysis,
  getJobStatus,
  getSentimentResult,
} from '../services/sentimentService.js';

const router = Router();

// ─── POST /:meetingId/analyse ─────────────────────────────────────────────────
router.post('/:meetingId/analyse', async (req, res) => {
  const { meetingId } = req.params;

  // Validate meeting exists
  const meeting = getDb()
    .prepare('SELECT id, name FROM meetings WHERE id = ?')
    .get(meetingId);

  if (!meeting) {
    return res.status(404).json({ error: `Meeting ${meetingId} not found.` });
  }

  // Reject if already running
  const job = getJobStatus(meetingId);
  if (job.status === 'running') {
    return res.status(409).json({ error: 'Analysis already in progress.', status: 'running' });
  }

  // Fire-and-forget: start analysis in background, respond immediately
  res.json({ status: 'running', meetingId, message: 'Sentiment analysis started.' });

  // Run asynchronously — errors are stored in the jobs table
  runSentimentAnalysis(meetingId).catch(err => {
    console.error(`[sentiment] analysis failed for ${meetingId}:`, err.message);
  });
});

// ─── GET /:meetingId/status ───────────────────────────────────────────────────
router.get('/:meetingId/status', (req, res) => {
  const { meetingId } = req.params;
  const job = getJobStatus(meetingId);
  res.json(job);
});

// ─── GET /:meetingId ──────────────────────────────────────────────────────────
router.get('/:meetingId', (req, res) => {
  const { meetingId } = req.params;

  const job = getJobStatus(meetingId);

  if (job.status === 'not_started') {
    return res.status(404).json({
      error: 'No analysis found. Run POST /analyse first.',
      status: 'not_started',
    });
  }

  if (job.status === 'running' || job.status === 'pending') {
    return res.status(202).json({
      error: 'Analysis still in progress.',
      status: job.status,
    });
  }

  if (job.status === 'error') {
    return res.status(500).json({
      error: job.error_msg || 'Analysis failed.',
      status: 'error',
    });
  }

  // status === 'done'
  try {
    const result = getSentimentResult(meetingId);
    res.json({
      status: 'done',
      meetingId,
      finishedAt: job.finished_at,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /:meetingId ───────────────────────────────────────────────────────
router.delete('/:meetingId', (req, res) => {
  const { meetingId } = req.params;
  const db = getDb();
  db.prepare('DELETE FROM sentiment_segments WHERE meeting_id = ?').run(meetingId);
  db.prepare('DELETE FROM speaker_stats WHERE meeting_id = ?').run(meetingId);
  db.prepare('DELETE FROM sentiment_jobs WHERE meeting_id = ?').run(meetingId);
  res.json({ success: true, message: `Sentiment data cleared for meeting ${meetingId}.` });
});

export default router;
