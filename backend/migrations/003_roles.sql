-- Migration 003: Add role system to users and competition_members

-- User-level roles: 'user' | 'admin'
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

-- Competition-level roles: 'member' | 'league_admin'
ALTER TABLE competition_members
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member';

-- Promote existing competition creators to league_admin
UPDATE competition_members cm
SET role = 'league_admin'
FROM competitions c
WHERE cm.competition_id = c.id
  AND cm.user_id = c.created_by;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_competition_members_role ON competition_members(role);
