// Converts a model win probability into Sportsbet-style decimal odds.

const HOUSE_MARGIN = 0.05
const MIN_PROB = 0.04
const MAX_PROB = 0.96

/** Squiggle probabilities arrive as 0–1 or 0–100 depending on field; null means no model tip. */
export function normalizeProb(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0.5
  const p = value > 1 ? value / 100 : value
  return Math.min(MAX_PROB, Math.max(MIN_PROB, p))
}

export function probToOdds(prob: number | null | undefined): number {
  const p = normalizeProb(prob)
  const odds = (1 / p) * (1 - HOUSE_MARGIN)
  return Math.max(1.01, Math.round(odds * 100) / 100)
}

export function gameOdds(hprob: number | null | undefined): { home: number; away: number } {
  const p = normalizeProb(hprob)
  return { home: probToOdds(p), away: probToOdds(1 - p) }
}
