-- Email templates for admin campaign builder
CREATE TABLE IF NOT EXISTS email_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  subject_template TEXT NOT NULL,
  html_template TEXT NOT NULL,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_name ON email_templates(name);

-- Optional audit trail of sends
CREATE TABLE IF NOT EXISTS email_campaign_logs (
  id SERIAL PRIMARY KEY,
  template_id INT REFERENCES email_templates(id) ON DELETE SET NULL,
  sent_by INT REFERENCES users(id) ON DELETE SET NULL,
  season_id INT REFERENCES seasons(id) ON DELETE SET NULL,
  round_no INT,
  recipient_count INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_template ON email_campaign_logs(template_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_sent_at ON email_campaign_logs(sent_at DESC);
