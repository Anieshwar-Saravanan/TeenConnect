-- Migration: add mentor_flags table
-- Tracks automated flags for mentors based on message moderation
CREATE TABLE IF NOT EXISTS mentor_flags (
  id SERIAL PRIMARY KEY,
  mentor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id INTEGER NULL,
  created_at timestamptz DEFAULT now(),
  reason text
);

CREATE INDEX IF NOT EXISTS idx_mentor_flags_mentor_id ON mentor_flags(mentor_id);
