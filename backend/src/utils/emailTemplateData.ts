import { db } from '../db'
import { AFLLadderModel, AFLTeam } from '../models/aflLadder'

export interface EmailTemplateTokenRef {
  token: string
  category: 'profile' | 'season' | 'performance' | 'components'
  mode: 'escaped' | 'raw'
  description: string
}

export interface EmailStarterTemplate {
  name: string
  description: string
  subjectTemplate: string
  htmlTemplate: string
}

export const EMAIL_TEMPLATE_TOKEN_REFERENCE: EmailTemplateTokenRef[] = [
  { token: 'displayName', category: 'profile', mode: 'escaped', description: 'Recipient display name' },
  { token: 'email', category: 'profile', mode: 'escaped', description: 'Recipient email address' },
  { token: 'userId', category: 'profile', mode: 'escaped', description: 'Recipient user ID' },
  { token: 'seasonId', category: 'season', mode: 'escaped', description: 'Current campaign season ID' },
  { token: 'seasonYear', category: 'season', mode: 'escaped', description: 'Current campaign season year' },
  { token: 'roundNo', category: 'season', mode: 'escaped', description: 'Round number provided in send form' },
  { token: 'competitionCount', category: 'performance', mode: 'escaped', description: 'How many comps the user is in' },
  { token: 'predictionCount', category: 'performance', mode: 'escaped', description: 'How many predictions submitted' },
  { token: 'bestScore', category: 'performance', mode: 'escaped', description: 'Best score (lower is better)' },
  { token: 'leagueLadderCapturedAt', category: 'components', mode: 'escaped', description: 'ISO date/time for latest AFL ladder snapshot' },
  { token: 'leagueLadderText', category: 'components', mode: 'escaped', description: 'Plain-text ordered AFL ladder list' },
  { token: 'leagueLadderHtml', category: 'components', mode: 'raw', description: 'Full AFL ladder table HTML (use triple braces)' },
  { token: 'globalLeaderboardHtml', category: 'components', mode: 'raw', description: 'Top-10 global leaderboard HTML' },
  { token: 'userCompetitionsHtml', category: 'components', mode: 'raw', description: 'Recipient competition summary HTML' },
  { token: 'userCompetitionsCount', category: 'components', mode: 'escaped', description: 'Recipient competition count in current season' },
]

export const EMAIL_TEMPLATE_STARTERS: EmailStarterTemplate[] = [
  {
    name: 'Round Recap',
    description: 'Weekly recap with ladder and user competition summary.',
    subjectTemplate: 'Round {{roundNo}} recap for {{displayName}}',
    htmlTemplate: `
<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#1e293b;">
  <h1 style="margin:0 0 8px;">Round {{roundNo}} Recap</h1>
  <p style="margin:0 0 16px;">Hi {{displayName}}, here is your {{seasonYear}} update.</p>
  <h2 style="margin:16px 0 8px;">AFL Ladder</h2>
  {{{leagueLadderHtml}}}
  <h2 style="margin:16px 0 8px;">Your Competitions</h2>
  {{{userCompetitionsHtml}}}
</div>`.trim(),
  },
  {
    name: 'Season Update',
    description: 'Announcement style email with leaderboard snapshot.',
    subjectTemplate: '{{seasonYear}} Season Update',
    htmlTemplate: `
<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#1e293b;">
  <h1 style="margin:0 0 10px;">Season Update</h1>
  <p style="margin:0 0 14px;">Hi {{displayName}}, thanks for competing this season.</p>
  <p style="margin:0 0 14px;">You are currently in {{competitionCount}} competition(s).</p>
  <h2 style="margin:16px 0 8px;">Global Top 10</h2>
  {{{globalLeaderboardHtml}}}
</div>`.trim(),
  },
]

function escapeHtml(value: unknown): string {
  const str = String(value ?? '')
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderLeagueLadderHtml(teams: AFLTeam[]): string {
  const rows = teams
    .map(
      (team) =>
        `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${team.position}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(team.teamName)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${team.wins}-${team.losses}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${Number(team.percentage).toFixed(2)}</td>
        </tr>`
    )
    .join('')

  return `<table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f8fafc;">
        <th style="padding:8px;text-align:left;border-bottom:1px solid #e2e8f0;">#</th>
        <th style="padding:8px;text-align:left;border-bottom:1px solid #e2e8f0;">Team</th>
        <th style="padding:8px;text-align:right;border-bottom:1px solid #e2e8f0;">W-L</th>
        <th style="padding:8px;text-align:right;border-bottom:1px solid #e2e8f0;">%</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`
}

function renderLeaderboardHtml(rows: Array<{ displayName: string; totalPoints: number | null }>): string {
  if (rows.length === 0) {
    return '<p style="margin:0;color:#64748b;">No leaderboard data available yet.</p>'
  }

  const body = rows
    .map(
      (row, index) =>
        `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${index + 1}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(row.displayName)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${row.totalPoints ?? '-'}</td>
        </tr>`
    )
    .join('')

  return `<table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f8fafc;">
        <th style="padding:8px;text-align:left;border-bottom:1px solid #e2e8f0;">Rank</th>
        <th style="padding:8px;text-align:left;border-bottom:1px solid #e2e8f0;">Player</th>
        <th style="padding:8px;text-align:right;border-bottom:1px solid #e2e8f0;">Points</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`
}

function renderUserCompetitionsHtml(
  rows: Array<{ competitionName: string; competitionRank: number | null; totalPoints: number | null }>
): string {
  if (rows.length === 0) {
    return '<p style="margin:0;color:#64748b;">No active competitions for this season.</p>'
  }

  const items = rows
    .map(
      (row) =>
        `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(row.competitionName)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${row.competitionRank ?? '-'}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${row.totalPoints ?? '-'}</td>
        </tr>`
    )
    .join('')

  return `<table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f8fafc;">
        <th style="padding:8px;text-align:left;border-bottom:1px solid #e2e8f0;">Competition</th>
        <th style="padding:8px;text-align:right;border-bottom:1px solid #e2e8f0;">Rank</th>
        <th style="padding:8px;text-align:right;border-bottom:1px solid #e2e8f0;">Points</th>
      </tr>
    </thead>
    <tbody>${items}</tbody>
  </table>`
}

export function getEmailTemplateSampleData(): Record<string, unknown> {
  return {
    displayName: 'Matt',
    email: 'matt@example.com',
    userId: 1,
    seasonId: 1,
    seasonYear: new Date().getFullYear(),
    roundNo: 1,
    competitionCount: 3,
    predictionCount: 1,
    bestScore: 66,
    leagueLadderCapturedAt: new Date().toISOString(),
    leagueLadderText: '1. Sydney Swans\n2. Gold Coast Suns\n3. Geelong',
    leagueLadderHtml:
      '<table><tr><th>#</th><th>Team</th></tr><tr><td>1</td><td>Sydney Swans</td></tr><tr><td>2</td><td>Gold Coast Suns</td></tr></table>',
    globalLeaderboardHtml:
      '<table><tr><th>Rank</th><th>Player</th><th>Points</th></tr><tr><td>1</td><td>Matt</td><td>66</td></tr></table>',
    userCompetitionsHtml:
      '<table><tr><th>Competition</th><th>Rank</th><th>Points</th></tr><tr><td>Ladder Comp 2026</td><td>1</td><td>66</td></tr></table>',
    userCompetitionsCount: 1,
  }
}

export async function buildEmailDynamicData(params: {
  seasonId: number | null
  recipientUserIds: number[]
}): Promise<{
  globalData: Record<string, unknown>
  perUserData: Map<number, Record<string, unknown>>
}> {
  const globalData: Record<string, unknown> = {
    leagueLadderCapturedAt: '',
    leagueLadderText: '',
    leagueLadderHtml: '',
    globalLeaderboardHtml: '',
  }

  const perUserData = new Map<number, Record<string, unknown>>()
  if (!params.seasonId) return { globalData, perUserData }

  const seasonId = params.seasonId

  const ladder = await AFLLadderModel.getLatestLadder(seasonId)
  if (ladder?.teams?.length) {
    globalData.leagueLadderCapturedAt = new Date(ladder.capturedAt).toISOString()
    globalData.leagueLadderText = ladder.teams
      .map((team) => `${team.position}. ${team.teamName}`)
      .join('\n')
    globalData.leagueLadderHtml = renderLeagueLadderHtml(ladder.teams)
  }

  const leaderboardResult = await db.query(
    `SELECT u.display_name as "displayName",
            s.total_points as "totalPoints"
     FROM scores s
     JOIN users u ON u.id = s.user_id
     WHERE s.season_id = $1
     ORDER BY s.total_points ASC, u.display_name ASC
     LIMIT 10`,
    [seasonId]
  )

  globalData.globalLeaderboardHtml = renderLeaderboardHtml(leaderboardResult.rows)

  if (params.recipientUserIds.length === 0) {
    return { globalData, perUserData }
  }

  const competitionRowsResult = await db.query(
    `SELECT cm.user_id as "userId",
            c.name as "competitionName",
            DENSE_RANK() OVER (
              PARTITION BY c.id
              ORDER BY s.total_points ASC NULLS LAST, cm.user_id ASC
            )::int as "competitionRank",
            s.total_points as "totalPoints"
     FROM competition_members cm
     JOIN competitions c ON c.id = cm.competition_id
     LEFT JOIN scores s ON s.user_id = cm.user_id AND s.season_id = c.season_id
     WHERE c.season_id = $1
       AND cm.user_id = ANY($2::int[])
     ORDER BY cm.user_id ASC, c.name ASC`,
    [seasonId, params.recipientUserIds]
  )

  const rowsByUser = new Map<number, Array<{ competitionName: string; competitionRank: number | null; totalPoints: number | null }>>()

  for (const row of competitionRowsResult.rows) {
    const userId = Number(row.userId)
    const list = rowsByUser.get(userId) || []
    list.push({
      competitionName: String(row.competitionName),
      competitionRank: row.competitionRank === null || row.competitionRank === undefined ? null : Number(row.competitionRank),
      totalPoints: row.totalPoints === null || row.totalPoints === undefined ? null : Number(row.totalPoints),
    })
    rowsByUser.set(userId, list)
  }

  for (const userId of params.recipientUserIds) {
    const rows = rowsByUser.get(userId) || []
    perUserData.set(userId, {
      userCompetitionsHtml: renderUserCompetitionsHtml(rows),
      userCompetitionsCount: rows.length,
    })
  }

  return { globalData, perUserData }
}
