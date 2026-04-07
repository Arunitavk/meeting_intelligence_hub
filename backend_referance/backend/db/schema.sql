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
