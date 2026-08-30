import https from 'https'

// Official AFL APIs:
// - aflapi.afl.com.au — public fixture/match data, no auth
// - api.afl.com.au/cfs — player stats, needs a free token from the WMCTok handshake

const AFL_TO_INTERNAL: Record<string, string> = {
  'Adelaide Crows':    'Adelaide Crows',
  'Brisbane Lions':    'Brisbane Lions',
  'Carlton':           'Carlton',
  'Collingwood':       'Collingwood',
  'Essendon':          'Essendon',
  'Fremantle':         'Fremantle',
  'Geelong Cats':      'Geelong',
  'Gold Coast SUNS':   'Gold Coast Suns',
  'Gold Coast Suns':   'Gold Coast Suns',
  'GWS GIANTS':        'GWS Giants',
  'GWS Giants':        'GWS Giants',
  'Hawthorn':          'Hawthorn',
  'Melbourne':         'Melbourne',
  'North Melbourne':   'North Melbourne',
  'Port Adelaide':     'Port Adelaide',
  'Richmond':          'Richmond',
  'St Kilda':          'St Kilda',
  'Sydney Swans':      'Sydney Swans',
  'West Coast Eagles': 'West Coast Eagles',
  'Western Bulldogs':  'Western Bulldogs',
}

export interface AflMatch {
  providerId: string
  round: number
  status: string // SCHEDULED | UNCONFIRMED_TEAMS | LIVE | CONCLUDED etc.
  homeTeam: string // internal name
  awayTeam: string // internal name
  utcStartTime: string
  homeScore: number | null
  awayScore: number | null
}

/** True when the match has stats worth reading (in progress or done). */
export function isMatchUnderway(status: string): boolean {
  return status === 'LIVE' || status === 'CONCLUDED'
}

export interface AflPlayerGameStats {
  playerId: string
  playerName: string
  teamInternal: string
  disposals: number
  goals: number
  kicks: number
  handballs: number
  marks: number
  tackles: number
  hitouts: number
  behinds: number
  goalAssists: number
  clearances: number
  dreamTeamPoints: number
  matchPosition: string | null
}

export interface AflSquadPlayer {
  playerId: string
  playerName: string
  teamInternal: string
  listedPosition: string | null
  jumperNumber: number | null
  heightCm: number | null
  weightKg: number | null
  dateOfBirth: string | null
  debutYear: string | null
}

function request<T>(options: { hostname: string; path: string; method?: string; headers?: Record<string, string> }): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: options.hostname,
        path: options.path,
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (AFLLadderPredictor)',
          'Accept': 'application/json',
          'Accept-Encoding': 'identity',
          ...(options.method === 'POST' ? { 'Content-Length': '0' } : {}),
          ...options.headers,
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => (raw += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw) as T)
          } catch {
            reject(new Error(`AFL API non-JSON response (status ${res.statusCode}) for ${options.path}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(15000, () => {
      req.destroy()
      reject(new Error('AFL API request timed out'))
    })
    req.end()
  })
}

export interface NamedTeams {
  named: Set<string>       // player ids named across all named squads
  namedTeams: Set<string>  // internal team names whose squad is up
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export class AflStatsService {
  private static token: { value: string; fetchedAt: number } | null = null
  private static compSeasonCache: Map<number, number> = new Map() // year -> compSeasonId
  private static matchesCache: { year: number; fetchedAt: number; matches: AflMatch[] } | null = null

  private static async getToken(): Promise<string> {
    const now = Date.now()
    if (this.token && now - this.token.fetchedAt < 30 * 60 * 1000) return this.token.value
    const data = await request<{ token: string }>({ hostname: 'api.afl.com.au', path: '/cfs/afl/WMCTok', method: 'POST' })
    if (!data.token) throw new Error('AFL API token handshake failed')
    this.token = { value: data.token, fetchedAt: now }
    return data.token
  }

  /** Resolve the AFL Premiership compSeason id for a year (e.g. 2026 -> 85). */
  static async getCompSeasonId(year: number): Promise<number> {
    const cached = this.compSeasonCache.get(year)
    if (cached) return cached
    const data = await request<{ compSeasons: Array<{ id: number; name: string }> }>({
      hostname: 'aflapi.afl.com.au',
      path: '/afl/v2/compseasons?competitionId=1&pageSize=100',
    })
    const season = (data.compSeasons || []).find(s => (s.name || '').includes(`${year}`) && (s.name || '').includes('Premiership'))
    if (!season) throw new Error(`No AFL Premiership compSeason found for ${year}`)
    this.compSeasonCache.set(year, season.id)
    return season.id
  }

  /**
   * All matches for the season. 10-minute cache by default; pass fresh=true
   * to bypass it (live tracking needs current scores).
   */
  static async fetchMatches(year: number, fresh = false): Promise<AflMatch[]> {
    const now = Date.now()
    if (!fresh && this.matchesCache && this.matchesCache.year === year && now - this.matchesCache.fetchedAt < 10 * 60 * 1000) {
      return this.matchesCache.matches
    }
    const compSeasonId = await this.getCompSeasonId(year)
    const data = await request<{ matches: Array<any> }>({
      hostname: 'aflapi.afl.com.au',
      path: `/afl/v2/matches?competitionId=1&compSeasonId=${compSeasonId}&pageSize=300`,
    })
    const matches: AflMatch[] = (data.matches || [])
      .filter(m => m.home?.team?.name && m.away?.team?.name)
      .map(m => ({
        providerId: m.providerId,
        round: m.round?.roundNumber ?? m.roundNumber ?? 0,
        status: m.status,
        homeTeam: AFL_TO_INTERNAL[m.home.team.name] || m.home.team.name,
        awayTeam: AFL_TO_INTERNAL[m.away.team.name] || m.away.team.name,
        utcStartTime: m.utcStartTime,
        homeScore: m.home?.score?.totalScore ?? null,
        awayScore: m.away?.score?.totalScore ?? null,
      }))
    this.matchesCache = { year, fetchedAt: now, matches }
    return matches
  }

  /** Player stat lines for one completed match. */
  static async fetchMatchPlayerStats(providerId: string, homeTeam: string, awayTeam: string): Promise<AflPlayerGameStats[]> {
    const token = await this.getToken()
    const data = await request<{
      homeTeamPlayerStats?: Array<any>
      awayTeamPlayerStats?: Array<any>
    }>({
      hostname: 'api.afl.com.au',
      path: `/cfs/afl/playerStats/match/${providerId}`,
      headers: { 'x-media-mis-token': token },
    })

    const mapSide = (rows: Array<any> | undefined, teamInternal: string): AflPlayerGameStats[] =>
      (rows || []).map(row => {
        // The player identity sits at varying nesting depths across API versions
        const candidates = [row.player?.player?.player, row.player?.player, row.player]
        const p = candidates.find(c => c && c.playerId)
        const stats = row.playerStats?.stats || row.stats || {}
        // Match-day position lives on the outer player wrapper (e.g. HFFL, RK, INT)
        const positionCandidates = [row.player?.player?.position, row.player?.position]
        return {
          playerId: p?.playerId || '',
          playerName: p ? `${p.playerName?.givenName || ''} ${p.playerName?.surname || ''}`.trim() : '',
          teamInternal,
          disposals: Number(stats.disposals ?? 0),
          goals: Number(stats.goals ?? 0),
          kicks: Number(stats.kicks ?? 0),
          handballs: Number(stats.handballs ?? 0),
          marks: Number(stats.marks ?? 0),
          tackles: Number(stats.tackles ?? 0),
          hitouts: Number(stats.hitouts ?? 0),
          behinds: Number(stats.behinds ?? 0),
          goalAssists: Number(stats.goalAssists ?? 0),
          clearances: Number(stats.clearances?.totalClearances ?? 0),
          dreamTeamPoints: Number(stats.dreamTeamPoints ?? 0),
          matchPosition: positionCandidates.find(v => typeof v === 'string') || null,
        }
      }).filter(p => p.playerId)

    return [...mapSide(data.homeTeamPlayerStats, homeTeam), ...mapSide(data.awayTeamPlayerStats, awayTeam)]
  }

  private static namedCache: { key: string; fetchedAt: number; result: NamedTeams } | null = null

  /**
   * Named players for the round. Teams are named at staggered times, so we
   * track WHICH clubs have a named squad (namedTeams) alongside the named
   * player ids — letting callers tell "omitted/late-out" (team named, player
   * absent) apart from "not named yet" (team's squad not up). 15-min cache.
   */
  static async fetchNamedPlayers(year: number, roundNumber: number): Promise<NamedTeams> {
    const key = `${year}-${roundNumber}`
    const now = Date.now()
    if (this.namedCache && this.namedCache.key === key && now - this.namedCache.fetchedAt < 15 * 60 * 1000) {
      return this.namedCache.result
    }
    const token = await this.getToken()
    const matches = (await this.fetchMatches(year)).filter(m => m.round === roundNumber && m.status !== 'CONCLUDED')
    const named = new Set<string>()
    const namedTeams = new Set<string>()
    for (const m of matches) {
      try {
        const data = await request<{ homeTeam?: any; awayTeam?: any }>({
          hostname: 'api.afl.com.au',
          path: `/cfs/afl/matchRoster/${m.providerId}`,
          headers: { 'x-media-mis-token': token },
        })
        for (const [side, teamInternal] of [[data.homeTeam, m.homeTeam], [data.awayTeam, m.awayTeam]] as const) {
          const ids = (side?.positions || []).map((r: any) => r?.player?.playerId).filter(Boolean)
          if (ids.length >= 18) { // a real named squad (final ~23 / provisional ~26)
            namedTeams.add(teamInternal)
            for (const id of ids) named.add(id)
          }
        }
      } catch { /* a missing roster just leaves those teams 'not named yet' */ }
    }
    const result = { named, namedTeams }
    this.namedCache = { key, fetchedAt: now, result }
    return result
  }

  /** Map of internal team name -> AFL API team id, derived from the season fixture. */
  static async fetchTeamIds(year: number): Promise<Map<string, number>> {
    const compSeasonId = await this.getCompSeasonId(year)
    const data = await request<{ matches: Array<any> }>({
      hostname: 'aflapi.afl.com.au',
      path: `/afl/v2/matches?competitionId=1&compSeasonId=${compSeasonId}&pageSize=300`,
    })
    const ids = new Map<string, number>()
    for (const m of data.matches || []) {
      for (const side of [m.home, m.away]) {
        const name = side?.team?.name
        const id = side?.team?.id
        if (name && id) ids.set(AFL_TO_INTERNAL[name] || name, id)
      }
    }
    return ids
  }

  /** Full club squad with listed positions and bio details. */
  static async fetchTeamSquad(year: number, teamId: number, teamInternal: string): Promise<AflSquadPlayer[]> {
    const compSeasonId = await this.getCompSeasonId(year)
    const data = await request<{ squad: { players: Array<any> } }>({
      hostname: 'aflapi.afl.com.au',
      path: `/afl/v2/squads?compSeasonId=${compSeasonId}&teamId=${teamId}`,
    })
    return (data.squad?.players || []).map(entry => {
      const p = entry.player || {}
      return {
        playerId: p.providerId || '',
        playerName: `${p.firstName || ''} ${p.surname || ''}`.trim(),
        teamInternal,
        listedPosition: entry.position || null,
        jumperNumber: entry.jumperNumber ?? null,
        heightCm: p.heightInCm ?? null,
        weightKg: p.weightInKg || null,
        dateOfBirth: p.dateOfBirth || null,
        debutYear: p.debutYear || null,
      }
    }).filter(p => p.playerId)
  }

  /** Polite delay helper for backfills. */
  static pause(ms = 300) {
    return sleep(ms)
  }
}
