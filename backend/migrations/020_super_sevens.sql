-- Migration 020: Super Sevens — salary-cap fantasy (pick 7: 2 back, 2 mid, 1 ruck, 2 fwd)

CREATE TABLE IF NOT EXISTS sevens_rounds (
  id SERIAL PRIMARY KEY,
  season_id INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  round INT NOT NULL,
  budget INT NOT NULL DEFAULT 25,
  status VARCHAR(12) NOT NULL DEFAULT 'open', -- open | locked | scored
  locks_at TIMESTAMP,                          -- first game bounce of the round
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(season_id, round)
);

-- Priced player pool snapshotted per round so prices never shift mid-selection.
CREATE TABLE IF NOT EXISTS sevens_player_pool (
  id SERIAL PRIMARY KEY,
  sevens_round_id INT NOT NULL REFERENCES sevens_rounds(id) ON DELETE CASCADE,
  player_id VARCHAR(40) NOT NULL,
  player_name VARCHAR(255) NOT NULL,
  team_internal VARCHAR(255) NOT NULL,
  positions VARCHAR(10)[] NOT NULL,            -- {BACK} | {MID} | {RUCK} | {FWD} | {MID,FWD}
  avg_points DECIMAL(6, 1) NOT NULL,
  price INT NOT NULL,
  UNIQUE(sevens_round_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_sevens_pool_round ON sevens_player_pool(sevens_round_id);

CREATE TABLE IF NOT EXISTS sevens_teams (
  id SERIAL PRIMARY KEY,
  sevens_round_id INT NOT NULL REFERENCES sevens_rounds(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_price INT NOT NULL,
  score DECIMAL(8, 1),                          -- null until the round is scored
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(sevens_round_id, user_id)
);

CREATE TABLE IF NOT EXISTS sevens_team_players (
  id SERIAL PRIMARY KEY,
  team_id INT NOT NULL REFERENCES sevens_teams(id) ON DELETE CASCADE,
  player_id VARCHAR(40) NOT NULL,
  slot VARCHAR(10) NOT NULL,                    -- BACK | MID | RUCK | FWD (the slot they fill)
  price INT NOT NULL,                           -- locked at selection
  points DECIMAL(6, 1),                         -- actual fantasy points, after scoring
  UNIQUE(team_id, player_id)
);
