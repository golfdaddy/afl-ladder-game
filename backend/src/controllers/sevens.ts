import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { SevensModel, FORMATION, TEAM_SIZE } from '../models/sevens'
import { SevensCompsModel } from '../models/sevensComps'
import { SeasonModel } from '../models/season'

async function requireSeason(res: Response) {
  const season = await SeasonModel.getCurrentSeason()
  if (!season) {
    res.status(404).json({ error: 'No active season' })
    return null
  }
  return season
}

export class SevensController {
  static async getRound(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const season = await requireSeason(res)
    if (!season) return
    const round = await SevensModel.getActiveRound(season.id, season.year)
    if (!round) return res.status(404).json({ error: 'No active round' })
    const [pool, team] = await Promise.all([
      SevensModel.getPool(round.id, season.year, round.round),
      SevensModel.getMyTeam(req.userId, round.id),
    ])
    res.json({ round, formation: FORMATION, teamSize: TEAM_SIZE, pool, team })
  }

  static async saveTeam(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const season = await requireSeason(res)
    if (!season) return
    try {
      const result = await SevensModel.saveTeam(req.userId, season.id, season.year, req.body?.picks || [])
      res.status(201).json(result)
    } catch (error: any) {
      if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message })
      throw error
    }
  }

  static async getLeaderboard(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const season = await requireSeason(res)
    if (!season) return
    const round = await SevensModel.getActiveRound(season.id, season.year)
    if (!round) return res.status(404).json({ error: 'No active round' })
    const leaderboard = await SevensModel.getLeaderboard(round.id, season.year, round.round)
    res.json({ leaderboard })
  }

  static async createComp(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const season = await requireSeason(res)
    if (!season) return
    try {
      const result = await SevensCompsModel.createComp(req.userId, season.id, req.body?.name)
      res.status(201).json(result)
    } catch (error: any) {
      if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message })
      throw error
    }
  }

  static async joinComp(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const season = await requireSeason(res)
    if (!season) return
    try {
      const result = await SevensCompsModel.joinComp(req.userId, season.id, req.body?.code)
      res.status(201).json(result)
    } catch (error: any) {
      if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message })
      throw error
    }
  }

  static async myComps(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const season = await requireSeason(res)
    if (!season) return
    const comps = await SevensCompsModel.myComps(req.userId, season.id)
    res.json({ comps })
  }

  static async compLeaderboard(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const season = await requireSeason(res)
    if (!season) return
    const compId = Number(req.params.id)
    if (!Number.isInteger(compId)) return res.status(400).json({ error: 'Invalid league' })
    try {
      const result = await SevensCompsModel.compLeaderboard(req.userId, season.id, season.year, compId)
      res.json(result)
    } catch (error: any) {
      if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message })
      throw error
    }
  }
}
