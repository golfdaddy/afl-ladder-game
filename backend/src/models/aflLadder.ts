import { db } from '../db'

export interface AFLTeam {
  position: number
  teamName: string
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  percentage: number
}

export interface AFLLadderSnapshot {
  id: number
  seasonId: number
  round: number | null
  teams: AFLTeam[]
  capturedAt: Date
  source: string
}

export class AFLLadderModel {
  static async uploadLadder(
    seasonId: number,
    teams: AFLTeam[],
    round: number | null = null,
    source: string = 'manual'
  ): Promise<AFLLadderSnapshot> {
    return db.transaction(async (client) => {
      // Delete any existing snapshot for this season+round to keep uploads idempotent.
      // For null round (Squiggle syncs), skip deletion — multiple null-round snapshots are
      // allowed, and getLatestLadder always picks the newest by captured_at.
      if (round !== null) {
        await client.query(
          `DELETE FROM afl_ladder_snapshots WHERE season_id = $1 AND round = $2`,
          [seasonId, round]
        )
      }

      // Create snapshot
      const snapshotResult = await client.query(
        `INSERT INTO afl_ladder_snapshots (season_id, round, captured_at, source)
         VALUES ($1, $2, NOW(), $3)
         RETURNING id, season_id as "seasonId", round, captured_at as "capturedAt", source`,
        [seasonId, round, source]
      )

      const snapshotId = snapshotResult.rows[0].id

      // Insert teams
      for (const team of teams) {
        await client.query(
          `INSERT INTO afl_ladder_teams (snapshot_id, position, team_name, wins, losses, points_for, points_against, percentage)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            snapshotId,
            team.position,
            team.teamName,
            team.wins,
            team.losses,
            team.pointsFor,
            team.pointsAgainst,
            team.percentage
          ]
        )
      }

      return {
        ...snapshotResult.rows[0],
        teams
      }
    })
  }

  static async getLatestLadder(seasonId: number): Promise<AFLLadderSnapshot | null> {
    const result = await db.query(
      `SELECT id, season_id as "seasonId", round, captured_at as "capturedAt", source
       FROM afl_ladder_snapshots
       WHERE season_id = $1
       ORDER BY captured_at DESC
       LIMIT 1`,
      [seasonId]
    )

    if (!result.rows[0]) return null

    const snapshot = result.rows[0]

    const teamsResult = await db.query(
      `SELECT position, team_name as "teamName", wins, losses, points_for as "pointsFor",
              points_against as "pointsAgainst", percentage
       FROM afl_ladder_teams
       WHERE snapshot_id = $1
       ORDER BY position ASC`,
      [snapshot.id]
    )

    return {
      ...snapshot,
      teams: teamsResult.rows
    }
  }

  static async getLadderByRound(seasonId: number, round: number): Promise<AFLLadderSnapshot | null> {
    const result = await db.query(
      `SELECT id, season_id as "seasonId", round, captured_at as "capturedAt", source
       FROM afl_ladder_snapshots
       WHERE season_id = $1 AND round = $2
       LIMIT 1`,
      [seasonId, round]
    )

    if (!result.rows[0]) return null

    const snapshot = result.rows[0]

    const teamsResult = await db.query(
      `SELECT position, team_name as "teamName", wins, losses, points_for as "pointsFor",
              points_against as "pointsAgainst", percentage
       FROM afl_ladder_teams
       WHERE snapshot_id = $1
       ORDER BY position ASC`,
      [snapshot.id]
    )

    return {
      ...snapshot,
      teams: teamsResult.rows
    }
  }

  static async getAllSnapshots(seasonId: number): Promise<AFLLadderSnapshot[]> {
    const result = await db.query(
      `SELECT id, season_id as "seasonId", round, captured_at as "capturedAt", source
       FROM afl_ladder_snapshots
       WHERE season_id = $1
       ORDER BY captured_at DESC`,
      [seasonId]
    )

    const snapshots = []

    for (const snapshot of result.rows) {
      const teamsResult = await db.query(
        `SELECT position, team_name as "teamName", wins, losses, points_for as "pointsFor",
                points_against as "pointsAgainst", percentage
         FROM afl_ladder_teams
         WHERE snapshot_id = $1
         ORDER BY position ASC`,
        [snapshot.id]
      )

      snapshots.push({
        ...snapshot,
        teams: teamsResult.rows
      })
    }

    return snapshots
  }
}
