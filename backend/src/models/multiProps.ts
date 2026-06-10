import { db } from '../db'
import { AflStatsService } from '../services/aflStats'
import { SquiggleService } from '../services/squiggle'

// Pricing knobs
const DISPOSAL_ODDS = 1.87           // both sides of a x.5 line set at the player's weighted average
const GOAL_MARGIN = 0.92             // house margin on anytime goal scorer
const MIN_GOAL_ODDS = 1.1
const MAX_GOAL_ODDS = 12
const FORM_GAMES = 5                 // games in the weighted average, most recent weighted highest

export interface PlayerPropMarket {
  playerId: string
  playerName: string
  team: string
  listedPosition: string | null
  disposals: { line: number; overOdds: number; underOdds: number; avg: number } | null
  anytimeGoal: { odds: number; avg: number } | null
}

export interface GameProps {
  gameId: number
  providerMatchId: string
  homeTeam: string
  awayTeam: string
  players: PlayerPropMarket[]
}

function round2(v: number) {
  return Math.round(v * 100) / 100
}

export class MultiPropsModel {
  /**
   * Ingest player stat lines for any concluded AFL matches we haven't stored yet.
   * Throttled — first run backfills the whole season, later runs pick up new games.
   */
  static async ingestPlayerStats(year: number): Promise<number> {
    const matches = await AflStatsService.fetchMatches(year)
    const concluded = matches.filter(m => m.status === 'CONCLUDED')
    if (concluded.length === 0) return 0

    const existing = await db.query(
      `SELECT DISTINCT provider_match_id FROM multi_player_stats WHERE season_year = $1`,
      [year]
    )
    const have = new Set(existing.rows.map((r: any) => r.provider_match_id))
    const missing = concluded.filter(m => !have.has(m.providerId))

    let ingested = 0
    for (const match of missing) {
      try {
        const stats = await AflStatsService.fetchMatchPlayerStats(match.providerId, match.homeTeam, match.awayTeam)
        if (stats.length === 0) continue
        for (const p of stats) {
          await db.query(
            `INSERT INTO multi_player_stats
               (provider_match_id, season_year, round, team_internal, player_id, player_name, disposals, goals,
                kicks, handballs, marks, tackles, hitouts, behinds, goal_assists, clearances, dream_team_points, match_position)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
             ON CONFLICT (provider_match_id, player_id) DO NOTHING`,
            [match.providerId, year, match.round, p.teamInternal, p.playerId, p.playerName, p.disposals, p.goals,
             p.kicks, p.handballs, p.marks, p.tackles, p.hitouts, p.behinds, p.goalAssists, p.clearances, p.dreamTeamPoints, p.matchPosition]
          )
        }
        ingested++
        await AflStatsService.pause(300)
      } catch (error: any) {
        console.error(`[Multi] Failed to ingest stats for ${match.providerId}:`, error.message)
      }
    }
    return ingested
  }

  /** Weighted recent form for every player in a team's most recent match. */
  private static async teamPlayerForm(year: number, teamInternal: string): Promise<Array<{
    playerId: string
    playerName: string
    listedPosition: string | null
    avgDisposals: number
    avgGoals: number
    games: number
  }>> {
    // Roster = players who took the field in the team's most recent ingested match
    const result = await db.query(
      `WITH latest AS (
         SELECT provider_match_id FROM multi_player_stats
         WHERE season_year = $1 AND team_internal = $2
         ORDER BY round DESC LIMIT 1
       ),
       roster AS (
         SELECT s.player_id, s.player_name
         FROM multi_player_stats s
         JOIN latest l ON s.provider_match_id = l.provider_match_id
         WHERE s.team_internal = $2
       ),
       recent AS (
         SELECT s.player_id, s.disposals, s.goals,
                ROW_NUMBER() OVER (PARTITION BY s.player_id ORDER BY s.round DESC) AS rn
         FROM multi_player_stats s
         JOIN roster r ON r.player_id = s.player_id
         WHERE s.season_year = $1
       )
       SELECT r.player_id as "playerId", r.player_name as "playerName",
              d.listed_position as "listedPosition",
              SUM(rec.disposals * ($3 + 1 - rec.rn))::float / NULLIF(SUM($3 + 1 - rec.rn), 0) as "avgDisposals",
              SUM(rec.goals * ($3 + 1 - rec.rn))::float / NULLIF(SUM($3 + 1 - rec.rn), 0) as "avgGoals",
              COUNT(rec.player_id)::int as games
       FROM roster r
       LEFT JOIN multi_players d ON d.player_id = r.player_id
       JOIN recent rec ON rec.player_id = r.player_id AND rec.rn <= $3
       GROUP BY r.player_id, r.player_name, d.listed_position
       ORDER BY "avgDisposals" DESC`,
      [year, teamInternal, FORM_GAMES]
    )
    return result.rows.map((r: any) => ({
      ...r,
      avgDisposals: Number(r.avgDisposals || 0),
      avgGoals: Number(r.avgGoals || 0),
    }))
  }

  /**
   * Build prop markets for one upcoming Squiggle game.
   * Matched to the AFL fixture by round + home team.
   */
  static async getGameProps(
    year: number,
    game: { id: number; round: number; hteamName: string; ateamName: string }
  ): Promise<GameProps | null> {
    const aflMatches = await AflStatsService.fetchMatches(year)
    const aflMatch = aflMatches.find(m =>
      m.round === game.round &&
      (m.homeTeam === game.hteamName || m.homeTeam === game.ateamName) &&
      (m.awayTeam === game.ateamName || m.awayTeam === game.hteamName)
    )
    if (!aflMatch) return null

    const [homeForm, awayForm] = await Promise.all([
      this.teamPlayerForm(year, game.hteamName),
      this.teamPlayerForm(year, game.ateamName),
    ])

    const toMarket = (team: string) => (p: { playerId: string; playerName: string; listedPosition: string | null; avgDisposals: number; avgGoals: number; games: number }): PlayerPropMarket => {
      // Disposal line sits on the .5 nearest the weighted average; both sides priced evenly
      const disposals = p.avgDisposals >= 8
        ? { line: Math.floor(p.avgDisposals) + 0.5, overOdds: DISPOSAL_ODDS, underOdds: DISPOSAL_ODDS, avg: round2(p.avgDisposals) }
        : null
      // Anytime goal from a Poisson rate on weighted goals-per-game
      const lambda = p.avgGoals
      const pGoal = 1 - Math.exp(-lambda)
      const anytimeGoal = lambda >= 0.15
        ? { odds: Math.min(MAX_GOAL_ODDS, Math.max(MIN_GOAL_ODDS, round2((1 / pGoal) * GOAL_MARGIN))), avg: round2(lambda) }
        : null
      return { playerId: p.playerId, playerName: p.playerName, team, listedPosition: p.listedPosition, disposals, anytimeGoal }
    }

    const players = [
      ...homeForm.map(toMarket(game.hteamName)),
      ...awayForm.map(toMarket(game.ateamName)),
    ].filter(p => p.disposals || p.anytimeGoal)

    return {
      gameId: game.id,
      providerMatchId: aflMatch.providerId,
      homeTeam: game.hteamName,
      awayTeam: game.ateamName,
      players,
    }
  }

  /** Refresh the player directory (identity, club, listed position, bio) from the AFL squad API. */
  static async refreshPlayerDirectory(year: number): Promise<number> {
    const teamIds = await AflStatsService.fetchTeamIds(year)
    let upserted = 0
    for (const [teamInternal, teamId] of teamIds) {
      try {
        const squad = await AflStatsService.fetchTeamSquad(year, teamId, teamInternal)
        for (const p of squad) {
          await db.query(
            `INSERT INTO multi_players (player_id, player_name, team_internal, listed_position, jumper_number, height_cm, weight_kg, date_of_birth, debut_year, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (player_id) DO UPDATE SET
               player_name = EXCLUDED.player_name,
               team_internal = EXCLUDED.team_internal,
               listed_position = EXCLUDED.listed_position,
               jumper_number = EXCLUDED.jumper_number,
               height_cm = EXCLUDED.height_cm,
               weight_kg = EXCLUDED.weight_kg,
               date_of_birth = EXCLUDED.date_of_birth,
               debut_year = EXCLUDED.debut_year,
               updated_at = NOW()`,
            [p.playerId, p.playerName, p.teamInternal, p.listedPosition, p.jumperNumber, p.heightCm, p.weightKg, p.dateOfBirth, p.debutYear]
          )
          upserted++
        }
        await AflStatsService.pause(200)
      } catch (error: any) {
        console.error(`[Multi] Failed to refresh squad for ${teamInternal}:`, error.message)
      }
    }
    return upserted
  }

  /** Season averages across every captured stat, joined with the directory. */
  static async getPlayerDirectory(year: number, teamInternal?: string) {
    const result = await db.query(
      `SELECT
         d.player_id as "playerId",
         d.player_name as "playerName",
         d.team_internal as "team",
         d.listed_position as "listedPosition",
         d.jumper_number as "jumperNumber",
         d.height_cm as "heightCm",
         d.weight_kg as "weightKg",
         d.date_of_birth as "dateOfBirth",
         d.debut_year as "debutYear",
         COUNT(s.id)::int as games,
         ROUND(AVG(s.disposals), 1)::float as "avgDisposals",
         ROUND(AVG(s.kicks), 1)::float as "avgKicks",
         ROUND(AVG(s.handballs), 1)::float as "avgHandballs",
         ROUND(AVG(s.marks), 1)::float as "avgMarks",
         ROUND(AVG(s.tackles), 1)::float as "avgTackles",
         ROUND(AVG(s.hitouts), 1)::float as "avgHitouts",
         ROUND(AVG(s.goals), 2)::float as "avgGoals",
         ROUND(AVG(s.behinds), 2)::float as "avgBehinds",
         ROUND(AVG(s.goal_assists), 2)::float as "avgGoalAssists",
         ROUND(AVG(s.clearances), 1)::float as "avgClearances",
         ROUND(AVG(s.dream_team_points), 1)::float as "avgFantasyPoints"
       FROM multi_players d
       LEFT JOIN multi_player_stats s ON s.player_id = d.player_id AND s.season_year = $1
       WHERE ($2::varchar IS NULL OR d.team_internal = $2)
       GROUP BY d.player_id
       ORDER BY d.team_internal, "avgDisposals" DESC NULLS LAST`,
      [year, teamInternal || null]
    )
    return result.rows
  }

  /** Convenience: props for a Squiggle game id. */
  static async getGamePropsById(year: number, gameId: number): Promise<GameProps | null> {
    const rounds = await SquiggleService.fetchAllUpcomingRounds(year)
    for (const r of rounds) {
      const game = r.games.find(g => g.id === gameId)
      if (game) return this.getGameProps(year, { id: game.id, round: game.round, hteamName: game.hteamName, ateamName: game.ateamName })
    }
    return null
  }
}
