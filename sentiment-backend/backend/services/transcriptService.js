import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { getDb } from '../db/database.js';

const CHUNK_SIZE = 400; // words per chunk

/**
 * Parse a raw transcript file into structured data.
 * Handles both plain .txt and WebVTT .vtt formats.
 */
function parseRaw(rawText, filename) {
  let text = rawText;

  if (filename.endsWith('.vtt')) {
    // Strip WebVTT header, cue numbers, and timestamp lines
    text = rawText
      .replace(/^WEBVTT.*?\n\n/s, '')
      .replace(/^\d+\s*\n/gm, '')
      .replace(/\d{2}:\d{2}[:\d]*[.,]\d{3}\s*-->\s*\d{2}:\d{2}[:\d]*[.,]\d{3}[^\n]*/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return text;
}

/**
 * Detect speakers from transcript lines (e.g. "John: hello" or "[John] hello")
 */
function detectSpeakers(text) {
  const speakers = new Set();
  const patterns = [
    /^([A-Z][a-zA-Z\s]{1,30}):\s/gm,
    /^\[([A-Z][a-zA-Z\s]{1,30})\]/gm,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      speakers.add(match[1].trim());
    }
  }
  return [...speakers];
}

/**
 * Split transcript text into fixed-size word chunks.
 * Tries to break at paragraph boundaries when possible.
 */
function chunkText(text) {
  const paragraphs = text.split(/\n{2,}/);
  const chunks = [];
  let current = [];
  let wordCount = 0;

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean).length;
    if (wordCount + words > CHUNK_SIZE && current.length > 0) {
      chunks.push(current.join('\n\n'));
      current = [];
      wordCount = 0;
    }
    current.push(para);
    wordCount += words;
  }
  if (current.length > 0) chunks.push(current.join('\n\n'));

  return chunks;
}

/**
 * Extract a date from the filename (e.g. 2024-05-10_standup.txt)
 * Falls back to today's date.
 */
function extractDate(filename) {
  const match = filename.match(/(\d{4}[-_]\d{2}[-_]\d{2})/);
  return match ? match[1].replace(/_/g, '-') : new Date().toISOString().slice(0, 10);
}

/**
 * Ingest a transcript file into the database.
 * Returns the saved meeting record.
 */
export function ingestTranscript(filePath, originalName) {
  const db = getDb();
  const raw = readFileSync(filePath, 'utf8');
  const cleaned = parseRaw(raw, originalName);

  const speakers = detectSpeakers(cleaned);
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  const date = extractDate(originalName);
  const name = originalName.replace(/\.(txt|vtt)$/i, '').replace(/[-_]/g, ' ');
  const id = randomUUID();

  // Use a transaction so meeting + all chunks are saved atomically
  const insertAll = db.transaction(() => {
    db.prepare(`
      INSERT INTO meetings (id, name, date, speakers, word_count)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, date, JSON.stringify(speakers), wordCount);

    const insertChunk = db.prepare(`
      INSERT INTO chunks (meeting_id, meeting_name, meeting_date, chunk_index, content)
      VALUES (?, ?, ?, ?, ?)
    `);

    const textChunks = chunkText(cleaned);
    for (let i = 0; i < textChunks.length; i++) {
      insertChunk.run(id, name, date, i, textChunks[i]);
    }

    return { id, name, date, speakers, wordCount, chunkCount: textChunks.length };
  });

  return insertAll();
}

/**
 * Return all meetings (without chunk content).
 */
export function listMeetings() {
  const db = getDb();
  return db.prepare(`
    SELECT id, name, date, speakers, word_count, created_at
    FROM meetings ORDER BY created_at DESC
  `).all().map(m => ({ ...m, speakers: JSON.parse(m.speakers || '[]') }));
}

/**
 * Delete a meeting and its chunks (cascade handles chunks).
 */
export function deleteMeeting(id) {
  const db = getDb();
  db.prepare('DELETE FROM meetings WHERE id = ?').run(id);
}
