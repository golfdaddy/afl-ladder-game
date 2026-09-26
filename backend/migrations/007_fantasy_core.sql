-- Migration 007: Fantasy 7 core entities

CREATE TABLE IF NOT EXISTS fantasy_rounds (
  id SERIAL PRIMARY KEY,
  season_id INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  round_no INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open' | 'live' | 'final'
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(season_id, round_no)
);

CREATE TABLE IF NOT EXISTS fantasy_players (
  id SERIAL PRIMARY KEY,
  external_id VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  afl_team VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fantasy_player_eligibility (
  id SERIAL PRIMARY KEY,
  player_id INT NOT NULL REFERENCES fantasy_players(id) ON DELETE CASCADE,
  position VARCHAR(10) NOT NULL, -- BACK | MID | FWD | RUCK
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, position)
);

CREATE TABLE IF NOT EXISTS fantasy_round_players (
  id SERIAL PRIMARY KEY,
  round_id INT NOT NULL REFERENCES fantasy_rounds(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES fantasy_players(id) ON DELETE CASCADE,
  avg_score DECIMAL(10, 2) NOT NULL DEFAULT 0,
  price_bucket INT NOT NULL DEFAULT 1, -- 1..5
  lock_at TIMESTAMP NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(round_id, player_id)
);

CREATE TABLE IF NOT EXISTS fantasy_round_player_scores (
  id SERIAL PRIMARY KEY,
  round_id INT NOT NULL REFERENCES fantasy_rounds(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES fantasy_players(id) ON DELETE CASCADE,
  fantasy_points DECIMAL(10, 2) NOT NULL DEFAULT 0,
  source_updated_at TIMESTAMP,
  is_final BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(round_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_rounds_season ON fantasy_rounds(season_id, round_no);
CREATE INDEX IF NOT EXISTS idx_fantasy_players_external ON fantasy_players(external_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_eligibility_player ON fantasy_player_eligibility(player_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_round_players_round ON fantasy_round_players(round_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_round_players_player ON fantasy_round_players(player_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_round_scores_round ON fantasy_round_player_scores(round_id);
