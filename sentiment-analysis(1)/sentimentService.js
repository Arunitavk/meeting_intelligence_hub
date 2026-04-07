/**
 * sentimentService.js
 * Pure backend sentiment analysis — no external ML API needed.
 * Uses a weighted lexicon + contextual modifiers for fast, accurate results.
 */

// ─── Sentiment Lexicon ────────────────────────────────────────────────────────
const POSITIVE_WORDS = {
  // High enthusiasm (+3)
  excellent:3, outstanding:3, amazing:3, incredible:3, fantastic:3, brilliant:3,
  'world-class':3, exceptional:3, love:3, perfect:3, thrilled:3,
  // Positive (+2)
  good:2, great:2, agree:2, agreed:2, approve:2, happy:2, pleased:2, confident:2,
  ready:2, support:2, solid:2, strong:2, clear:2, done:2, delivered:2, success:2,
  // Mild positive (+1)
  fine:1, okay:1, ok:1, sure:1, right:1, yes:1, yeah:1, correct:1, understood:1,
  makes:1, sense:1, helpful:1, useful:1, interesting:1, forward:1, progress:1,
};

const NEGATIVE_WORDS = {
  // Critical concern (-3)
  failing:3, failed:3, broken:3, critical:3, severe:3, crisis:3, blocked:3,
  impossible:3, disaster:3, wrong:3, terrible:3,
  // Negative (-2)
  problem:2, issue:2, concern:2, worried:2, delay:2, delayed:2, risk:2, risky:2,
  slow:2, bug:2, error:2, failure:2, bad:2, poor:2, reject:2, disagree:2,
  // Skepticism (-1)
  maybe:1, unsure:1, unclear:1, doubt:1, wait:1, but:1, however:1, though:1,
  although:1, question:1, wondering:1, worried:1, concern:1, careful:1,
};

const INTENSIFIERS = { very:1.5, really:1.5, extremely:2, absolutely:2, quite:1.2, so:1.3 };
const NEGATORS = new Set(['not','no','never','neither','nor','without','cannot',"can't","won't","don't","didn't","isn't","aren't"]);

// ─── Core Scorer ─────────────────────────────────────────────────────────────
function scoreSentence(text) {
  const words = text.toLowerCase().replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  let score = 0;
  let wordCount = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const prev = words[i - 1] || '';
    const prev2 = words[i - 2] || '';
    const isNegated = NEGATORS.has(prev) || NEGATORS.has(prev2);
    const intensifier = INTENSIFIERS[prev] || INTENSIFIERS[prev2] || 1;

    let wordScore = 0;
    if (POSITIVE_WORDS[word]) wordScore = POSITIVE_WORDS[word] * intensifier;
    else if (NEGATIVE_WORDS[word]) wordScore = -NEGATIVE_WORDS[word] * intensifier;

    if (isNegated && wordScore !== 0) wordScore = -wordScore * 0.5;
    score += wordScore;
    if (wordScore !== 0) wordCount++;
  }

  // Normalise to -1..+1 range
  const raw = wordCount > 0 ? score / (wordCount * 3) : 0;
  return Math.max(-1, Math.min(1, raw));
}

// ─── Label & Emoji ────────────────────────────────────────────────────────────
function classifyScore(score) {
  if (score >= 0.5)  return { label: 'Positive',         emoji: '😊', color: '#22c55e', level: 'positive' };
  if (score >= 0.2)  return { label: 'High Enthusiasm',  emoji: '🔥', color: '#f97316', level: 'enthusiastic' };
  if (score >= 0)    return { label: 'Neutral',           emoji: '😐', color: '#94a3b8', level: 'neutral' };
  if (score >= -0.2) return { label: 'Skepticism',        emoji: '🤨', color: '#eab308', level: 'skeptical' };
  if (score >= -0.5) return { label: 'Critical Concern',  emoji: '⚠️',  color: '#ef4444', level: 'critical' };
  return              { label: 'Conflict',               emoji: '🚨', color: '#dc2626', level: 'conflict' };
}

// ─── Segment Parser ───────────────────────────────────────────────────────────
/**
 * Parse transcript into speaker-segmented 5-minute windows.
 * Handles formats: "SPEAKER: text", "[SPEAKER] text", "HH:MM:SS --> ... SPEAKER: text"
 */
export function parseAndAnalyse(rawText, durationMinutes = 60) {
  const lines = rawText.split('\n').filter(l => l.trim());

  // Extract speaker turns
  const turns = [];
  const speakerPattern = /^([A-Z][A-Za-z.\s]{1,25}):\s*(.+)/;
  const vttTimestamp = /(\d{2}:\d{2}(?::\d{2})?)/;

  let currentTimestamp = 0;
  let lineIndex = 0;

  for (const line of lines) {
    const tsMatch = line.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (tsMatch && !speakerPattern.test(line)) {
      const h = parseInt(tsMatch[3] ? tsMatch[1] : '0');
      const m = parseInt(tsMatch[3] ? tsMatch[2] : tsMatch[1]);
      const s = parseInt(tsMatch[3] ? tsMatch[3] : tsMatch[2] || '0');
      currentTimestamp = h * 60 + m + s / 60;
      continue;
    }

    const match = line.match(speakerPattern);
    if (match) {
      turns.push({
        speaker: match[1].trim(),
        text: match[2].trim(),
        timestamp: currentTimestamp,
        lineIndex: lineIndex++,
      });
      // Auto-advance time estimate if no explicit timestamps (~3 words/sec)
      const wordCount = match[2].split(/\s+/).length;
      currentTimestamp += wordCount / 180; // ~180 words/min
    }
  }

  if (turns.length === 0) {
    return { error: 'No speaker turns found. Use format "SPEAKER: text"' };
  }

  // ── Per-speaker stats ──────────────────────────────────────────────────────
  const speakerMap = {};
  const totalWords = turns.reduce((s, t) => s + t.text.split(/\s+/).length, 0);

  for (const turn of turns) {
    if (!speakerMap[turn.speaker]) {
      speakerMap[turn.speaker] = { scores: [], wordCount: 0, turns: [] };
    }
    const score = scoreSentence(turn.text);
    speakerMap[turn.speaker].scores.push(score);
    speakerMap[turn.speaker].wordCount += turn.text.split(/\s+/).length;
    speakerMap[turn.speaker].turns.push({ ...turn, score, ...classifyScore(score) });
  }

  const speakers = Object.entries(speakerMap).map(([name, data]) => {
    const avg = data.scores.reduce((s, v) => s + v, 0) / data.scores.length;
    const first = data.scores.slice(0, Math.ceil(data.scores.length / 2));
    const last  = data.scores.slice(Math.ceil(data.scores.length / 2));
    const firstAvg = first.reduce((s, v) => s + v, 0) / (first.length || 1);
    const lastAvg  = last.reduce((s, v) => s + v, 0) / (last.length || 1);
    const shift = Math.round((lastAvg - firstAvg) * 100 * 10) / 10;
    const talkPct = Math.round((data.wordCount / totalWords) * 100);

    return {
      name,
      avgScore: Math.round(avg * 100) / 100,
      classification: classifyScore(avg),
      talkPercent: talkPct,
      sentimentShift: shift,
      wordCount: data.wordCount,
      turns: data.turns,
    };
  }).sort((a, b) => b.talkPercent - a.talkPercent);

  // ── Timeline: group turns into 5-minute buckets per speaker ───────────────
  const bucketSize = 5; // minutes
  const numBuckets = Math.max(Math.ceil(durationMinutes / bucketSize), 1);

  const timeline = speakers.map(sp => {
    const buckets = Array.from({ length: numBuckets }, (_, i) => {
      const start = i * bucketSize;
      const end   = start + bucketSize;
      const inBucket = sp.turns.filter(t => t.timestamp >= start && t.timestamp < end);
      if (inBucket.length === 0) return null;
      const avg = inBucket.reduce((s, t) => s + t.score, 0) / inBucket.length;
      return {
        minuteStart: start,
        minuteEnd: end,
        label: `${String(Math.floor(start)).padStart(2,'0')}:${String((start%1)*60|0).padStart(2,'0')}`,
        score: Math.round(avg * 100) / 100,
        ...classifyScore(avg),
        snippets: inBucket.map(t => t.text).slice(0, 2),
      };
    }).filter(Boolean);

    return { speaker: sp.name, buckets };
  });

  // ── Overall meeting stats ──────────────────────────────────────────────────
  const allScores = turns.map(t => scoreSentence(t.text));
  const overallAvg = allScores.reduce((s, v) => s + v, 0) / allScores.length;

  return {
    meetingDuration: durationMinutes,
    overallScore: Math.round(overallAvg * 100) / 100,
    overallClassification: classifyScore(overallAvg),
    totalTurns: turns.length,
    speakers,
    timeline,
    generatedAt: new Date().toISOString(),
  };
}
