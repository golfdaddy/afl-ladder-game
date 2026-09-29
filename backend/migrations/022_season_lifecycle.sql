-- Season lifecycle: the dates and format needed to run a season end-to-end
-- without manual intervention (auto-lock at cutoff, auto-complete after the
-- grand final, auto-create the next season from the published fixture).
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS grand_final_date DATE;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS finals_format VARCHAR(20) NOT NULL DEFAULT 'wildcard10';
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

UPDATE seasons SET grand_final_date = '2026-09-26' WHERE year = 2026 AND grand_final_date IS NULL;
