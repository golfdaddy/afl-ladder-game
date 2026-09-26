-- Migration 011: Optional app feature flags

CREATE TABLE IF NOT EXISTS app_feature_flags (
  key VARCHAR(100) PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO app_feature_flags (key, enabled)
VALUES ('fantasy7', false)
ON CONFLICT (key) DO NOTHING;
