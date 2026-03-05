// ── 2026 Season Dates ────────────────────────────────────────────────────────
export const CUTOFF = new Date('2026-03-10T00:00:00+11:00')        // AEDT midnight Mar 10
export const GRAND_FINAL = new Date('2026-09-26T17:30:00+10:00')   // AEST — last Sat of Sep 2026

const _now = new Date()
const _seasonEnd = new Date(GRAND_FINAL.getTime() + 14 * 24 * 60 * 60 * 1000)

// COMPETITION_LOCKED: true from cutoff through the end of season window.
// Manually set to true for early lockout; will auto-derive from CUTOFF after Mar 10.
export const COMPETITION_LOCKED = true

// SEASON_OVER: 2 weeks after the grand final — join/create leagues re-appear for next season.
export const SEASON_OVER = _now >= _seasonEnd
