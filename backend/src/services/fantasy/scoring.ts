import { db } from '../../db'
import { FantasyCompetitionModel } from '../../models/fantasyCompetition'
import { FantasyLineupModel } from '../../models/fantasyLineup'
import { FantasyPlayerModel } from '../../models/fantasyPlayer'
import { FantasyRankingModel } from '../../models/fantasyRanking'
import { getFantasyProvider } from './providerFactory'

export class FantasyScoringService {
  static async ingestRoundScores(roundId: number): Promise<{
    roundId: number
    provider: string
    scoresIngested: number
  }> {
    const roundContextResult = await db.query(
      `SELECT r.id, r.round_no as "roundNo", s.year as "seasonYear"
       FROM fantasy_rounds r
       JOIN seasons s ON s.id = r.season_id
       WHERE r.id = $1`,
      [roundId]
    )
    if (!roundContextResult.rows[0]) {
      throw new Error('Fantasy round not found')
    }

    const round = roundContextResult.rows[0]
    const provider = getFantasyProvider()
    const scores = await provider.fetchRoundScores({
      seasonYear: Number(round.seasonYear),
      roundNo: Number(round.roundNo),
    })

    const playerRows = await db.query(
      `SELECT rp.player_id as "playerId", p.external_id as "externalId"
       FROM fantasy_round_players rp
       JOIN fantasy_players p ON p.id = rp.player_id
       WHERE rp.round_id = $1`,
      [roundId]
    )

    const playerByExternal = new Map<string, number>()
    for (const row of playerRows.rows) {
      playerByExternal.set(row.externalId, Number(row.playerId))
    }

    let ingested = 0
    for (const score of scores) {
      const playerId = playerByExternal.get(score.externalId)
      if (!playerId) continue
      await FantasyPlayerModel.setRoundPlayerScore(
        roundId,
        playerId,
        score.fantasyPoints,
        score.sourceUpdatedAt,
        score.isFinal
      )
      ingested += 1
    }

    return {
      roundId,
      provider: provider.getProviderName(),
      scoresIngested: ingested,
    }
  }

  static async recomputeRound(roundId: number): Promise<{
    roundId: number
    competitionsProcessed: number
    lineupsScored: number
  }> {
    const scoreRows = await db.query(
      `SELECT player_id as "playerId", fantasy_points as "fantasyPoints"
       FROM fantasy_round_player_scores
       WHERE round_id = $1`,
      [roundId]
    )
    const playerPoints = new Map<number, number>()
    for (const row of scoreRows.rows) {
      playerPoints.set(Number(row.playerId), Number(row.fantasyPoints))
    }

    const competitions = await FantasyCompetitionModel.listByRound(roundId)
    let totalLineups = 0

    for (const competition of competitions) {
      const lineups = await FantasyLineupModel.listByCompetitionRound(competition.id, roundId)
      totalLineups += lineups.length

      const rankingRows: Array<{
        userId: number
        lineupId: number
        points: number
        salaryUsed: number
        submittedAt: Date
      }> = []

      for (const lineup of lineups) {
        let totalPoints = 0
        const slotPoints: Array<{ slotId: number; points: number }> = []
        for (const slot of lineup.slots) {
          const points = playerPoints.get(slot.playerId) ?? 0
          totalPoints += points
          slotPoints.push({ slotId: slot.id, points })
        }

        await FantasyLineupModel.setLineupPoints(lineup.id, Number(totalPoints.toFixed(2)), slotPoints)

        rankingRows.push({
          userId: lineup.userId,
          lineupId: lineup.id,
          points: Number(totalPoints.toFixed(2)),
          salaryUsed: lineup.totalCost,
          submittedAt: lineup.submittedAt,
        })
      }

      rankingRows.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points
        if (a.salaryUsed !== b.salaryUsed) return a.salaryUsed - b.salaryUsed
        return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
      })

      await FantasyRankingModel.replaceRoundRankings(
        competition.id,
        roundId,
        rankingRows.map((row, index) => ({
          ...row,
          rank: index + 1,
        }))
      )
    }

    return {
      roundId,
      competitionsProcessed: competitions.length,
      lineupsScored: totalLineups,
    }
  }
}
