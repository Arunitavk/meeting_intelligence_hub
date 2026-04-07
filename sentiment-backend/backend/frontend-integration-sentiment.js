/**
 * SENTIMENT ANALYSIS — FRONTEND INTEGRATION GUIDE
 * ─────────────────────────────────────────────────
 *
 * This file is a plain JS reference. Copy the functions into your
 * existing frontend code (React, Vue, vanilla — doesn't matter).
 *
 * FLOW:
 *  1. User uploads a transcript  → you get back a meetingId
 *  2. Call triggerAnalysis(meetingId)
 *  3. Poll pollUntilDone(meetingId) — or wire to a button click
 *  4. Call getSentimentData(meetingId) → render timeline + stats
 */

const API_BASE = 'http://localhost:3001/api'; // change to your backend URL

// ─── 1. Trigger analysis ──────────────────────────────────────────────────────
/**
 * Call this right after a transcript is uploaded.
 * The backend responds immediately; the analysis runs in the background.
 */
async function triggerAnalysis(meetingId) {
  const res = await fetch(`${API_BASE}/sentiment/${meetingId}/analyse`, {
    method: 'POST',
  });
  return res.json();
  // Returns: { status: 'running', meetingId, message }
}

// ─── 2. Poll for job status ───────────────────────────────────────────────────
/**
 * Polls every 3 seconds until analysis is done or errored.
 * Call onProgress(status) to update a loading indicator.
 */
async function pollUntilDone(meetingId, onProgress) {
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const res  = await fetch(`${API_BASE}/sentiment/${meetingId}/status`);
        const data = await res.json();

        onProgress?.(data.status);

        if (data.status === 'done') {
          clearInterval(interval);
          resolve(data);
        } else if (data.status === 'error') {
          clearInterval(interval);
          reject(new Error(data.error_msg || 'Analysis failed'));
        }
      } catch (err) {
        clearInterval(interval);
        reject(err);
      }
    }, 3000);
  });
}

// ─── 3. Fetch results ─────────────────────────────────────────────────────────
/**
 * Fetch the full sentiment result for a meeting.
 *
 * Response shape:
 * {
 *   status: 'done',
 *   meetingId: '...',
 *   finishedAt: '2024-10-12T10:42:00',
 *
 *   timeline: [
 *     {
 *       speaker: 'Sarah J.',
 *       role: 'Project Lead',
 *       segments: [
 *         {
 *           index: 0,
 *           timestamp: '05:12',
 *           endTime:   '12:45',
 *           label:     'positive',
 *           score:     0.72,
 *           excerpt:   'Team agrees this is the best path forward.',
 *           emoji:     '😊',
 *           color:     '#34c98a',
 *         },
 *         ...
 *       ]
 *     },
 *     ...
 *   ],
 *
 *   speakerStats: [
 *     {
 *       speaker_name:    'Sarah J.',
 *       speaker_role:    'Project Lead',
 *       talk_time_pct:   38,
 *       sentiment_shift: +12.4,   // positive = became more positive over meeting
 *       avg_sentiment:   0.65,
 *       dominant_label:  'positive',
 *       avatar_initials: 'SJ',
 *     },
 *     ...
 *   ],
 *
 *   legend: [
 *     { key: 'positive',         emoji: '😊', color: '#34c98a', description: 'Positive Sentiment'  },
 *     { key: 'enthusiasm',       emoji: '🔥', color: '#f5a623', description: 'High Enthusiasm'      },
 *     { key: 'skepticism',       emoji: '😐', color: '#f5c518', description: 'Skepticism'           },
 *     { key: 'critical_concern', emoji: '⚠️',  color: '#e05555', description: 'Critical Concern'    },
 *     ...
 *   ]
 * }
 */
async function getSentimentData(meetingId) {
  const res = await fetch(`${API_BASE}/sentiment/${meetingId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── 4. Delete / re-run ───────────────────────────────────────────────────────
async function clearSentimentData(meetingId) {
  const res = await fetch(`${API_BASE}/sentiment/${meetingId}`, { method: 'DELETE' });
  return res.json();
}

// ─── Full example usage ───────────────────────────────────────────────────────
async function exampleFlow(meetingId) {
  // Kick off analysis
  await triggerAnalysis(meetingId);

  // Show a spinner while polling
  showSpinner('Analysing sentiment...');
  await pollUntilDone(meetingId, status => {
    console.log('Analysis status:', status);
  });
  hideSpinner();

  // Fetch and render
  const data = await getSentimentData(meetingId);
  renderSentimentTimeline(data.timeline);
  renderEngagementMatrix(data.speakerStats);
  renderLegend(data.legend);
}

// ─── Rendering helpers (adapt to your framework) ──────────────────────────────

/**
 * Render the Sentiment Timeline section.
 * Each speaker gets a horizontal row of clickable segment pills.
 */
function renderSentimentTimeline(timeline) {
  const container = document.getElementById('sentiment-timeline');
  container.innerHTML = '';

  for (const speaker of timeline) {
    const row = document.createElement('div');
    row.className = 'speaker-row';

    // Speaker label
    row.innerHTML = `
      <div class="speaker-label">
        <span class="speaker-name">${speaker.speaker}</span>
        <span class="speaker-role">${speaker.role || ''}</span>
      </div>
      <div class="segment-track"></div>
    `;

    const track = row.querySelector('.segment-track');
    for (const seg of speaker.segments) {
      const pill = document.createElement('div');
      pill.className = 'sentiment-pill';
      pill.style.backgroundColor = seg.color;
      pill.innerHTML = `
        <span class="pill-emoji">${seg.emoji}</span>
        <span class="pill-time">${seg.timestamp}</span>
      `;
      // Clicking opens original transcript context
      pill.addEventListener('click', () => showTranscriptContext(seg));
      track.appendChild(pill);
    }

    container.appendChild(row);
  }
}

/**
 * Render the Active Engagement Matrix section.
 */
function renderEngagementMatrix(speakerStats) {
  const container = document.getElementById('engagement-matrix');
  container.innerHTML = '';

  for (const s of speakerStats) {
    const shiftColor  = s.sentiment_shift >= 0 ? '#34c98a' : '#e05555';
    const shiftPrefix = s.sentiment_shift >= 0 ? '+' : '';

    container.innerHTML += `
      <div class="speaker-stat-row">
        <div class="avatar">${s.avatar_initials}</div>
        <div class="speaker-info">
          <span class="name">${s.speaker_name}</span>
          <div class="talk-bar-wrap">
            <div class="talk-bar" style="width:${s.talk_time_pct}%"></div>
          </div>
          <span class="talk-label">${s.talk_time_pct}% total talk-time</span>
        </div>
        <div class="shift-badge" style="color:${shiftColor}">
          ${shiftPrefix}${s.sentiment_shift}%
          <span class="shift-label">SENTIMENT SHIFT</span>
        </div>
      </div>
    `;
  }
}

/**
 * Show a transcript excerpt when user clicks a segment pill.
 */
function showTranscriptContext(segment) {
  // Implement this however your frontend handles modals/drawers
  console.log(`[Ref: ${segment.timestamp}]`, segment.excerpt);
}

// Stub helpers — replace with your actual UI functions
function showSpinner(msg) { console.log(msg); }
function hideSpinner()    { /* hide loading state */ }
function renderLegend(legend) { /* render legend pills */ }
