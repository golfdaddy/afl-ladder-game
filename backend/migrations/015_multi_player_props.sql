-- Migration 015: Multi player props — stats store + prop columns on bet legs

CREATE TABLE IF NOT EXISTS multi_player_stats (
  id SERIAL PRIMARY KEY,
  provider_match_id VARCHAR(40) NOT NULL, -- AFL API match id e.g. CD_M20260141301
  season_year INT NOT NULL,
  round INT NOT NULL,
  team_internal VARCHAR(255) NOT NULL, -- internal team name
  player_id VARCHAR(40) NOT NULL, -- AFL API player id e.g. CD_I298437
  player_name VARCHAR(255) NOT NULL,
  disposals INT NOT NULL DEFAULT 0,
  goals INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(provider_match_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_multi_player_stats_team ON multi_player_stats(season_year, team_internal, round);
CREATE INDEX IF NOT EXISTS idx_multi_player_stats_player ON multi_player_stats(player_id, season_year);

ALTER TABLE multi_bet_legs ADD COLUMN IF NOT EXISTS player_id VARCHAR(40);
ALTER TABLE multi_bet_legs ADD COLUMN IF NOT EXISTS player_name VARCHAR(255);
ALTER TABLE multi_bet_legs ADD COLUMN IF NOT EXISTS stat_line DECIMAL(6, 1);
ALTER TABLE multi_bet_legs ADD COLUMN IF NOT EXISTS side VARCHAR(10);
ALTER TABLE multi_bet_legs ADD COLUMN IF NOT EXISTS provider_match_id VARCHAR(40);
