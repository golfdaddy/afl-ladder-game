-- Migration 018: one-off Multi competitions

CREATE TABLE IF NOT EXISTS multi_comps (
  id SERIAL PRIMARY KEY,
  season_id INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  creator_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  join_code VARCHAR(12) NOT NULL UNIQUE,
  scope_type VARCHAR(10) NOT NULL, -- 'game' | 'round'
  scope_round INT NOT NULL,
  scope_game_id INT, -- Squiggle game id when scope_type = 'game'
  buy_in DECIMAL(12, 2) NOT NULL DEFAULT 0, -- play-money entry taken from main wallet into the pool
  starting_budget DECIMAL(12, 2) NOT NULL DEFAULT 500, -- comp wallet everyone starts with
  min_bet DECIMAL(12, 2),
  max_bet DECIMAL(12, 2),
  must_spend BOOLEAN NOT NULL DEFAULT false, -- unspent budget is forfeited from the final score
  payout_rule VARCHAR(20) NOT NULL DEFAULT 'winner_takes_all', -- 'winner_takes_all' | 'podium'
  status VARCHAR(12) NOT NULL DEFAULT 'open', -- open | complete
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS multi_comp_members (
  id SERIAL PRIMARY KEY,
  comp_id INT NOT NULL REFERENCES multi_comps(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance DECIMAL(12, 2) NOT NULL,
  total_staked DECIMAL(12, 2) NOT NULL DEFAULT 0,
  payout DECIMAL(12, 2),
  final_rank INT,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(comp_id, user_id)
);

ALTER TABLE multi_bets ADD COLUMN IF NOT EXISTS comp_id INT REFERENCES multi_comps(id) ON DELETE SET NULL;
