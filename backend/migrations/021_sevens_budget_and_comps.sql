-- Migration 021: bump Super Sevens budget to 45 and add private competitions

-- New standard budget is Ƒ45. Apply to any round that hasn't been scored yet
-- (including the current live round) so the standard takes effect immediately.
ALTER TABLE sevens_rounds ALTER COLUMN budget SET DEFAULT 45;
UPDATE sevens_rounds SET budget = 45 WHERE status != 'scored' AND budget < 45;

-- Private competitions: a named league with a shareable join code. Members are
-- ranked against each other on the active round's leaderboard. No wallet or
-- buy-in — Super Sevens is scored purely on fantasy points.
CREATE TABLE IF NOT EXISTS sevens_comps (
  id SERIAL PRIMARY KEY,
  season_id INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  creator_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  join_code VARCHAR(12) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sevens_comp_members (
  id SERIAL PRIMARY KEY,
  comp_id INT NOT NULL REFERENCES sevens_comps(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(comp_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sevens_comp_members_comp ON sevens_comp_members(comp_id);
CREATE INDEX IF NOT EXISTS idx_sevens_comp_members_user ON sevens_comp_members(user_id);
