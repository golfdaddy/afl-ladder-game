import { db } from '../../db'
import { FANTASY_POSITIONS, FantasyPosition } from '../../models/fantasyTypes'
import { FantasyPlayerModel } from '../../models/fantasyPlayer'
import { FantasyRoundModel } from '../../models/fantasyRound'
import { getFantasyProvider } from './providerFactory'
import { scoreToPriceBucket } from './pricing'

function normalizePositions(raw: FantasyPosition[]): FantasyPosition[] {
  const filtered = raw.filter((p) => FANTASY_POSITIONS.includes(p))
  return Array.from(new Set(filtered)).slice(0, 2)
}

export class FantasyIngestionService {
  static async syncRound(roundId: number): Promise<{
    roundId: number
    provider: string
    playersSynced: number
  }> {
    const roundContextResult = await db.query(
      `SELECT r.id, r.round_no as "roundNo", r.season_id as "seasonId", s.year as "seasonYear"
       FROM fantasy_rounds r
       JOIN seasons s ON s.id = r.season_id
       WHERE r.id = $1`,
      [roundId]
    )

    if (!roundContextResult.rows[0]) {
      throw new Error('Fantasy round not found')
    }

    const roundContext = roundContextResult.rows[0]
    const provider = getFantasyProvider()
    const fetched = await provider.fetchRoundPlayers({
      seasonYear: Number(roundContext.seasonYear),
      roundNo: Number(roundContext.roundNo),
    })

    // Keep round timing in sync with data provider.
    await FantasyRoundModel.upsertRound(
      Number(roundContext.seasonId),
      Number(roundContext.roundNo),
      fetched.round.startsAt,
      fetched.round.endsAt,
      fetched.round.status
    )

    await db.transaction(async (client) => {
      for (const player of fetched.players) {
        const syncedPlayer = await FantasyPlayerModel.upsertPlayer(
          player.externalId,
          player.fullName,
          player.aflTeam,
          player.isAvailable,
          client
        )

        const normalizedPositions = normalizePositions(player.positions)
        if (normalizedPositions.length === 0) {
          continue
        }

        await FantasyPlayerModel.replaceEligibility(syncedPlayer.id, normalizedPositions, client)

        const bucket = scoreToPriceBucket(player.averageScore)
        await FantasyPlayerModel.upsertRoundPlayer(
          roundId,
          syncedPlayer.id,
          player.averageScore,
          bucket,
          player.lockAt,
          player.isAvailable,
          client
        )
      }
    })

    return {
      roundId,
      provider: provider.getProviderName(),
      playersSynced: fetched.players.length,
    }
  }
}
