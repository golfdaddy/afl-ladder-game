-- Migration 019: public discovery + ongoing (season-long) comps

ALTER TABLE multi_comps ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- scope_type now also accepts 'season' (ongoing — bets on any game, runs until
-- the season ends or it's closed manually). game/round comps are unchanged.

CREATE INDEX IF NOT EXISTS idx_multi_comps_public ON multi_comps(season_id, is_public, status);
