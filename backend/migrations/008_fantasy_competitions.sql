-- Migration 008: Fantasy 7 competitions and invites

CREATE TABLE IF NOT EXISTS fantasy_competitions (
  id SERIAL PRIMARY KEY,
  created_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  join_code VARCHAR(255) NOT NULL UNIQUE,
  start_round INT NOT NULL,
  end_round INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fantasy_competition_members (
  id SERIAL PRIMARY KEY,
  competition_id INT NOT NULL REFERENCES fantasy_competitions(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member', -- member | league_admin
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(competition_id, user_id)
);

CREATE TABLE IF NOT EXISTS fantasy_competition_invites (
  id SERIAL PRIMARY KEY,
  competition_id INT NOT NULL REFERENCES fantasy_competitions(id) ON DELETE CASCADE,
  invited_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  invite_token VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMP,
  UNIQUE(competition_id, email)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_competitions_season ON fantasy_competitions(season_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_competitions_join_code ON fantasy_competitions(join_code);
CREATE INDEX IF NOT EXISTS idx_fantasy_comp_members_user ON fantasy_competition_members(user_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_comp_members_comp ON fantasy_competition_members(competition_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_invites_comp ON fantasy_competition_invites(competition_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_invites_email ON fantasy_competition_invites(email);
CREATE INDEX IF NOT EXISTS idx_fantasy_invites_token ON fantasy_competition_invites(invite_token);
