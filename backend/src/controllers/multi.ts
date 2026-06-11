import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { MultiModel } from '../models/multi'
import { MultiPropsModel } from '../models/multiProps'
import { MultiCompsModel } from '../models/multiComps'
import { SeasonModel } from '../models/season'

async function requireSeason(res: Response) {
  const season = await SeasonModel.getCurrentSeason()
  if (!season) {
    res.status(404).json({ error: 'No active season' })
    return null
  }
  return season
}

export class MultiController {
  static async getAccount(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const season = await requireSeason(res)
    if (!season) return

    const account = await MultiModel.getOrCreateAccount(req.userId, season.id)
    const transactions = await MultiModel.getTransactions(account.id)
    res.json({ account, transactions, seasonYear: season.year })
  }

  static async getMarkets(req: AuthRequest, res: Response) {
    const season = await requireSeason(res)
    if (!season) return
    const rounds = await MultiModel.getMarkets(season.year)
    res.json({ rounds })
  }

  static async getGameProps(req: AuthRequest, res: Response) {
    const season = await requireSeason(res)
    if (!season) return
    const gameId = parseInt(req.params.gameId)
    if (!Number.isFinite(gameId)) return res.status(400).json({ error: 'Invalid game id' })
    const props = await MultiPropsModel.getGamePropsById(season.year, gameId)
    res.json({ props })
  }

  static async placeBet(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const season = await requireSeason(res)
    if (!season) return

    const { stake, legs, compId } = req.body || {}
    try {
      const result = await MultiModel.placeBet(req.userId, season.id, season.year, Number(stake), legs, compId ? Number(compId) : null)
      res.status(201).json(result)
    } catch (error: any) {
      if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message })
      throw error
    }
  }

  static async createComp(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const season = await requireSeason(res)
    if (!season) return
    try {
      const result = await MultiCompsModel.createComp(req.userId, season.id, req.body || {})
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
      const result = await MultiCompsModel.joinComp(req.userId, season.id, req.body?.code || '')
      res.json(result)
    } catch (error: any) {
      if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message })
      throw error
    }
  }

  static async myComps(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const season = await requireSeason(res)
    if (!season) return
    const comps = await MultiCompsModel.myComps(req.userId, season.id)
    res.json({ comps })
  }

  static async compLeaderboard(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const compId = parseInt(req.params.compId)
    if (!Number.isFinite(compId)) return res.status(400).json({ error: 'Invalid comp id' })
    const leaderboard = await MultiCompsModel.compLeaderboard(compId)
    res.json({ leaderboard })
  }

  static async getMyBets(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const season = await requireSeason(res)
    if (!season) return
    const bets = await MultiModel.getUserBets(req.userId, season.id)
    res.json({ bets })
  }

  static async getLiveProgress(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const season = await requireSeason(res)
    if (!season) return
    const progress = await MultiModel.getLiveBetProgress(req.userId, season.id, season.year)
    res.json(progress)
  }

  static async getLeaderboard(req: AuthRequest, res: Response) {
    const season = await requireSeason(res)
    if (!season) return
    const leaderboard = await MultiModel.getLeaderboard(season.id)
    res.json({ leaderboard })
  }

  static async getPlayers(req: AuthRequest, res: Response) {
    const season = await requireSeason(res)
    if (!season) return
    const team = typeof req.query.team === 'string' && req.query.team.length > 0 ? req.query.team : undefined
    const players = await MultiPropsModel.getPlayerDirectory(season.year, team)
    res.json({ players, seasonYear: season.year })
  }
}
