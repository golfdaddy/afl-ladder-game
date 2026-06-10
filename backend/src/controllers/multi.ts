import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { MultiModel } from '../models/multi'
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

  static async placeBet(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const season = await requireSeason(res)
    if (!season) return

    const { stake, legs } = req.body || {}
    try {
      const result = await MultiModel.placeBet(req.userId, season.id, season.year, Number(stake), legs)
      res.status(201).json(result)
    } catch (error: any) {
      if (error.status === 400) return res.status(400).json({ error: error.message })
      throw error
    }
  }

  static async getMyBets(req: AuthRequest, res: Response) {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })
    const season = await requireSeason(res)
    if (!season) return
    const bets = await MultiModel.getUserBets(req.userId, season.id)
    res.json({ bets })
  }

  static async getLeaderboard(req: AuthRequest, res: Response) {
    const season = await requireSeason(res)
    if (!season) return
    const leaderboard = await MultiModel.getLeaderboard(season.id)
    res.json({ leaderboard })
  }
}
