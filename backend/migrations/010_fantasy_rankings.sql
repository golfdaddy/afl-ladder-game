-- Migration 010: Fantasy 7 round ranking snapshots

CREATE TABLE IF NOT EXISTS fantasy_round_rankings (
  id SERIAL PRIMARY KEY,
  competition_id INT NOT NULL REFERENCES fantasy_competitions(id) ON DELETE CASCADE,
  round_id INT NOT NULL REFERENCES fantasy_rounds(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lineup_id INT NOT NULL REFERENCES fantasy_lineups(id) ON DELETE CASCADE,
  points DECIMAL(10, 2) NOT NULL,
  salary_used INT NOT NULL,
  submitted_at TIMESTAMP NOT NULL,
  rank INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(competition_id, round_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_rankings_comp_round ON fantasy_round_rankings(competition_id, round_id, rank);
CREATE INDEX IF NOT EXISTS idx_fantasy_rankings_user ON fantasy_round_rankings(user_id);
