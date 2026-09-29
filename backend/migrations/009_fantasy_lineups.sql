-- Migration 009: Fantasy 7 lineups

CREATE TABLE IF NOT EXISTS fantasy_lineups (
  id SERIAL PRIMARY KEY,
  competition_id INT NOT NULL REFERENCES fantasy_competitions(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_id INT NOT NULL REFERENCES fantasy_rounds(id) ON DELETE CASCADE,
  total_cost INT NOT NULL DEFAULT 0,
  total_points DECIMAL(10, 2),
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(competition_id, user_id, round_id)
);

CREATE TABLE IF NOT EXISTS fantasy_lineup_slots (
  id SERIAL PRIMARY KEY,
  lineup_id INT NOT NULL REFERENCES fantasy_lineups(id) ON DELETE CASCADE,
  slot_code VARCHAR(10) NOT NULL, -- B1 | B2 | M1 | M2 | F1 | F2 | R1
  player_id INT NOT NULL REFERENCES fantasy_players(id) ON DELETE CASCADE,
  price_at_submit INT NOT NULL,
  points_awarded DECIMAL(10, 2),
  locked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(lineup_id, slot_code),
  UNIQUE(lineup_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_lineups_comp_round ON fantasy_lineups(competition_id, round_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_lineups_user_round ON fantasy_lineups(user_id, round_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_lineup_slots_lineup ON fantasy_lineup_slots(lineup_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_lineup_slots_player ON fantasy_lineup_slots(player_id);
