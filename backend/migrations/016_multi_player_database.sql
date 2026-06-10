-- Migration 016: full player database — extended per-game stats + player directory

ALTER TABLE multi_player_stats ADD COLUMN IF NOT EXISTS kicks INT NOT NULL DEFAULT 0;
ALTER TABLE multi_player_stats ADD COLUMN IF NOT EXISTS handballs INT NOT NULL DEFAULT 0;
ALTER TABLE multi_player_stats ADD COLUMN IF NOT EXISTS marks INT NOT NULL DEFAULT 0;
ALTER TABLE multi_player_stats ADD COLUMN IF NOT EXISTS tackles INT NOT NULL DEFAULT 0;
ALTER TABLE multi_player_stats ADD COLUMN IF NOT EXISTS hitouts INT NOT NULL DEFAULT 0;
ALTER TABLE multi_player_stats ADD COLUMN IF NOT EXISTS behinds INT NOT NULL DEFAULT 0;
ALTER TABLE multi_player_stats ADD COLUMN IF NOT EXISTS goal_assists INT NOT NULL DEFAULT 0;
ALTER TABLE multi_player_stats ADD COLUMN IF NOT EXISTS clearances INT NOT NULL DEFAULT 0;
ALTER TABLE multi_player_stats ADD COLUMN IF NOT EXISTS dream_team_points INT NOT NULL DEFAULT 0;
ALTER TABLE multi_player_stats ADD COLUMN IF NOT EXISTS match_position VARCHAR(20);

-- Player directory: identity, club, listed position and bio from the AFL squad API
CREATE TABLE IF NOT EXISTS multi_players (
  player_id VARCHAR(40) PRIMARY KEY, -- AFL API id e.g. CD_I1001195
  player_name VARCHAR(255) NOT NULL,
  team_internal VARCHAR(255) NOT NULL,
  listed_position VARCHAR(40), -- e.g. MIDFIELDER, KEY_FORWARD, RUCK
  jumper_number INT,
  height_cm INT,
  weight_kg INT,
  date_of_birth DATE,
  debut_year VARCHAR(10),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_multi_players_team ON multi_players(team_internal);
