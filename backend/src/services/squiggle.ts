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
      .map((s) => {
        const internalName = SQUIGGLE_TO_INTERNAL[s.name]
        if (!internalName) {
          console.warn(`[Squiggle] Unknown team name: "${s.name}" — add to SQUIGGLE_TO_INTERNAL map`)
        }
        return {
          position:      s.rank,
          teamName:      internalName || s.name,
          wins:          s.wins,
          losses:        s.losses,
          draws:         s.draws || 0,
          pointsFor:     Math.round(s.for || 0),
          pointsAgainst: Math.round(s.against || 0),
          percentage:    Math.round((s.percentage || 0) * 10) / 10,
        }
      })

    if (mapped.length < 18) {
      console.warn(`[Squiggle] Only ${mapped.length} teams returned — season may not have started`)
    }

    return mapped
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
      hteamName: SQUIGGLE_TO_INTERNAL[g.hteam] || g.hteam,
      ateamName: SQUIGGLE_TO_INTERNAL[g.ateam] || g.ateam,
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
      teamName: SQUIGGLE_TO_INTERNAL[entry.team] || entry.team,
      source: entry.source,
      rank: entry.rank,
      projWins: Math.round(entry.wins * 10) / 10,
      swarms: entry.swarms || [],
    }))
  }

  /** Returns the internal→squiggle name map for debugging */
  static getTeamMap(): Record<string, string> {
    return SQUIGGLE_TO_INTERNAL
  }
}
