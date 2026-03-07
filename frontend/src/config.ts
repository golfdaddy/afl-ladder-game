// ── 2026 Season Dates ────────────────────────────────────────────────────────
export const CUTOFF = new Date('2026-03-10T00:00:00+11:00')        // AEDT midnight Mar 10
export const GRAND_FINAL = new Date('2026-09-26T17:30:00+10:00')   // AEST — last Sat of Sep 2026

const _now = new Date()
const _seasonEnd = new Date(GRAND_FINAL.getTime() + 14 * 24 * 60 * 60 * 1000)

// COMPETITION_LOCKED: true from cutoff through the end of season window.
// Auto-derived: true once the cutoff date has passed.
export const COMPETITION_LOCKED = _now >= CUTOFF

// SEASON_OVER: 2 weeks after the grand final — join/create leagues re-appear for next season.
export const SEASON_OVER = _now >= _seasonEnd

export const FEATURE_FANTASY7_ENABLED = import.meta.env.VITE_FEATURE_FANTASY7_ENABLED === 'true'
