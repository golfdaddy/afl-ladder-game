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

// ── Player threshold-market pricing ─────────────────────────────────────────

const PROP_MARGIN = 0.92          // house take on player markets
const MIN_PROP_PROB = 0.05        // rungs outside this probability band aren't offered
const MAX_PROP_PROB = 0.93
const MAX_PROP_ODDS = 15

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26 approximation
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax)
  return sign * y
}

function normalCdf(x: number, mean: number, std: number): number {
  return 0.5 * (1 + erf((x - mean) / (std * Math.SQRT2)))
}

/** P(count >= threshold) for a count stat, normal approximation with continuity correction. */
export function tailProbNormal(mean: number, std: number, threshold: number): number {
  const safeStd = Math.max(std, Math.max(2, mean * 0.18)) // floor: thin samples shouldn't price like certainties
  return 1 - normalCdf(threshold - 0.5, mean, safeStd)
}

/**
 * P(count >= threshold) from a player's actual game-by-game history, using a
 * kernel-density estimate. Each past game is a Gaussian bump of width
 * `bandwidth`, so a 29 contributes real probability to a 30+ rung (proximity)
 * while preserving the player's true spread — a metronome stays tight, a
 * boom-or-bust player keeps his fat tail. `shift` scales every past game for
 * form/matchup (e.g. 0.9 = expect ~10% below their historical baseline).
 * Threshold gets a -0.5 continuity correction since all AFL counts are integers.
 */
export function tailProbKde(values: number[], threshold: number, bandwidth: number, shift = 1): number {
  if (values.length === 0) return 0
  const t = threshold - 0.5
  const h = Math.max(0.3, bandwidth)
  let sum = 0
  for (const v of values) sum += 1 - normalCdf(t, v * shift, h)
  return Math.min(0.999, Math.max(0, sum / values.length))
}

/** P(count >= threshold) for goals, Poisson tail. */
export function tailProbPoisson(lambda: number, threshold: number): number {
  if (lambda <= 0) return 0
  let cumulative = 0
  let term = Math.exp(-lambda)
  for (let k = 0; k < threshold; k++) {
    if (k > 0) term *= lambda / k
    cumulative += term
  }
  return Math.max(0, 1 - cumulative)
}

/** Convert a tail probability into offered decimal odds, or null if the rung shouldn't be offered. */
export function propOdds(prob: number): { odds: number; prob: number } | null {
  if (prob < MIN_PROP_PROB || prob > MAX_PROP_PROB) return null
  const odds = Math.min(MAX_PROP_ODDS, Math.max(1.01, Math.round((1 / prob) * PROP_MARGIN * 100) / 100))
  return { odds, prob: Math.round(prob * 10000) / 10000 }
}
