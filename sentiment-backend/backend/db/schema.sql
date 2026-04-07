-- meetings: one row per uploaded transcript
CREATE TABLE IF NOT EXISTS meetings (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  date        TEXT NOT NULL,
  speakers    TEXT,          -- JSON array
  word_count  INTEGER,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- chunks: transcript split into ~400-word blocks for retrieval
CREATE TABLE IF NOT EXISTS chunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id  TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  meeting_name TEXT NOT NULL,
  meeting_date TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content     TEXT NOT NULL
);

-- chat_history: every user/assistant turn ever, keyed by session
CREATE TABLE IF NOT EXISTS chat_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  role        TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content     TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chunks_meeting ON chunks(meeting_id);
CREATE INDEX IF NOT EXISTS idx_history_session ON chat_history(session_id);

-- sentiment_segments: one row per speaker per time segment in a meeting
-- sentiment_label: positive | enthusiasm | skepticism | critical_concern | neutral
CREATE TABLE IF NOT EXISTS sentiment_segments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id      TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  speaker_name    TEXT NOT NULL,
  speaker_role    TEXT,
  segment_index   INTEGER NOT NULL,         -- 0-based order within speaker
  timestamp_start TEXT NOT NULL,            -- "MM:SS" e.g. "05:12"
  timestamp_end   TEXT,                     -- optional end time
  sentiment_label TEXT NOT NULL,
  sentiment_score REAL NOT NULL DEFAULT 0,  -- -1.0 to 1.0
  excerpt         TEXT,                     -- representative quote from that segment
  created_at      TEXT DEFAULT (datetime('now'))
);

-- speaker_stats: aggregated per-speaker metrics for a meeting
CREATE TABLE IF NOT EXISTS speaker_stats (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id      TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  speaker_name    TEXT NOT NULL,
  speaker_role    TEXT,
  talk_time_pct   REAL NOT NULL DEFAULT 0,  -- 0-100
  sentiment_shift REAL NOT NULL DEFAULT 0,  -- net shift (+/-) across meeting
  avg_sentiment   REAL NOT NULL DEFAULT 0,  -- mean score
  dominant_label  TEXT,                     -- most frequent sentiment label
  avatar_initials TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(meeting_id, speaker_name)
);

-- sentiment_analysis_jobs: track analysis status per meeting
CREATE TABLE IF NOT EXISTS sentiment_jobs (
  meeting_id  TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK(status IN ('pending','running','done','error')),
  error_msg   TEXT,
  started_at  TEXT,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_segments_meeting ON sentiment_segments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_stats_meeting    ON speaker_stats(meeting_id);
