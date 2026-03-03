import https from 'https'

const SQUIGGLE_BASE = 'https://api.squiggle.com.au'

// Map Squiggle API team names → our internal team names (as stored in predictions)
const SQUIGGLE_TO_INTERNAL: Record<string, string> = {
  'Adelaide':          'Adelaide Crows',
  'Brisbane':          'Brisbane Lions',
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

  /** Returns the internal→squiggle name map for debugging */
  static getTeamMap(): Record<string, string> {
    return SQUIGGLE_TO_INTERNAL
  }
}
