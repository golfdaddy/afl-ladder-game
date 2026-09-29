-- Migration 014: Multi (play-money betting game) core entities

CREATE TABLE IF NOT EXISTS multi_accounts (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, season_id)
);

CREATE TABLE IF NOT EXISTS multi_bets (
  id SERIAL PRIMARY KEY,
  account_id INT NOT NULL REFERENCES multi_accounts(id) ON DELETE CASCADE,
  stake DECIMAL(12, 2) NOT NULL,
  total_odds DECIMAL(12, 3) NOT NULL,
  potential_payout DECIMAL(12, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'won' | 'lost' | 'void'
  payout DECIMAL(12, 2),
  placed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS multi_bet_legs (
  id SERIAL PRIMARY KEY,
  bet_id INT NOT NULL REFERENCES multi_bets(id) ON DELETE CASCADE,
  game_id INT NOT NULL, -- Squiggle game id
  game_round INT NOT NULL,
  game_date TIMESTAMP,
  market VARCHAR(20) NOT NULL DEFAULT 'h2h',
  selection VARCHAR(255) NOT NULL, -- internal team name picked to win
  opponent VARCHAR(255) NOT NULL,
  odds DECIMAL(8, 3) NOT NULL, -- locked at placement
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'won' | 'lost' | 'void'
  settled_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_multi_bet_legs_pending ON multi_bet_legs(status, game_id);

CREATE TABLE IF NOT EXISTS multi_transactions (
  id SERIAL PRIMARY KEY,
  account_id INT NOT NULL REFERENCES multi_accounts(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL, -- positive = credit, negative = debit
  balance_after DECIMAL(12, 2) NOT NULL,
  type VARCHAR(30) NOT NULL, -- 'starting_balance' | 'weekly_topup' | 'bet_stake' | 'bet_payout' | 'bet_void_refund'
  bet_id INT REFERENCES multi_bets(id) ON DELETE SET NULL,
  note VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_multi_transactions_account ON multi_transactions(account_id, created_at);

-- One row per processed weekly top-up, so the cron can never double-credit
CREATE TABLE IF NOT EXISTS multi_topups (
  id SERIAL PRIMARY KEY,
  season_id INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  iso_week VARCHAR(10) NOT NULL, -- e.g. '2026-W24'
  amount DECIMAL(12, 2) NOT NULL,
  accounts_credited INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(season_id, iso_week)
);
