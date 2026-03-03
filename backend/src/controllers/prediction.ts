import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { PredictionModel, PredictedTeam } from '../models/prediction'
import { SeasonModel } from '../models/season'
import { AFLLadderModel } from '../models/aflLadder'

export class PredictionController {
  static async submit(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })

      const { seasonId, teams } = req.body

      if (!seasonId || !Array.isArray(teams) || teams.length !== 18) {
        return res.status(400).json({ error: 'Invalid prediction data. Must have 18 teams.' })
      }

      const isValid = teams.every(
        (t: any) =>
          typeof t.position === 'number' &&
          t.position >= 1 &&
          t.position <= 18 &&
          typeof t.teamName === 'string'
      )

      if (!isValid) {
        return res.status(400).json({ error: 'Invalid team positions or names' })
      }

      const isAfterCutoff = await SeasonModel.isAfterCutoff(seasonId)
      if (isAfterCutoff) {
        return res.status(400).json({ error: 'Prediction cutoff date has passed' })
      }

      const existing = await PredictionModel.findByUserAndSeason(req.userId, seasonId)
      if (existing) {
        const updated = await PredictionModel.update(existing.id, teams)
        return res.json({ prediction: updated })
      }

      const prediction = await PredictionModel.create(req.userId, seasonId, teams)
      res.status(201).json({ prediction })
    } catch (error) {
      console.error('Prediction submission error:', error)
      res.status(500).json({ error: 'Failed to submit prediction' })
    }
  }

  /**
   * Get prediction for the current user + enrich with actual ladder positions.
   * Returns:
   *   prediction.teams[] — sorted by user's predicted position
   *   prediction.teams[].actualPosition — null if no ladder data yet
   *   prediction.teams[].diff — actual - predicted (negative = team ranked higher)
   *   prediction.teams[].points — |diff| penalty points
   *   prediction.totalScore — sum of all points (null if no ladder)
   *   prediction.ladderUpdatedAt — when the ladder was last synced
   */
  static async getBySeasonId(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })

      const { seasonId } = req.params
      const prediction = await PredictionModel.findByUserAndSeason(req.userId, parseInt(seasonId))

      if (!prediction) {
        return res.status(404).json({ error: 'Prediction not found' })
      }

      // Enrich with actual ladder positions if available
      let enriched: any = {
        ...prediction,
        totalScore: null,
        ladderRound: null,
        ladderUpdatedAt: null,
      }

      try {
        const ladder = await AFLLadderModel.getLatestLadder(parseInt(seasonId))

        if (ladder && ladder.teams.length > 0) {
          // Build actual position lookup
          const actualPos: Record<string, number> = {}
          for (const t of ladder.teams) {
            actualPos[t.teamName] = t.position
          }

          let total = 0
          let hasAllPositions = true

          const scoredTeams = prediction.teams.map((t) => {
            const actual = actualPos[t.teamName] ?? null
            const diff = actual !== null ? actual - t.position : null
            const points = diff !== null ? Math.abs(diff) : null

            if (points !== null) total += points
            else hasAllPositions = false

            return {
              ...t,
              actualPosition: actual,
              diff,            // negative = team ranked higher than predicted
              points,          // penalty points for this team
            }
          })

          enriched = {
            ...enriched,
            teams: scoredTeams,
            totalScore: hasAllPositions ? total : null,
            ladderRound: ladder.round,
            ladderUpdatedAt: ladder.capturedAt,
          }
        }
      } catch {
        // No ladder data — return unenriched prediction
      }

      res.json({ prediction: enriched })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch prediction' })
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })

      const { id } = req.params
      const { teams } = req.body

      if (!Array.isArray(teams) || teams.length !== 18) {
        return res.status(400).json({ error: 'Invalid prediction data. Must have 18 teams.' })
      }

      const prediction = await PredictionModel.findById(parseInt(id))
      if (!prediction) return res.status(404).json({ error: 'Prediction not found' })

      if (prediction.userId !== req.userId) {
        return res.status(403).json({ error: 'Unauthorized' })
      }

      const isAfterCutoff = await SeasonModel.isAfterCutoff(prediction.seasonId)
      if (isAfterCutoff) {
        return res.status(400).json({ error: 'Prediction cutoff date has passed' })
      }

      const updated = await PredictionModel.update(parseInt(id), teams)
      res.json({ prediction: updated })
    } catch (error) {
      console.error('Prediction update error:', error)
      res.status(500).json({ error: 'Failed to update prediction' })
    }
  }
}
