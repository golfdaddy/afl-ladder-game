import { PoolClient } from 'pg'
import { db } from '../db'
import { MultiModel } from './multi'
import { SquiggleService } from '../services/squiggle'

function num(v: any): number {
  return v == null ? 0 : Number(v)
}

function genJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export interface CreateCompInput {
  name: string
  scopeType: 'game' | 'round'
  scopeRound: number
  scopeGameId?: number | null
  buyIn?: number
  startingBudget?: number
  minBet?: number | null
  maxBet?: number | null
  mustSpend?: boolean
  payoutRule?: 'winner_takes_all' | 'podium'
}

export class MultiCompsModel {
  static async createComp(userId: number, seasonId: number, input: CreateCompInput) {
    const name = (input.name || '').trim()
    if (!name || name.length > 120) throw Object.assign(new Error('Comp needs a name (max 120 chars)'), { status: 400 })
    if (input.scopeType !== 'game' && input.scopeType !== 'round') throw Object.assign(new Error('Scope must be a game or a round'), { status: 400 })
    if (input.scopeType === 'game' && !input.scopeGameId) throw Object.assign(new Error('Pick the game for this comp'), { status: 400 })
    if (!Number.isFinite(input.scopeRound) || input.scopeRound < 0) throw Object.assign(new Error('Invalid round'), { status: 400 })

    const buyIn = Math.max(0, Math.round(num(input.buyIn) * 100) / 100)
    const startingBudget = Math.round(num(input.startingBudget ?? 500) * 100) / 100
    if (startingBudget <= 0) throw Object.assign(new Error('Starting budget must be positive'), { status: 400 })
    const minBet = input.minBet != null && num(input.minBet) > 0 ? Math.round(num(input.minBet) * 100) / 100 : null
    const maxBet = input.maxBet != null && num(input.maxBet) > 0 ? Math.round(num(input.maxBet) * 100) / 100 : null
    if (minBet != null && maxBet != null && minBet > maxBet) throw Object.assign(new Error('Min bet cannot exceed max bet'), { status: 400 })
    const payoutRule = input.payoutRule === 'podium' ? 'podium' : 'winner_takes_all'

    return db.transaction(async (client) => {
      // Buy-in comes out of the creator's main wallet
      const account = await this.lockMainAccount(client, userId, seasonId)
      if (buyIn > 0 && account.balance < buyIn) {
        throw Object.assign(new Error(`Buy-in exceeds your balance (Ƒ${account.balance.toFixed(2)})`), { status: 400 })
      }

      // Join codes collide rarely; retry a few times
      let compId: number | null = null
      let joinCode = ''
      for (let attempt = 0; attempt < 5 && !compId; attempt++) {
        joinCode = genJoinCode()
        const result = await client.query(
          `INSERT INTO multi_comps (season_id, creator_user_id, name, join_code, scope_type, scope_round, scope_game_id,
                                    buy_in, starting_budget, min_bet, max_bet, must_spend, payout_rule)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (join_code) DO NOTHING
           RETURNING id`,
          [seasonId, userId, name, joinCode, input.scopeType, input.scopeRound, input.scopeGameId || null,
           buyIn, startingBudget, minBet, maxBet, !!input.mustSpend, payoutRule]
        )
        if (result.rows.length > 0) compId = result.rows[0].id
      }
      if (!compId) throw new Error('Could not allocate a join code')

      await this.addMember(client, compId, userId, account.id, account.balance, buyIn, startingBudget)
      return { compId, joinCode }
    })
  }

  static async joinComp(userId: number, seasonId: number, code: string) {
    const compResult = await db.query(
      `SELECT id, season_id as "seasonId", buy_in as "buyIn", starting_budget as "startingBudget", status
       FROM multi_comps WHERE join_code = $1`,
      [(code || '').trim().toUpperCase()]
    )
    const comp = compResult.rows[0]
    if (!comp || comp.seasonId !== seasonId) throw Object.assign(new Error('Comp not found — check the code'), { status: 404 })
    if (comp.status !== 'open') throw Object.assign(new Error('This comp has finished'), { status: 400 })

    const existing = await db.query(`SELECT id FROM multi_comp_members WHERE comp_id = $1 AND user_id = $2`, [comp.id, userId])
    if (existing.rows.length > 0) throw Object.assign(new Error('You are already in this comp'), { status: 400 })

    const buyIn = num(comp.buyIn)
    return db.transaction(async (client) => {
      const account = await this.lockMainAccount(client, userId, seasonId)
      if (buyIn > 0 && account.balance < buyIn) {
        throw Object.assign(new Error(`Buy-in is Ƒ${buyIn.toFixed(2)} — your balance is Ƒ${account.balance.toFixed(2)}`), { status: 400 })
      }
      await this.addMember(client, comp.id, userId, account.id, account.balance, buyIn, num(comp.startingBudget))
      return { compId: comp.id }
    })
  }

  private static async lockMainAccount(client: PoolClient, userId: number, seasonId: number) {
    // Ensure the account exists before locking it
    const account = await MultiModel.getOrCreateAccount(userId, seasonId)
    const locked = await client.query(`SELECT id, balance FROM multi_accounts WHERE id = $1 FOR UPDATE`, [account.id])
    return { id: account.id, balance: num(locked.rows[0].balance) }
  }

  private static async addMember(
    client: PoolClient,
    compId: number,
    userId: number,
    accountId: number,
    accountBalance: number,
    buyIn: number,
    startingBudget: number
  ) {
    await client.query(
      `INSERT INTO multi_comp_members (comp_id, user_id, balance) VALUES ($1, $2, $3)`,
      [compId, userId, startingBudget]
    )
    if (buyIn > 0) {
      const newBalance = Math.round((accountBalance - buyIn) * 100) / 100
      await client.query(`UPDATE multi_accounts SET balance = $1, updated_at = NOW() WHERE id = $2`, [newBalance, accountId])
      await client.query(
        `INSERT INTO multi_transactions (account_id, amount, balance_after, type, note)
         VALUES ($1, $2, $3, 'comp_buy_in', (SELECT 'Buy-in: ' || name FROM multi_comps WHERE id = $4))`,
        [accountId, -buyIn, newBalance, compId]
      )
    }
  }

  static async myComps(userId: number, seasonId: number) {
    const result = await db.query(
      `SELECT c.id, c.name, c.join_code as "joinCode", c.scope_type as "scopeType", c.scope_round as "scopeRound",
              c.scope_game_id as "scopeGameId", c.buy_in as "buyIn", c.starting_budget as "startingBudget",
              c.min_bet as "minBet", c.max_bet as "maxBet", c.must_spend as "mustSpend", c.payout_rule as "payoutRule",
              c.status, c.creator_user_id as "creatorUserId", c.created_at as "createdAt",
              m.balance as "myBalance", m.total_staked as "myStaked", m.payout as "myPayout", m.final_rank as "myRank",
              (SELECT COUNT(*) FROM multi_comp_members WHERE comp_id = c.id)::int as "memberCount"
       FROM multi_comps c
       JOIN multi_comp_members m ON m.comp_id = c.id AND m.user_id = $1
       WHERE c.season_id = $2
       ORDER BY c.status = 'open' DESC, c.created_at DESC`,
      [userId, seasonId]
    )
    return result.rows.map((r: any) => ({
      ...r,
      buyIn: num(r.buyIn), startingBudget: num(r.startingBudget),
      minBet: r.minBet == null ? null : num(r.minBet), maxBet: r.maxBet == null ? null : num(r.maxBet),
      myBalance: num(r.myBalance), myStaked: num(r.myStaked), myPayout: r.myPayout == null ? null : num(r.myPayout),
    }))
  }

  static async compLeaderboard(compId: number) {
    const result = await db.query(
      `SELECT m.user_id as "userId", u.display_name as "displayName", m.balance, m.total_staked as "totalStaked",
              m.payout, m.final_rank as "finalRank",
              c.must_spend as "mustSpend", c.starting_budget as "startingBudget"
       FROM multi_comp_members m
       JOIN users u ON u.id = m.user_id
       JOIN multi_comps c ON c.id = m.comp_id
       WHERE m.comp_id = $1`,
      [compId]
    )
    const rows = result.rows.map((r: any) => {
      const balance = num(r.balance)
      const staked = num(r.totalStaked)
      const unspent = Math.max(0, num(r.startingBudget) - staked)
      // must_spend comps forfeit whatever you never put at risk
      const score = r.mustSpend ? Math.round((balance - unspent) * 100) / 100 : balance
      return {
        userId: r.userId, displayName: r.displayName,
        balance, totalStaked: staked, score,
        payout: r.payout == null ? null : num(r.payout),
        finalRank: r.finalRank,
      }
    })
    rows.sort((a: any, b: any) => (a.finalRank ?? 99) - (b.finalRank ?? 99) || b.score - a.score)
    return rows
  }

  /** Bet-time checks: membership, comp open, legs in scope, stake limits. Returns the member row id. */
  static async validateCompBet(
    compId: number,
    userId: number,
    stake: number,
    legs: Array<{ gameId: number; gameRound: number }>
  ): Promise<{ memberId: number }> {
    const result = await db.query(
      `SELECT c.status, c.scope_type as "scopeType", c.scope_round as "scopeRound", c.scope_game_id as "scopeGameId",
              c.min_bet as "minBet", c.max_bet as "maxBet", m.id as "memberId"
       FROM multi_comps c
       LEFT JOIN multi_comp_members m ON m.comp_id = c.id AND m.user_id = $2
       WHERE c.id = $1`,
      [compId, userId]
    )
    const comp = result.rows[0]
    if (!comp) throw Object.assign(new Error('Comp not found'), { status: 404 })
    if (!comp.memberId) throw Object.assign(new Error('Join the comp before betting in it'), { status: 403 })
    if (comp.status !== 'open') throw Object.assign(new Error('This comp has finished'), { status: 400 })

    for (const leg of legs) {
      const inScope = comp.scopeType === 'game' ? leg.gameId === comp.scopeGameId : leg.gameRound === comp.scopeRound
      if (!inScope) {
        throw Object.assign(new Error(comp.scopeType === 'game' ? 'This comp only covers its single game' : `This comp only covers Round ${comp.scopeRound}`), { status: 400 })
      }
    }
    if (comp.minBet != null && stake < num(comp.minBet)) {
      throw Object.assign(new Error(`Minimum bet in this comp is Ƒ${num(comp.minBet).toFixed(2)}`), { status: 400 })
    }
    if (comp.maxBet != null && stake > num(comp.maxBet)) {
      throw Object.assign(new Error(`Maximum bet in this comp is Ƒ${num(comp.maxBet).toFixed(2)}`), { status: 400 })
    }
    return { memberId: comp.memberId }
  }

  /** Finalise any open comps whose scoped games are all complete and bets all settled. */
  static async finalizeComps(seasonId: number, year: number): Promise<number> {
    const open = await db.query(
      `SELECT id, scope_type as "scopeType", scope_round as "scopeRound", scope_game_id as "scopeGameId",
              buy_in as "buyIn", payout_rule as "payoutRule"
       FROM multi_comps WHERE season_id = $1 AND status = 'open'`,
      [seasonId]
    )
    if (open.rows.length === 0) return 0

    const completed = await SquiggleService.fetchCompletedGames(year)
    const completedIds = new Set(completed.map(g => g.id))
    const completedRounds = new Map<number, number>() // round -> completed count
    for (const g of completed) completedRounds.set(g.round, (completedRounds.get(g.round) || 0) + 1)

    // A round is finished when no incomplete games remain in it
    const upcoming = await SquiggleService.fetchAllUpcomingRounds(year)
    const roundsStillGoing = new Set(upcoming.map(r => r.round))

    let finalized = 0
    for (const comp of open.rows) {
      const scopeDone = comp.scopeType === 'game'
        ? completedIds.has(comp.scopeGameId)
        : !roundsStillGoing.has(comp.scopeRound) && (completedRounds.get(comp.scopeRound) || 0) > 0
      if (!scopeDone) continue

      const pending = await db.query(
        `SELECT COUNT(*)::int as count FROM multi_bets WHERE comp_id = $1 AND status = 'pending'`,
        [comp.id]
      )
      if (pending.rows[0].count > 0) continue // wait for settlement

      await this.payOutComp(comp.id, num(comp.buyIn), comp.payoutRule)
      finalized++
    }
    return finalized
  }

  private static async payOutComp(compId: number, buyIn: number, payoutRule: string) {
    await db.transaction(async (client) => {
      const standings = await client.query(
        `SELECT m.id, m.user_id as "userId", m.balance, m.total_staked as "totalStaked",
                c.must_spend as "mustSpend", c.starting_budget as "startingBudget", c.name
         FROM multi_comp_members m
         JOIN multi_comps c ON c.id = m.comp_id
         WHERE m.comp_id = $1
         FOR UPDATE OF m`,
        [compId]
      )
      const members = standings.rows.map((r: any) => {
        const balance = num(r.balance)
        const unspent = Math.max(0, num(r.startingBudget) - num(r.totalStaked))
        return { ...r, score: r.mustSpend ? balance - unspent : balance }
      }).sort((a: any, b: any) => b.score - a.score)

      const pool = Math.round(buyIn * members.length * 100) / 100
      const compName = members[0]?.name || 'Comp'

      // Payout shares: winner takes all, or 50/30/20 podium for 3+ members
      const shares: number[] = payoutRule === 'podium' && members.length >= 3 ? [0.5, 0.3, 0.2] : [1]

      for (let i = 0; i < members.length; i++) {
        const member = members[i]
        const share = shares[i] || 0
        const payout = Math.round(pool * share * 100) / 100
        await client.query(
          `UPDATE multi_comp_members SET final_rank = $1, payout = $2 WHERE id = $3`,
          [i + 1, payout, member.id]
        )
        if (payout > 0) {
          const accountResult = await client.query(
            `SELECT id, balance FROM multi_accounts a
             WHERE a.user_id = $1 AND a.season_id = (SELECT season_id FROM multi_comps WHERE id = $2)
             FOR UPDATE`,
            [member.userId, compId]
          )
          const account = accountResult.rows[0]
          if (account) {
            const newBalance = Math.round((num(account.balance) + payout) * 100) / 100
            await client.query(`UPDATE multi_accounts SET balance = $1, updated_at = NOW() WHERE id = $2`, [newBalance, account.id])
            await client.query(
              `INSERT INTO multi_transactions (account_id, amount, balance_after, type, note)
               VALUES ($1, $2, $3, 'comp_payout', $4)`,
              [account.id, payout, newBalance, `${compName}: finished #${i + 1}`]
            )
          }
        }
      }

      await client.query(`UPDATE multi_comps SET status = 'complete', completed_at = NOW() WHERE id = $1`, [compId])
    })
  }
}
