-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  verification_token VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seasons table
CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  year INT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  cutoff_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'locked', 'completed'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- AFL Ladder Snapshots (for tracking actual ladder positions over time)
CREATE TABLE IF NOT EXISTS afl_ladder_snapshots (
  id SERIAL PRIMARY KEY,
  season_id INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  round INT,
  captured_at TIMESTAMP NOT NULL,
  source VARCHAR(255), -- 'manual', 'api', 'scrape'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(season_id, round)
);

-- AFL Ladder Teams (individual team positions for a snapshot)
CREATE TABLE IF NOT EXISTS afl_ladder_teams (
  id SERIAL PRIMARY KEY,
  snapshot_id INT NOT NULL REFERENCES afl_ladder_snapshots(id) ON DELETE CASCADE,
  position INT NOT NULL, -- 1-18
  team_name VARCHAR(255) NOT NULL,
  wins INT NOT NULL,
  losses INT NOT NULL,
  points_for INT NOT NULL,
  points_against INT NOT NULL,
  percentage DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Predictions (user's predicted ladder for a season)
CREATE TABLE IF NOT EXISTS predictions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  submitted_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, season_id)
);

-- Predicted Teams (individual team positions in a user's prediction)
CREATE TABLE IF NOT EXISTS predicted_teams (
  id SERIAL PRIMARY KEY,
  prediction_id INT NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  position INT NOT NULL, -- 1-18
  team_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Competitions
CREATE TABLE IF NOT EXISTS competitions (
  id SERIAL PRIMARY KEY,
  created_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  join_code VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Competition Members
CREATE TABLE IF NOT EXISTS competition_members (
  id SERIAL PRIMARY KEY,
  competition_id INT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(competition_id, user_id)
);

-- Scores (denormalized for fast leaderboard queries)
CREATE TABLE IF NOT EXISTS scores (
  id SERIAL PRIMARY KEY,
  competition_id INT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  total_points INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(competition_id, user_id, season_id)
);

-- Point Details (breakdown per team)
CREATE TABLE IF NOT EXISTS point_details (
  id SERIAL PRIMARY KEY,
  score_id INT NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
  team_name VARCHAR(255) NOT NULL,
  predicted_position INT,
  actual_position INT,
  points_for_team INT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_predictions_user_season ON predictions(user_id, season_id);
CREATE INDEX IF NOT EXISTS idx_predictions_season ON predictions(season_id);
CREATE INDEX IF NOT EXISTS idx_competitions_season ON competitions(season_id);
CREATE INDEX IF NOT EXISTS idx_competition_members_user ON competition_members(user_id);
CREATE INDEX IF NOT EXISTS idx_competition_members_competition ON competition_members(competition_id);
CREATE INDEX IF NOT EXISTS idx_scores_competition ON scores(competition_id);
CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id);
CREATE INDEX IF NOT EXISTS idx_scores_season ON scores(season_id);
CREATE INDEX IF NOT EXISTS idx_afl_ladder_snapshots_season ON afl_ladder_snapshots(season_id);
CREATE INDEX IF NOT EXISTS idx_predicted_teams_prediction ON predicted_teams(prediction_id);
CREATE INDEX IF NOT EXISTS idx_afl_ladder_teams_snapshot ON afl_ladder_teams(snapshot_id);
