import { PoolClient } from 'pg'
import { db } from '../db'
import { SquiggleService } from '../services/squiggle'
import { gameOdds } from '../utils/multiOdds'
import { MultiPropsModel, GameProps } from './multiProps'

const START_BALANCE = Number(process.env.MULTI_START_BALANCE || 1000)
const WEEKLY_TOPUP = Number(process.env.MULTI_WEEKLY_TOPUP || 100)
const MAX_LEGS = 10
// Same-game multi haircuts: legs in one game are correlated; legs on one player doubly so
const SGM_GAME_DISCOUNT = 0.9
const SGM_PLAYER_DISCOUNT = 0.8

export type LegMarket = 'h2h' | 'stat_plus'

// Stats that measure the same act can't be combined for one player.
// kicks/handballs aren't offered yet but are mapped so they can never sneak in beside disposals.
const STAT_FAMILY: Record<string, string> = {
  disposals: 'possession',
  kicks: 'possession',
  handballs: 'possession',
  goals: 'scoring',
  behinds: 'scoring',
  marks: 'marks',
  tackles: 'tackles',
  clearances: 'clearances',
  hitouts: 'hitouts',
}

export interface BetLegInput {
  gameId: number
  market?: LegMarket
  selection?: string // h2h: team name
  playerId?: string // stat_plus
  stat?: string // stat_plus: disposals | goals | marks | tackles | clearances | hitouts
  threshold?: number // stat_plus: ladder rung
}

export interface MultiAccount {
  id: number
  userId: number
  seasonId: number
  balance: number
}

export interface MultiBetLeg {
  id: number
  gameId: number
  gameRound: number
  gameDate: string | null
  market: string
  selection: string
  opponent: string
  odds: number
  status: string
  playerName?: string | null
  statLine?: number | null
  side?: string | null
}

export interface MultiBet {
  id: number
  stake: number
  totalOdds: number
  potentialPayout: number
  status: string
  payout: number | null
  placedAt: string
  settledAt: string | null
  legs: MultiBetLeg[]
}

function num(v: any): number {
  return v == null ? 0 : Number(v)
}

async function insertTransaction(
  client: PoolClient,
  accountId: number,
  amount: number,
  balanceAfter: number,
  type: string,
  betId: number | null,
  note: string | null
) {
  await client.query(
    `INSERT INTO multi_transactions (account_id, amount, balance_after, type, bet_id, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [accountId, amount, balanceAfter, type, betId, note]
  )
}

export class MultiModel {
  /** Fetch the user's account for the season, creating it with the starting balance on first touch. */
  static async getOrCreateAccount(userId: number, seasonId: number): Promise<MultiAccount> {
    const existing = await db.query(
      `SELECT id, user_id as "userId", season_id as "seasonId", balance
       FROM multi_accounts WHERE user_id = $1 AND season_id = $2`,
      [userId, seasonId]
    )
    if (existing.rows.length > 0) {
      return { ...existing.rows[0], balance: num(existing.rows[0].balance) }
    }

    return db.transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO multi_accounts (user_id, season_id, balance)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, season_id) DO NOTHING
         RETURNING id, user_id as "userId", season_id as "seasonId", balance`,
        [userId, seasonId, START_BALANCE]
      )
      if (inserted.rows.length > 0) {
        const account = inserted.rows[0]
        await insertTransaction(client, account.id, START_BALANCE, START_BALANCE, 'starting_balance', null, 'Welcome to Multi')
        return { ...account, balance: num(account.balance) }
      }
      // Raced with another request — fetch the row it created
      const raced = await client.query(
        `SELECT id, user_id as "userId", season_id as "seasonId", balance
         FROM multi_accounts WHERE user_id = $1 AND season_id = $2`,
        [userId, seasonId]
      )
      return { ...raced.rows[0], balance: num(raced.rows[0].balance) }
    })
  }

  static async getTransactions(accountId: number, limit = 30) {
    const result = await db.query(
      `SELECT id, amount, balance_after as "balanceAfter", type, bet_id as "betId", note, created_at as "createdAt"
       FROM multi_transactions WHERE account_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [accountId, limit]
    )
    return result.rows.map((r: any) => ({ ...r, amount: num(r.amount), balanceAfter: num(r.balanceAfter) }))
  }

  /** Upcoming markets: rounds of incomplete games with derived h2h odds. */
  static async getMarkets(year: number) {
    const [rounds, probs] = await Promise.all([
      SquiggleService.fetchAllUpcomingRounds(year),
      SquiggleService.fetchHomeProbabilities(year),
    ])
    const now = Date.now()
    return rounds.map(r => ({
      round: r.round,
      roundname: r.roundname,
      games: r.games
        .map(g => {
          const odds = gameOdds(probs.get(g.id) ?? g.hprob)
          const started = g.date ? new Date(g.date).getTime() <= now : false
          return {
            gameId: g.id,
            round: g.round,
            date: g.date,
            venue: g.venue,
            homeTeam: g.hteamName,
            awayTeam: g.ateamName,
            homeOdds: odds.home,
            awayOdds: odds.away,
            locked: started,
          }
        }),
    }))
  }

  /**
   * Place a multi bet. Odds are computed server-side from current Squiggle
   * probabilities and stored player form — the client only sends game ids,
   * selections and market types. Legs sharing a game take an SGM discount.
   */
  static async placeBet(
    userId: number,
    seasonId: number,
    year: number,
    stake: number,
    legs: BetLegInput[]
  ): Promise<{ betId: number; totalOdds: number; potentialPayout: number; balance: number }> {
    if (!Number.isFinite(stake) || stake <= 0) throw Object.assign(new Error('Stake must be greater than zero'), { status: 400 })
    if (!Array.isArray(legs) || legs.length === 0) throw Object.assign(new Error('A bet needs at least one leg'), { status: 400 })
    if (legs.length > MAX_LEGS) throw Object.assign(new Error(`Maximum ${MAX_LEGS} legs per multi`), { status: 400 })

    const legKeys = legs.map(l => `${l.gameId}:${l.market || 'h2h'}:${l.playerId || l.selection}:${l.stat || ''}:${l.threshold || ''}`)
    if (new Set(legKeys).size !== legKeys.length) {
      throw Object.assign(new Error('Duplicate legs in this multi'), { status: 400 })
    }

    // Conflict rules:
    // - one match-result leg per game
    // - one leg per player per stat family (no disposals + kicks, no 1+ and 3+ goals)
    const h2hGames = new Set<number>()
    const playerFamilies = new Set<string>()
    for (const l of legs) {
      const market = l.market || 'h2h'
      if (market === 'h2h') {
        if (h2hGames.has(l.gameId)) {
          throw Object.assign(new Error('Only one match-result leg per game'), { status: 400 })
        }
        h2hGames.add(l.gameId)
      } else if (l.playerId && l.stat) {
        const family = STAT_FAMILY[l.stat] || l.stat
        const key = `${l.playerId}:${family}`
        if (playerFamilies.has(key)) {
          throw Object.assign(new Error(`Only one ${family} leg per player — pick a single rung`), { status: 400 })
        }
        playerFamilies.add(key)
      }
    }

    // Validate legs against live upcoming games and lock odds server-side
    const [rounds, probs] = await Promise.all([
      SquiggleService.fetchAllUpcomingRounds(year),
      SquiggleService.fetchHomeProbabilities(year),
    ])
    const gameById = new Map<number, (typeof rounds)[number]['games'][number]>()
    for (const r of rounds) for (const g of r.games) gameById.set(g.id, g)

    // Prop markets are generated once per distinct game in the slip
    const propsByGame = new Map<number, GameProps | null>()
    for (const leg of legs) {
      const market = leg.market || 'h2h'
      if (market !== 'h2h' && !propsByGame.has(leg.gameId)) {
        const game = gameById.get(leg.gameId)
        propsByGame.set(
          leg.gameId,
          game ? await MultiPropsModel.getGameProps(year, { id: game.id, round: game.round, hteamName: game.hteamName, ateamName: game.ateamName }) : null
        )
      }
    }

    const now = Date.now()
    const resolvedLegs = legs.map(l => {
      const market: LegMarket = l.market || 'h2h'
      const game = gameById.get(l.gameId)
      if (!game) throw Object.assign(new Error(`Game ${l.gameId} is not open for betting`), { status: 400 })
      if (game.date && new Date(game.date).getTime() <= now) {
        throw Object.assign(new Error(`${game.hteamName} v ${game.ateamName} has already started`), { status: 400 })
      }

      if (market === 'h2h') {
        const isHome = l.selection === game.hteamName
        const isAway = l.selection === game.ateamName
        if (!isHome && !isAway) {
          throw Object.assign(new Error(`${l.selection} is not playing in game ${l.gameId}`), { status: 400 })
        }
        const odds = gameOdds(probs.get(game.id) ?? game.hprob)
        return {
          gameId: game.id,
          gameRound: game.round,
          gameDate: game.date,
          market,
          selection: l.selection as string,
          opponent: isHome ? game.ateamName : game.hteamName,
          odds: isHome ? odds.home : odds.away,
          playerId: null as string | null,
          playerName: null as string | null,
          stat: null as string | null,
          statLine: null as number | null,
          side: null as string | null,
          providerMatchId: null as string | null,
        }
      }

      // Player threshold leg (e.g. "25+ disposals", "2+ goals")
      if (market !== 'stat_plus') {
        throw Object.assign(new Error(`Unknown market type: ${market}`), { status: 400 })
      }
      const props = propsByGame.get(l.gameId)
      const player = props?.players.find(p => p.playerId === l.playerId)
      if (!props || !player) {
        throw Object.assign(new Error(`Player market unavailable for game ${l.gameId}`), { status: 400 })
      }
      const rung = player.rungs.find(r => r.stat === l.stat && r.threshold === Number(l.threshold))
      if (!rung) {
        throw Object.assign(new Error(`${player.playerName} ${l.threshold}+ ${l.stat} is not an offered market`), { status: 400 })
      }
      const statLabel = rung.stat.charAt(0).toUpperCase() + rung.stat.slice(1)
      return {
        gameId: game.id,
        gameRound: game.round,
        gameDate: game.date,
        market,
        selection: `${player.playerName} ${rung.threshold}+ ${statLabel}`,
        opponent: `${game.hteamName} v ${game.ateamName}`,
        odds: rung.odds,
        playerId: player.playerId,
        playerName: player.playerName,
        stat: rung.stat,
        statLine: rung.threshold,
        side: null as string | null,
        providerMatchId: props.providerMatchId,
      }
    })

    const roundedStake = Math.round(stake * 100) / 100

    // Combined odds with correlation haircuts: 0.9 per extra leg in a game,
    // tightened to 0.8 when the extra leg is on the same player
    const rawOdds = resolvedLegs.reduce((acc, l) => acc * l.odds, 1)
    const legsPerGame = new Map<number, number>()
    const legsPerPlayer = new Map<string, number>()
    for (const l of resolvedLegs) {
      legsPerGame.set(l.gameId, (legsPerGame.get(l.gameId) || 0) + 1)
      if (l.playerId) legsPerPlayer.set(l.playerId, (legsPerPlayer.get(l.playerId) || 0) + 1)
    }
    let sgmFactor = 1
    for (const count of legsPerGame.values()) {
      if (count > 1) sgmFactor *= Math.pow(SGM_GAME_DISCOUNT, count - 1)
    }
    for (const count of legsPerPlayer.values()) {
      if (count > 1) sgmFactor *= Math.pow(SGM_PLAYER_DISCOUNT / SGM_GAME_DISCOUNT, count - 1)
    }
    const totalOdds = Math.max(1.01, Math.round(rawOdds * sgmFactor * 1000) / 1000)
    const potentialPayout = Math.round(roundedStake * totalOdds * 100) / 100

    const account = await this.getOrCreateAccount(userId, seasonId)

    return db.transaction(async (client) => {
      // Lock the account row so concurrent bets can't overspend
      const locked = await client.query(
        `SELECT id, balance FROM multi_accounts WHERE id = $1 FOR UPDATE`,
        [account.id]
      )
      const balance = num(locked.rows[0].balance)
      if (balance < roundedStake) {
        throw Object.assign(new Error(`Insufficient balance — you have $${balance.toFixed(2)}`), { status: 400 })
      }

      const betResult = await client.query(
        `INSERT INTO multi_bets (account_id, stake, total_odds, potential_payout, status)
         VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
        [account.id, roundedStake, totalOdds, potentialPayout]
      )
      const betId = betResult.rows[0].id

      for (const leg of resolvedLegs) {
        await client.query(
          `INSERT INTO multi_bet_legs (bet_id, game_id, game_round, game_date, market, selection, opponent, odds, player_id, player_name, stat, stat_line, side, provider_match_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [betId, leg.gameId, leg.gameRound, leg.gameDate, leg.market, leg.selection, leg.opponent, leg.odds, leg.playerId, leg.playerName, leg.stat, leg.statLine, leg.side, leg.providerMatchId]
        )
      }

      const newBalance = Math.round((balance - roundedStake) * 100) / 100
      await client.query(`UPDATE multi_accounts SET balance = $1, updated_at = NOW() WHERE id = $2`, [newBalance, account.id])
      await insertTransaction(client, account.id, -roundedStake, newBalance, 'bet_stake', betId, `${resolvedLegs.length}-leg multi @ ${totalOdds.toFixed(2)}`)

      return { betId, totalOdds, potentialPayout, balance: newBalance }
    })
  }

  static async getUserBets(userId: number, seasonId: number): Promise<MultiBet[]> {
    const result = await db.query(
      `SELECT b.id, b.stake, b.total_odds as "totalOdds", b.potential_payout as "potentialPayout",
              b.status, b.payout, b.placed_at as "placedAt", b.settled_at as "settledAt"
       FROM multi_bets b
       JOIN multi_accounts a ON b.account_id = a.id
       WHERE a.user_id = $1 AND a.season_id = $2
       ORDER BY b.placed_at DESC
       LIMIT 100`,
      [userId, seasonId]
    )
    if (result.rows.length === 0) return []

    const betIds = result.rows.map((r: any) => r.id)
    const legsResult = await db.query(
      `SELECT id, bet_id as "betId", game_id as "gameId", game_round as "gameRound", game_date as "gameDate",
              market, selection, opponent, odds, status,
              player_name as "playerName", stat_line as "statLine", side
       FROM multi_bet_legs WHERE bet_id = ANY($1::int[])
       ORDER BY game_date ASC NULLS LAST, id ASC`,
      [betIds]
    )
    const legsByBet = new Map<number, MultiBetLeg[]>()
    for (const leg of legsResult.rows) {
      const list = legsByBet.get(leg.betId) || []
      list.push({ ...leg, odds: num(leg.odds), statLine: leg.statLine == null ? null : num(leg.statLine) })
      legsByBet.set(leg.betId, list)
    }

    return result.rows.map((b: any) => ({
      ...b,
      stake: num(b.stake),
      totalOdds: num(b.totalOdds),
      potentialPayout: num(b.potentialPayout),
      payout: b.payout == null ? null : num(b.payout),
      legs: legsByBet.get(b.id) || [],
    }))
  }

  static async getLeaderboard(seasonId: number) {
    const result = await db.query(
      `SELECT a.user_id as "userId", u.display_name as "displayName", a.balance,
              COUNT(b.id) FILTER (WHERE b.status = 'pending')::int as "pendingBets",
              COALESCE(SUM(b.stake) FILTER (WHERE b.status = 'pending'), 0) as "pendingStake",
              COUNT(b.id) FILTER (WHERE b.status = 'won')::int as "wonBets",
              COUNT(b.id) FILTER (WHERE b.status = 'lost')::int as "lostBets"
       FROM multi_accounts a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN multi_bets b ON b.account_id = a.id
       WHERE a.season_id = $1
       GROUP BY a.user_id, u.display_name, a.balance
       ORDER BY a.balance DESC`,
      [seasonId]
    )
    return result.rows.map((r: any) => ({ ...r, balance: num(r.balance), pendingStake: num(r.pendingStake) }))
  }

  /** Settle pending legs against completed games and ingested player stats, then settle and pay finished bets. */
  static async settleBets(seasonId: number, year: number): Promise<{ legsSettled: number; betsSettled: number }> {
    const pendingLegs = await db.query(
      `SELECT l.id, l.bet_id as "betId", l.game_id as "gameId", l.selection, l.market,
              l.player_id as "playerId", l.stat, l.stat_line as "statLine", l.side,
              l.provider_match_id as "providerMatchId"
       FROM multi_bet_legs l
       JOIN multi_bets b ON l.bet_id = b.id
       JOIN multi_accounts a ON b.account_id = a.id
       WHERE l.status = 'pending' AND a.season_id = $1`,
      [seasonId]
    )
    if (pendingLegs.rows.length === 0) return { legsSettled: 0, betsSettled: 0 }

    const completed = await SquiggleService.fetchCompletedGames(year)
    const winnerByGame = new Map<number, string | null>()
    for (const g of completed) winnerByGame.set(g.id, g.winnerName)

    // Player stats for any prop legs (only matches already ingested can settle)
    const providerIds = [...new Set(pendingLegs.rows.filter((l: any) => l.providerMatchId).map((l: any) => l.providerMatchId))]
    const statsByMatch = new Map<string, Map<string, Record<string, number>>>()
    if (providerIds.length > 0) {
      const statsResult = await db.query(
        `SELECT provider_match_id as "providerMatchId", player_id as "playerId",
                disposals, goals, marks, tackles, clearances, hitouts
         FROM multi_player_stats WHERE provider_match_id = ANY($1::varchar[])`,
        [providerIds]
      )
      for (const row of statsResult.rows) {
        const match = statsByMatch.get(row.providerMatchId) || new Map()
        match.set(row.playerId, {
          disposals: row.disposals, goals: row.goals, marks: row.marks,
          tackles: row.tackles, clearances: row.clearances, hitouts: row.hitouts,
        })
        statsByMatch.set(row.providerMatchId, match)
      }
    }

    let legsSettled = 0
    const touchedBets = new Set<number>()

    for (const leg of pendingLegs.rows) {
      let status: string | null = null

      if (leg.market === 'h2h') {
        if (!winnerByGame.has(leg.gameId)) continue
        const winner = winnerByGame.get(leg.gameId)
        status = winner === null ? 'void' : winner === leg.selection ? 'won' : 'lost'
      } else {
        // Prop legs settle once the match's player stats are ingested
        const matchStats = leg.providerMatchId ? statsByMatch.get(leg.providerMatchId) : undefined
        if (!matchStats) continue
        const playerStats = matchStats.get(leg.playerId)
        if (!playerStats) {
          status = 'void' // player didn't take the field
        } else if (leg.market === 'stat_plus') {
          const value = playerStats[leg.stat]
          if (value == null) continue
          status = value >= num(leg.statLine) ? 'won' : 'lost'
        } else if (leg.market === 'disposals_ou') {
          // Legacy market support for bets placed before threshold ladders
          const line = num(leg.statLine)
          status = leg.side === 'over'
            ? (playerStats.disposals > line ? 'won' : 'lost')
            : (playerStats.disposals < line ? 'won' : 'lost')
        } else if (leg.market === 'anytime_goal') {
          status = playerStats.goals >= 1 ? 'won' : 'lost'
        } else {
          continue
        }
      }

      await db.query(`UPDATE multi_bet_legs SET status = $1, settled_at = NOW() WHERE id = $2`, [status, leg.id])
      legsSettled++
      touchedBets.add(leg.betId)
    }

    let betsSettled = 0
    for (const betId of touchedBets) {
      const settled = await this.settleBetIfFinished(betId)
      if (settled) betsSettled++
    }
    return { legsSettled, betsSettled }
  }

  private static async settleBetIfFinished(betId: number): Promise<boolean> {
    return db.transaction(async (client) => {
      const betResult = await client.query(
        `SELECT id, account_id as "accountId", stake, status FROM multi_bets WHERE id = $1 FOR UPDATE`,
        [betId]
      )
      const bet = betResult.rows[0]
      if (!bet || bet.status !== 'pending') return false

      const legsResult = await client.query(
        `SELECT odds, status FROM multi_bet_legs WHERE bet_id = $1`,
        [betId]
      )
      const legs = legsResult.rows
      if (legs.some((l: any) => l.status === 'pending')) return false

      const stake = num(bet.stake)
      let status: string
      let payout = 0

      if (legs.some((l: any) => l.status === 'lost')) {
        status = 'lost'
      } else if (legs.every((l: any) => l.status === 'void')) {
        status = 'void'
        payout = stake // full refund
      } else {
        // Won: void legs contribute odds of 1
        status = 'won'
        const effectiveOdds = legs.reduce((acc: number, l: any) => acc * (l.status === 'won' ? num(l.odds) : 1), 1)
        payout = Math.round(stake * effectiveOdds * 100) / 100
      }

      await client.query(
        `UPDATE multi_bets SET status = $1, payout = $2, settled_at = NOW() WHERE id = $3`,
        [status, payout, betId]
      )

      if (payout > 0) {
        const locked = await client.query(`SELECT balance FROM multi_accounts WHERE id = $1 FOR UPDATE`, [bet.accountId])
        const newBalance = Math.round((num(locked.rows[0].balance) + payout) * 100) / 100
        await client.query(`UPDATE multi_accounts SET balance = $1, updated_at = NOW() WHERE id = $2`, [newBalance, bet.accountId])
        await insertTransaction(
          client, bet.accountId, payout, newBalance,
          status === 'void' ? 'bet_void_refund' : 'bet_payout', betId,
          status === 'void' ? 'All legs void — stake refunded' : 'Multi won'
        )
      }
      return true
    })
  }

  /** Credit every account in the season once per ISO week. Safe to call repeatedly. */
  static async weeklyTopup(seasonId: number, isoWeek: string): Promise<{ credited: number; skipped: boolean }> {
    return db.transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO multi_topups (season_id, iso_week, amount)
         VALUES ($1, $2, $3)
         ON CONFLICT (season_id, iso_week) DO NOTHING
         RETURNING id`,
        [seasonId, isoWeek, WEEKLY_TOPUP]
      )
      if (inserted.rows.length === 0) return { credited: 0, skipped: true }
      const topupId = inserted.rows[0].id

      const accounts = await client.query(
        `SELECT id, balance FROM multi_accounts WHERE season_id = $1 FOR UPDATE`,
        [seasonId]
      )
      for (const account of accounts.rows) {
        const newBalance = Math.round((num(account.balance) + WEEKLY_TOPUP) * 100) / 100
        await client.query(`UPDATE multi_accounts SET balance = $1, updated_at = NOW() WHERE id = $2`, [newBalance, account.id])
        await insertTransaction(client, account.id, WEEKLY_TOPUP, newBalance, 'weekly_topup', null, `Weekly top-up (${isoWeek})`)
      }

      await client.query(`UPDATE multi_topups SET accounts_credited = $1 WHERE id = $2`, [accounts.rows.length, topupId])
      return { credited: accounts.rows.length, skipped: false }
    })
  }
}
