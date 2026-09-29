import https from 'https'

const SQUIGGLE_BASE = 'https://api.squiggle.com.au'

// Map Squiggle API team names → our internal team names (as stored in predictions)
const SQUIGGLE_TO_INTERNAL: Record<string, string> = {
  'Adelaide':          'Adelaide Crows',
  'Brisbane':          'Brisbane Lions',
  'Brisbane Lions':    'Brisbane Lions',
  'Carlton':           'Carlton',
  'Collingwood':       'Collingwood',
  'Essendon':          'Essendon',
  'Fremantle':         'Fremantle',
  'Geelong':           'Geelong',
  'Gold Coast':        'Gold Coast Suns',
  'GWS':                    'GWS Giants',
  'Greater Western Sydney': 'GWS Giants',
  'Hawthorn':          'Hawthorn',
  'Melbourne':         'Melbourne',
  'North Melbourne':   'North Melbourne',
  'Port Adelaide':     'Port Adelaide',
  'Richmond':          'Richmond',
  'St Kilda':          'St Kilda',
  'Sydney':            'Sydney Swans',
  'West Coast':        'West Coast Eagles',
  'Western Bulldogs':  'Western Bulldogs',
}

// Manual post-finals position overrides, keyed by season year then internal team
// name. Post-finals positions are normally derived automatically from real finals
// results (see jobs/ladderSync.ts + utils/finalsBracket.ts); this map is the
// escape hatch for a season where the automatic derivation needs correcting.
// Manual entries win over automatic ones for the same team.
const FINALS_POSITION_ADJUSTMENTS: Record<number, Record<string, number>> = {
  2026: {
    'Brisbane Lions': 1, // premiers
    'Fremantle': 2,      // grand final runner-up
    'Sydney Swans': 3,   // preliminary final loser
    'Hawthorn': 4,       // preliminary final loser
    'Melbourne': 9,      // wildcard loser
    'Collingwood': 10,   // wildcard loser
  },
}

export function getManualFinalsPins(year: number): Record<string, number> {
  return FINALS_POSITION_ADJUSTMENTS[year] || {}
}

// Squiggle occasionally changes how it names a club (e.g. "Brisbane" became
// "Brisbane Lions" in 2026). Resolve tolerantly — exact, case-insensitive, then
// by leading word — and record anything we still can't place so the admin
// health endpoint and alerts can surface it instead of scoring silently breaking.
const unknownTeamNames = new Map<string, Date>()
const lowerMap = new Map(Object.entries(SQUIGGLE_TO_INTERNAL).map(([k, v]) => [k.toLowerCase(), v]))

export function resolveTeamName(raw: string): string {
  if (!raw) return raw
  const exact = SQUIGGLE_TO_INTERNAL[raw]
  if (exact) return exact
  const lower = raw.trim().toLowerCase()
  const ci = lowerMap.get(lower)
  if (ci) return ci
  // "Brisbane Lions FC" / "GWS Giants" style variants — match on the leading word(s)
  for (const [key, value] of lowerMap) {
    if (lower.startsWith(key + ' ') || key.startsWith(lower + ' ')) return value
  }
  if (!unknownTeamNames.has(raw)) {
    unknownTeamNames.set(raw, new Date())
    console.warn(`[Squiggle] Unknown team name: "${raw}" — add to SQUIGGLE_TO_INTERNAL map`)
  }
  return raw
}

export function getUnknownTeamNames(): Array<{ name: string; firstSeen: Date }> {
  return [...unknownTeamNames.entries()].map(([name, firstSeen]) => ({ name, firstSeen }))
}

interface SquiggleStanding {
  name: string
  rank: number
  wins: number
  losses: number
  draws: number
  for: number        // points scored
  against: number    // points conceded
  percentage: number
}

interface SquiggleResponse {
  standings: SquiggleStanding[]
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'AFLLadderPredictor/1.0 (contact: admin@aflladder.com)' } },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => (raw += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw) as T)
          } catch {
            reject(new Error(`Failed to parse Squiggle response (status ${res.statusCode})`))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(10000, () => {
      req.destroy()
      reject(new Error('Squiggle API request timed out'))
    })
  })
}

export interface SquiggleMappedTeam {
  position: number
  teamName: string
  wins: number
  losses: number
  draws: number
  pointsFor: number
  pointsAgainst: number
  percentage: number
}

export interface SquiggleGame {
  id: number
  round: number
  roundname: string
  hteam: string     // home team (Squiggle name)
  ateam: string     // away team (Squiggle name)
  hteamName: string // home team (internal name)
  ateamName: string // away team (internal name)
  complete: number  // 0 = upcoming, 100 = complete
  date: string | null
  venue: string | null
  hprob: number | null // Squiggle win probability for home team
  is_final: number | null
}

export interface SquiggleProjectedTeam {
  teamName: string    // internal name
  source: string      // model name e.g. 'squiggle', 'matterofstats'
  rank: number        // projected final rank
  projWins: number    // projected wins
  swarms: number[]    // probability distribution over positions 1–18
}

interface SquiggleGamesResponse {
  games: Array<{
    id: number
    round: number
    roundname: string
    hteam: string
    ateam: string
    hscore: number | null
    ascore: number | null
    winner: string
    complete: number
    date: string | null
    venue: string | null
    hprob: number | null
    is_final: number | null
  }>
}

interface SquiggleLadderResponse {
  ladder: Array<{
    team: string
    source: string
    rank: number
    wins: number
    swarms: number[]
  }>
}

/**
 * Re-seats pinned teams at the given positions, keeping every other team in its
 * existing order. Positions are renumbered 1..N afterwards. Returns the ladder
 * untouched (with a warning) if a pinned team is missing, a position is out of
 * range, or two teams share a position.
 */
export function applyPositionPins(
  teams: SquiggleMappedTeam[],
  pins: Record<string, number>,
  label = 'post-finals positions'
): SquiggleMappedTeam[] {
  const entries = Object.entries(pins)
  if (entries.length === 0) return teams

  const pinned = entries.map(([teamName, position]) => ({
    team: teams.find(t => t.teamName === teamName),
    position,
  }))
  const positions = new Set(pinned.map(p => p.position))
  if (pinned.some(p => !p.team || p.position < 1 || p.position > teams.length) || positions.size !== pinned.length) {
    console.warn(`[Squiggle] ${label} reference missing teams or conflicting positions — skipping`)
    return teams
  }

  const rest = [...teams]
    .sort((a, b) => a.position - b.position)
    .filter(t => pins[t.teamName] === undefined)

  const reordered: SquiggleMappedTeam[] = []
  for (let pos = 1; pos <= teams.length; pos++) {
    const pin = pinned.find(p => p.position === pos)
    reordered.push(pin ? pin.team! : rest.shift()!)
  }

  console.log(`[Squiggle] Applied ${label}: ` + entries.map(([t, p]) => `${t} → ${p}`).join(', '))
  return reordered.map((t, idx) => ({ ...t, position: idx + 1 }))
}

export interface SeasonFixtureSummary {
  year: number
  gameCount: number
  firstGameDate: string | null   // YYYY-MM-DD (Melbourne)
  lastGameDate: string | null
  grandFinalDate: string | null  // present once Squiggle publishes the finals fixture
}

/** Melbourne calendar date of a Squiggle game timestamp ("YYYY-MM-DD HH:MM:SS", AEST/AEDT). */
function melbourneDate(date: string | null): string | null {
  if (!date) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(date)
  return m ? m[1] : null
}

export class SquiggleService {
  /**
   * Fetch current season standings from Squiggle API.
   * Returns null if no standings data is available yet (pre-season).
   */
  static async fetchStandings(year: number): Promise<SquiggleMappedTeam[] | null> {
    const url = `${SQUIGGLE_BASE}/?q=standings;year=${year}`
    console.log(`[Squiggle] Fetching standings for ${year}: ${url}`)

    const data = await fetchJson<SquiggleResponse>(url)

    if (!data.standings || data.standings.length === 0) {
      console.warn(`[Squiggle] No standings returned for ${year}`)
      return null
    }

    const mapped: SquiggleMappedTeam[] = data.standings
      .sort((a, b) => a.rank - b.rank)
      .map((s) => ({
        position:      s.rank,
        teamName:      resolveTeamName(s.name),
        wins:          s.wins,
        losses:        s.losses,
        draws:         s.draws || 0,
        pointsFor:     Math.round(s.for || 0),
        pointsAgainst: Math.round(s.against || 0),
        percentage:    Math.round((s.percentage || 0) * 10) / 10,
      }))

    if (mapped.length < 18) {
      console.warn(`[Squiggle] Only ${mapped.length} teams returned — season may not have started`)
    }

    return mapped
  }

  /**
   * Summarise the published fixture for a year: first/last game dates and the
   * grand final date once the finals fixture is out. Empty when Squiggle has no
   * games for that year yet (fixture not published).
   */
  static async fetchSeasonFixture(year: number): Promise<SeasonFixtureSummary> {
    const url = `${SQUIGGLE_BASE}/?q=games;year=${year}`
    console.log(`[Squiggle] Fetching season fixture: ${url}`)
    const data = await fetchJson<SquiggleGamesResponse>(url)
    const games = (data.games || []).filter(g => !!g.date)
    const dates = games.map(g => melbourneDate(g.date)!).filter(Boolean).sort()
    const grandFinal = games
      .filter(g => g.is_final && /grand/i.test(g.roundname || ''))
      .map(g => melbourneDate(g.date)!)
      .sort()
      .pop() || null

    return {
      year,
      gameCount: games.length,
      firstGameDate: dates[0] || null,
      lastGameDate: dates[dates.length - 1] || null,
      grandFinalDate: grandFinal,
    }
  }

  /**
   * Fetch upcoming (incomplete) games for the current round from Squiggle.
   * Returns the current-round games that haven't been played yet.
   */
  static async fetchUpcomingGames(year: number): Promise<SquiggleGame[]> {
    // Fetch all incomplete games for the year
    const url = `${SQUIGGLE_BASE}/?q=games;year=${year};complete=0`
    console.log(`[Squiggle] Fetching upcoming games: ${url}`)

    const data = await fetchJson<SquiggleGamesResponse>(url)

    if (!data.games || data.games.length === 0) {
      console.warn(`[Squiggle] No upcoming games for ${year}`)
      return []
    }

    // Group by round, return only the nearest upcoming round
    const rounds = [...new Set(data.games.map(g => g.round))].sort((a, b) => a - b)
    const nearestRound = rounds[0]
    const roundGames = data.games.filter(g => g.round === nearestRound)

    return roundGames.map(g => ({
      id: g.id,
      round: g.round,
      roundname: g.roundname,
      hteam: g.hteam,
      ateam: g.ateam,
      hteamName: resolveTeamName(g.hteam),
      ateamName: resolveTeamName(g.ateam),
      complete: g.complete,
      date: g.date,
      venue: g.venue,
      hprob: g.hprob,
      is_final: g.is_final,
    }))
  }

  /**
   * Fetch projected final ladder positions from Squiggle's model suite.
   * Returns projections grouped by source model.
   */
  static async fetchProjectedLadder(year: number): Promise<SquiggleProjectedTeam[]> {
    const url = `${SQUIGGLE_BASE}/?q=ladder;year=${year}`
    console.log(`[Squiggle] Fetching projected ladder: ${url}`)

    const data = await fetchJson<SquiggleLadderResponse>(url)

    if (!data.ladder || data.ladder.length === 0) {
      console.warn(`[Squiggle] No projected ladder data for ${year}`)
      return []
    }

    return data.ladder.map(entry => ({
      teamName: resolveTeamName(entry.team),
      source: entry.source,
      rank: entry.rank,
      projWins: Math.round(entry.wins * 10) / 10,
      swarms: entry.swarms || [],
    }))
  }

  /**
   * Fetch ALL incomplete regular-season games for the year, grouped by round.
   * Finals rounds (is_final = 1) are excluded.
   */
  static async fetchAllUpcomingRounds(year: number): Promise<{ round: number; roundname: string; games: SquiggleGame[] }[]> {
    const url = `${SQUIGGLE_BASE}/?q=games;year=${year};complete=0`
    console.log(`[Squiggle] Fetching all upcoming rounds: ${url}`)

    const data = await fetchJson<SquiggleGamesResponse>(url)
    if (!data.games || data.games.length === 0) return []

    // Only regular-season games (not finals)
    const regularGames = data.games.filter(g => !g.is_final)
    const roundNums = [...new Set(regularGames.map(g => g.round))].sort((a, b) => a - b)

    return roundNums.map(round => {
      const roundGames = regularGames.filter(g => g.round === round)
      return {
        round,
        roundname: roundGames[0].roundname,
        games: roundGames.map(g => ({
          id: g.id,
          round: g.round,
          roundname: g.roundname,
          hteam: g.hteam,
          ateam: g.ateam,
          hteamName: resolveTeamName(g.hteam),
          ateamName: resolveTeamName(g.ateam),
          complete: g.complete,
          date: g.date,
          venue: g.venue,
          hprob: g.hprob ?? (g as any).hconfidence ?? null,
          is_final: g.is_final,
        })),
      }
    })
  }

  // 5-minute cache so markets/bet placement don't hammer Squiggle's tips endpoint
  private static tipsCache: { year: number; fetchedAt: number; probs: Map<number, number> } | null = null

  /**
   * Home-team win probabilities (0–100) per game id, from Squiggle model tips.
   * Uses the 'Aggregate' source when present, otherwise the mean of all models.
   */
  static async fetchHomeProbabilities(year: number): Promise<Map<number, number>> {
    const now = Date.now()
    if (this.tipsCache && this.tipsCache.year === year && now - this.tipsCache.fetchedAt < 5 * 60 * 1000) {
      return this.tipsCache.probs
    }

    const url = `${SQUIGGLE_BASE}/?q=tips;year=${year}`
    console.log(`[Squiggle] Fetching tips for ${year}: ${url}`)
    const data = await fetchJson<{ tips: Array<{ gameid: number; source: string; hconfidence: string | number | null }> }>(url)

    const sums = new Map<number, { sum: number; count: number; aggregate: number | null }>()
    for (const tip of data.tips || []) {
      const h = tip.hconfidence == null ? null : Number(tip.hconfidence)
      if (h == null || Number.isNaN(h)) continue
      const entry = sums.get(tip.gameid) || { sum: 0, count: 0, aggregate: null }
      entry.sum += h
      entry.count++
      if (tip.source === 'Aggregate') entry.aggregate = h
      sums.set(tip.gameid, entry)
    }

    const probs = new Map<number, number>()
    for (const [gameId, entry] of sums) {
      probs.set(gameId, entry.aggregate ?? entry.sum / entry.count)
    }
    this.tipsCache = { year, fetchedAt: now, probs }
    return probs
  }

  /**
   * Fetch completed games for the year — used to settle Multi bets.
   * winnerName is null for a draw.
   */
  static async fetchCompletedGames(year: number): Promise<Array<{
    id: number
    round: number
    hteamName: string
    ateamName: string
    winnerName: string | null
  }>> {
    const url = `${SQUIGGLE_BASE}/?q=games;year=${year};complete=100`
    console.log(`[Squiggle] Fetching completed games: ${url}`)

    const data = await fetchJson<SquiggleGamesResponse & { games: Array<{ winner: string | null }> }>(url)
    if (!data.games || data.games.length === 0) return []

    return (data.games as any[]).map(g => ({
      id: g.id,
      round: g.round,
      hteamName: resolveTeamName(g.hteam),
      ateamName: resolveTeamName(g.ateam),
      winnerName: g.winner ? resolveTeamName(g.winner) : null,
    }))
  }

  /**
   * Fetch ALL finals games for the year — played and upcoming — in date order.
   * Used by the Finals Predictor to lock in real results and leave only the
   * remaining games pickable. winnerName is null while a game is incomplete.
   */
  static async fetchFinalsGames(year: number): Promise<Array<{
    id: number
    round: number
    roundname: string
    hteamName: string
    ateamName: string
    complete: number
    winnerName: string | null
    date: string | null
    venue: string | null
  }>> {
    const url = `${SQUIGGLE_BASE}/?q=games;year=${year}`
    console.log(`[Squiggle] Fetching finals games: ${url}`)

    const data = await fetchJson<SquiggleGamesResponse & { games: Array<{ winner: string | null }> }>(url)
    if (!data.games || data.games.length === 0) return []

    return (data.games as any[])
      .filter(g => g.is_final)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map(g => ({
        id: g.id,
        round: g.round,
        roundname: g.roundname,
        hteamName: resolveTeamName(g.hteam),
        ateamName: resolveTeamName(g.ateam),
        complete: g.complete,
        winnerName: g.complete >= 100 && g.winner ? resolveTeamName(g.winner) : null,
        date: g.date,
        venue: g.venue,
      }))
  }

  /** Returns the internal→squiggle name map for debugging */
  static getTeamMap(): Record<string, string> {
    return SQUIGGLE_TO_INTERNAL
  }
}
