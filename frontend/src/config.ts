// ── Season Dates (override with .env) ───────────────────────────────────────
const DEFAULT_CUTOFF_AT = '2026-03-10T00:00:00+11:00'      // AEDT midnight Mar 10
const DEFAULT_GRAND_FINAL_AT = '2026-09-26T17:30:00+10:00' // AEST — last Sat of Sep 2026

function parseDate(input: string, fallback: string, label: string): Date {
  const parsed = new Date(input)
  if (!Number.isNaN(parsed.getTime())) return parsed

  console.warn(`[config] Invalid ${label}: "${input}". Falling back to ${fallback}.`)
  return new Date(fallback)
}

export const CUTOFF = parseDate(
  import.meta.env.VITE_CUTOFF_AT || DEFAULT_CUTOFF_AT,
  DEFAULT_CUTOFF_AT,
  'VITE_CUTOFF_AT'
)

export const GRAND_FINAL = parseDate(
  import.meta.env.VITE_GRAND_FINAL_AT || DEFAULT_GRAND_FINAL_AT,
  DEFAULT_GRAND_FINAL_AT,
  'VITE_GRAND_FINAL_AT'
)

const _now = new Date()
const _seasonEnd = new Date(GRAND_FINAL.getTime() + 14 * 24 * 60 * 60 * 1000)

// COMPETITION_LOCKED:
// - default: auto-lock once cutoff passes
// - optional env override: VITE_COMPETITION_LOCKED=true|false
const LOCK_OVERRIDE = import.meta.env.VITE_COMPETITION_LOCKED
export const COMPETITION_LOCKED = LOCK_OVERRIDE === 'true'
  ? true
  : LOCK_OVERRIDE === 'false'
  ? false
  : _now >= CUTOFF

// SEASON_OVER: 2 weeks after the grand final — join/create leagues re-appear for next season.
export const SEASON_OVER = _now >= _seasonEnd

export const FEATURE_FANTASY7_ENABLED = import.meta.env.VITE_FEATURE_FANTASY7_ENABLED === 'true'
