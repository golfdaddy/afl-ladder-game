-- Migration 017: Sportsbet-style threshold markets + saved odds board

ALTER TABLE multi_bet_legs ADD COLUMN IF NOT EXISTS stat VARCHAR(20);

-- Computed odds board, refreshed by the Multi cron for upcoming matches.
CREATE TABLE IF NOT EXISTS multi_player_odds (
  id SERIAL PRIMARY KEY,
  provider_match_id VARCHAR(40) NOT NULL,
  game_id INT NOT NULL, -- Squiggle game id
  season_year INT NOT NULL,
  round INT NOT NULL,
  player_id VARCHAR(40) NOT NULL,
  player_name VARCHAR(255) NOT NULL,
  team_internal VARCHAR(255) NOT NULL,
  stat VARCHAR(20) NOT NULL, -- disposals | goals | marks | tackles | clearances | hitouts
  threshold DECIMAL(6, 1) NOT NULL, -- "15+" style rung
  odds DECIMAL(8, 2) NOT NULL,
  implied_prob DECIMAL(6, 4) NOT NULL,
  computed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(provider_match_id, player_id, stat, threshold)
);

CREATE INDEX IF NOT EXISTS idx_multi_player_odds_game ON multi_player_odds(game_id);
