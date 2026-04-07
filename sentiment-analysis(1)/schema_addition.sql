-- Add this table to your existing schema.sql
-- It caches sentiment results so re-visiting a meeting page is instant.

CREATE TABLE IF NOT EXISTS sentiment_cache (
  meeting_id  TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  result      TEXT NOT NULL,   -- JSON blob of full analysis result
  created_at  TEXT DEFAULT (datetime('now'))
);
