-- Migration 005: Add is_private flag to users
-- Private users are hidden from public leaderboards

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

-- Hide user #11 (Barry) from public leaderboards
UPDATE users SET is_private = true WHERE id = 11;

CREATE INDEX IF NOT EXISTS idx_users_is_private ON users(is_private);
