-- Migration 004: Password reset tokens + email groups

-- Add password reset columns to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token)
  WHERE password_reset_token IS NOT NULL;

-- Email groups (for admin-managed mailing lists)
CREATE TABLE IF NOT EXISTS email_groups (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_group_members (
  id         SERIAL PRIMARY KEY,
  group_id   INT NOT NULL REFERENCES email_groups(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at   TIMESTAMP DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_egm_group  ON email_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_egm_user   ON email_group_members(user_id);

-- Seed three default groups
INSERT INTO email_groups (name, description) VALUES
  ('Round Recaps',   'Weekly round recap emails showing ladder updates and score changes'),
  ('Season Updates', 'Important season announcements and cutoff reminders'),
  ('All Users',      'Everyone — used for major announcements')
ON CONFLICT DO NOTHING;
