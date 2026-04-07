/**
 * sentimentService.js
 *
 * Orchestrates the full sentiment analysis pipeline for a meeting:
 *  1. Pull raw transcript chunks from the DB
 *  2. Parse into per-speaker turns (with timestamps if available)
 *  3. Call Claude API to classify sentiment per segment
 *  4. Compute aggregate speaker stats (talk-time %, sentiment shift)
 *  5. Persist everything to sentiment_segments + speaker_stats tables
 */

import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db/database.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-20250514';

// ─── Sentiment label definitions (mirrors the UI legend) ──────────────────────
export const SENTIMENT_LABELS = {
  positive:         { emoji: '😊', color: '#34c98a', description: 'Positive Sentiment'   },
  enthusiasm:       { emoji: '🔥', color: '#f5a623', description: 'High Enthusiasm'       },
  skepticism:       { emoji: '😐', color: '#f5c518', description: 'Skepticism'            },
  critical_concern: { emoji: '⚠️',  color: '#e05555', description: 'Critical Concern'     },
  neutral:          { emoji: '➡️',  color: '#6b7280', description: 'Neutral'              },
  agreement:        { emoji: '✅',  color: '#22c55e', description: 'Agreement'            },
  launch_ready:     { emoji: '🚀',  color: '#818cf8', description: 'Launch Ready'         },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert "MM:SS" or "HH:MM:SS" timestamp string to total seconds.
 */
export function timestampToSeconds(ts) {
  if (!ts) return 0;
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/**
 * Convert total seconds back to "MM:SS".
 */
export function secondsToTimestamp(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Extract initials from a speaker name (e.g. "Sarah Johnson" → "SJ").
 */
function getInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

/**
 * Parse the raw transcript text into per-speaker turns.
 * Each turn: { speaker, role, text, timestamp }
 *
 * Handles common formats:
 *   "Sarah J. (Project Lead) [05:12]: actual words here"
 *   "Sarah J.: actual words"
 *   "[05:12] Sarah J.: actual words"
 *   "SARAH J.  05:12\nactual words"
 */
function parseSpeakerTurns(rawText) {
  const turns = [];

  // Normalise line endings
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');

  // Regex patterns tried in order
  const patterns = [
    // "Sarah J. (Project Lead) [05:12]: ..."
    /^([A-Za-z][A-Za-z.\s]{1,35?}?)\s*(?:\(([^)]+)\))?\s*\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*:\s*(.+)/,
    // "[05:12] Sarah J.: ..."
    /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s+([A-Za-z][A-Za-z.\s]{1,35?}?)\s*:\s*(.+)/,
    // "Sarah J. [05:12]" on one line, text on next (VTT style)
    /^([A-Za-z][A-Za-z.\s]{1,35?}?)\s*\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*$/,
    // "Sarah J.: ..."  (no timestamp)
    /^([A-Za-z][A-Za-z.\s]{1,35?}?):\s*(.+)/,
  ];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    let matched = false;

    // Pattern 1: Name (Role) [timestamp]: text
    let m = line.match(/^([A-Za-z][A-Za-z.\s]{1,35}?)\s*(?:\(([^)]+)\))?\s*\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*:\s*(.+)/);
    if (m) {
      turns.push({ speaker: m[1].trim(), role: m[2]?.trim() || null, timestamp: m[3], text: m[4].trim() });
      matched = true;
    }

    // Pattern 2: [timestamp] Name: text
    if (!matched) {
      m = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s+([A-Za-z][A-Za-z.\s]{1,35}?)\s*:\s*(.+)/);
      if (m) {
        turns.push({ speaker: m[2].trim(), role: null, timestamp: m[1], text: m[3].trim() });
        matched = true;
      }
    }

    // Pattern 3: Name: text (no timestamp)
    if (!matched) {
      m = line.match(/^([A-Z][A-Za-z.\s]{1,35}?):\s*(.+)/);
      if (m) {
        turns.push({ speaker: m[1].trim(), role: null, timestamp: null, text: m[2].trim() });
        matched = true;
      }
    }

    // No speaker pattern — append to last turn if we have one
    if (!matched && turns.length > 0) {
      turns[turns.length - 1].text += ' ' + line;
    }

    i++;
  }

  return turns;
}

/**
 * Group individual speaker turns into segments of roughly SEGMENT_WORDS words each.
 * Returns [ { speaker, role, timestamp, endTimestamp, text } ]
 */
function groupIntoSegments(turns, segmentWords = 120) {
  // First group consecutive turns by the same speaker
  const merged = [];
  for (const turn of turns) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === turn.speaker) {
      last.text += ' ' + turn.text;
      last.endTimestamp = turn.timestamp || last.endTimestamp;
    } else {
      merged.push({ ...turn, endTimestamp: turn.timestamp });
    }
  }

  // Now split long merged turns into sub-segments by word count
  const segments = [];
  for (const block of merged) {
    const words = block.text.split(/\s+/).filter(Boolean);
    if (words.length <= segmentWords) {
      segments.push(block);
    } else {
      // Split evenly
      for (let i = 0; i < words.length; i += segmentWords) {
        segments.push({
          ...block,
          text: words.slice(i, i + segmentWords).join(' '),
        });
      }
    }
  }

  return segments;
}

/**
 * Ask Claude to classify sentiment for a batch of segments.
 * Returns a parallel array of { label, score, excerpt } objects.
 */
async function classifyBatch(segments) {
  const input = segments.map((s, i) => ({
    index: i,
    speaker: s.speaker,
    text: s.text.slice(0, 400), // truncate for prompt efficiency
  }));

  const prompt = `You are a meeting sentiment analyser. Classify the sentiment of each speaker segment below.

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

Respond ONLY with a JSON array, no markdown, no explanation.

Segments:
${JSON.stringify(input, null, 2)}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content.map(b => b.text || '').join('').trim();

  // Strip possible markdown fences
  const clean = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    const parsed = JSON.parse(clean);
    return parsed;
  } catch (err) {
    throw new Error(`Claude returned invalid JSON for sentiment batch: ${raw.slice(0, 200)}`);
  }
}

/**
 * Compute speaker-level aggregate statistics from segments.
 */
function computeSpeakerStats(speakerSegments) {
  const stats = {};

  // Total segments across all speakers (used for talk-time approximation)
  const totalSegments = Object.values(speakerSegments).reduce((s, arr) => s + arr.length, 0);

  for (const [speaker, segs] of Object.entries(speakerSegments)) {
    const scores = segs.map(s => s.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    // Sentiment shift = score of last third minus score of first third
    const third = Math.max(1, Math.floor(scores.length / 3));
    const firstAvg = scores.slice(0, third).reduce((a, b) => a + b, 0) / third;
    const lastAvg  = scores.slice(-third).reduce((a, b) => a + b, 0) / third;
    const shift    = parseFloat(((lastAvg - firstAvg) * 100).toFixed(1));

    // Dominant label
    const labelCounts = {};
    for (const s of segs) {
      labelCounts[s.label] = (labelCounts[s.label] || 0) + 1;
    }
    const dominantLabel = Object.entries(labelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';

    const talkTimePct = parseFloat(((segs.length / totalSegments) * 100).toFixed(1));

    stats[speaker] = {
      talk_time_pct: talkTimePct,
      sentiment_shift: shift,
      avg_sentiment: parseFloat(avgScore.toFixed(3)),
      dominant_label: dominantLabel,
    };
  }

  return stats;
}

// ─── Main pipeline ─────────────────────────────────────────────────────────────

/**
 * Run the full sentiment analysis for a meeting and persist results.
 * This is designed to run in the background — call it without awaiting from
 * the route handler after marking the job as 'running'.
 *
 * @param {string} meetingId
 */
export async function runSentimentAnalysis(meetingId) {
  const db = getDb();

  // Mark job as running
  db.prepare(`
    INSERT INTO sentiment_jobs (meeting_id, status, started_at)
    VALUES (?, 'running', datetime('now'))
    ON CONFLICT(meeting_id) DO UPDATE SET status='running', started_at=datetime('now'), error_msg=NULL
  `).run(meetingId);

  try {
    // 1. Pull all chunks for this meeting
    const chunks = db.prepare(`
      SELECT content FROM chunks WHERE meeting_id = ? ORDER BY chunk_index ASC
    `).all(meetingId);

    if (chunks.length === 0) throw new Error('No transcript chunks found for this meeting.');

    const fullText = chunks.map(c => c.content).join('\n\n');

    // 2. Parse into speaker turns, then segment
    const turns    = parseSpeakerTurns(fullText);
    const segments = groupIntoSegments(turns);

    if (segments.length === 0) throw new Error('Could not parse any speaker turns from the transcript.');

    // 3. Classify sentiment in batches of 15 to stay within token limits
    const BATCH_SIZE = 15;
    const allClassified = [];

    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
      const batch = segments.slice(i, i + BATCH_SIZE);
      const results = await classifyBatch(batch);
      // Merge results back — results are indexed by their position in the batch
      results.forEach(r => {
        allClassified.push({ ...batch[r.index], ...r });
      });
    }

    // 4. Group classified segments by speaker
    const bySpeaker = {};
    for (const seg of allClassified) {
      if (!bySpeaker[seg.speaker]) bySpeaker[seg.speaker] = [];
      bySpeaker[seg.speaker].push(seg);
    }

    // 5. Compute aggregate stats
    const speakerStats = computeSpeakerStats(bySpeaker);

    // 6. Persist — wrap in a transaction
    const saveAll = db.transaction(() => {
      // Clear old results for idempotency
      db.prepare('DELETE FROM sentiment_segments WHERE meeting_id = ?').run(meetingId);
      db.prepare('DELETE FROM speaker_stats WHERE meeting_id = ?').run(meetingId);

      const insertSegment = db.prepare(`
        INSERT INTO sentiment_segments
          (meeting_id, speaker_name, speaker_role, segment_index,
           timestamp_start, timestamp_end, sentiment_label, sentiment_score, excerpt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertStat = db.prepare(`
        INSERT INTO speaker_stats
          (meeting_id, speaker_name, speaker_role, talk_time_pct,
           sentiment_shift, avg_sentiment, dominant_label, avatar_initials)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Insert segments
      for (const [speaker, segs] of Object.entries(bySpeaker)) {
        segs.forEach((seg, idx) => {
          // Assign estimated timestamps if not parsed from transcript
          const estimatedTs = seg.timestamp || secondsToTimestamp(idx * 180); // ~3min apart fallback
          insertSegment.run(
            meetingId, speaker, seg.role || null, idx,
            estimatedTs, seg.endTimestamp || null,
            seg.label, seg.score, seg.excerpt || null
          );
        });
      }

      // Insert speaker stats
      for (const [speaker, stat] of Object.entries(speakerStats)) {
        const role = bySpeaker[speaker]?.[0]?.role || null;
        insertStat.run(
          meetingId, speaker, role,
          stat.talk_time_pct, stat.sentiment_shift,
          stat.avg_sentiment, stat.dominant_label,
          getInitials(speaker)
        );
      }
    });

    saveAll();

    // Mark job done
    db.prepare(`
      UPDATE sentiment_jobs SET status='done', finished_at=datetime('now') WHERE meeting_id=?
    `).run(meetingId);

  } catch (err) {
    db.prepare(`
      UPDATE sentiment_jobs SET status='error', error_msg=?, finished_at=datetime('now') WHERE meeting_id=?
    `).run(err.message, meetingId);
    throw err;
  }
}

// ─── Read queries (used by the route) ─────────────────────────────────────────

/**
 * Get the current analysis job status for a meeting.
 */
export function getJobStatus(meetingId) {
  return getDb()
    .prepare('SELECT * FROM sentiment_jobs WHERE meeting_id = ?')
    .get(meetingId) || { meeting_id: meetingId, status: 'not_started' };
}

/**
 * Fetch the full sentiment analysis result for a meeting.
 * Returns { segments, speakerStats, legend }
 */
export function getSentimentResult(meetingId) {
  const db = getDb();

  const segments = db.prepare(`
    SELECT
      speaker_name, speaker_role, segment_index,
      timestamp_start, timestamp_end,
      sentiment_label, sentiment_score, excerpt
    FROM sentiment_segments
    WHERE meeting_id = ?
    ORDER BY speaker_name, segment_index
  `).all(meetingId);

  const speakerStats = db.prepare(`
    SELECT
      speaker_name, speaker_role, talk_time_pct,
      sentiment_shift, avg_sentiment, dominant_label, avatar_initials
    FROM speaker_stats
    WHERE meeting_id = ?
    ORDER BY talk_time_pct DESC
  `).all(meetingId);

  // Group segments by speaker for timeline rendering
  const timeline = {};
  for (const seg of segments) {
    if (!timeline[seg.speaker_name]) {
      timeline[seg.speaker_name] = {
        speaker: seg.speaker_name,
        role: seg.speaker_role,
        segments: [],
      };
    }
    timeline[seg.speaker_name].segments.push({
      index:      seg.segment_index,
      timestamp:  seg.timestamp_start,
      endTime:    seg.timestamp_end,
      label:      seg.sentiment_label,
      score:      seg.sentiment_score,
      excerpt:    seg.excerpt,
      emoji:      SENTIMENT_LABELS[seg.sentiment_label]?.emoji || '•',
      color:      SENTIMENT_LABELS[seg.sentiment_label]?.color || '#6b7280',
    });
  }

  return {
    timeline: Object.values(timeline),
    speakerStats,
    legend: Object.entries(SENTIMENT_LABELS).map(([key, val]) => ({
      key,
      emoji: val.emoji,
      color: val.color,
      description: val.description,
    })),
  };
}
