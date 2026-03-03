-- Competition Invites table
CREATE TABLE IF NOT EXISTS competition_invites (
  id SERIAL PRIMARY KEY,
  competition_id INT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  invited_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  invite_token VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
  created_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  UNIQUE(competition_id, email)
);

-- Indexes for common queries
CREATE INDEX idx_competition_invites_competition ON competition_invites(competition_id);
CREATE INDEX idx_competition_invites_email ON competition_invites(email);
CREATE INDEX idx_competition_invites_token ON competition_invites(invite_token);
CREATE INDEX idx_competition_invites_status ON competition_invites(status);
