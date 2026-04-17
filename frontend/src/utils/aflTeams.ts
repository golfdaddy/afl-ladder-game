// Shared AFL team metadata and scoring helpers used across CompetitionPage & DashboardPage

export interface AFLTeamMeta {
  name: string
  shortName: string
  primaryColor: string
  secondaryColor: string
  textColor: string
}

export const AFL_TEAM_META: AFLTeamMeta[] = [
  { name: 'Melbourne',         shortName: 'MEL', primaryColor: '#041E42', secondaryColor: '#CC2031', textColor: '#FFFFFF' },
  { name: 'St Kilda',          shortName: 'STK', primaryColor: '#000000', secondaryColor: '#ED1C24', textColor: '#FFFFFF' },
  { name: 'Collingwood',       shortName: 'COL', primaryColor: '#000000', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'Brisbane Lions',    shortName: 'BRL', primaryColor: '#69003B', secondaryColor: '#0055A3', textColor: '#FFFFFF' },
  { name: 'Port Adelaide',     shortName: 'PTA', primaryColor: '#008AAB', secondaryColor: '#000000', textColor: '#FFFFFF' },
  { name: 'Carlton',           shortName: 'CAR', primaryColor: '#001B2A', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'North Melbourne',   shortName: 'NTH', primaryColor: '#003C71', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'GWS Giants',        shortName: 'GWS', primaryColor: '#F15C22', secondaryColor: '#4A4F55', textColor: '#FFFFFF' },
  { name: 'Richmond',          shortName: 'RIC', primaryColor: '#000000', secondaryColor: '#FED102', textColor: '#FED102' },
  { name: 'Fremantle',         shortName: 'FRE', primaryColor: '#2E0854', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'Essendon',          shortName: 'ESS', primaryColor: '#000000', secondaryColor: '#CC2031', textColor: '#CC2031' },
  { name: 'Adelaide Crows',    shortName: 'ADE', primaryColor: '#002654', secondaryColor: '#E21E31', textColor: '#FFD200' },
  { name: 'Gold Coast Suns',   shortName: 'GCS', primaryColor: '#CF2032', secondaryColor: '#F4B223', textColor: '#FFFFFF' },
  { name: 'Geelong',           shortName: 'GEE', primaryColor: '#001F3D', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'Hawthorn',          shortName: 'HAW', primaryColor: '#4D2004', secondaryColor: '#FBBF15', textColor: '#FBBF15' },
  { name: 'Sydney Swans',      shortName: 'SYD', primaryColor: '#ED171F', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'West Coast Eagles', shortName: 'WCE', primaryColor: '#002B5C', secondaryColor: '#F2A900', textColor: '#F2A900' },
  { name: 'Western Bulldogs',  shortName: 'WBD', primaryColor: '#014896', secondaryColor: '#E1251B', textColor: '#FFFFFF' },
]

export const getTeamMeta = (name: string): AFLTeamMeta =>
  AFL_TEAM_META.find((t) => t.name === name) ?? {
    name,
    shortName: name.slice(0, 3).toUpperCase(),
    primaryColor: '#334155',
    secondaryColor: '#ffffff',
    textColor: '#ffffff',
  }

export const zoneConfig = [
  { label: 'Top 4',  positions: '1–4',   range: [0, 3],  text: 'text-emerald-600', dot: 'bg-emerald-500' },
  { label: 'Finals', positions: '5–10',  range: [4, 9],  text: 'text-blue-600',    dot: 'bg-blue-500'   },
  { label: 'Mid',    positions: '11–14', range: [10, 13],text: 'text-slate-500',   dot: 'bg-slate-400'  },
  { label: 'Bottom', positions: '15–18', range: [14, 17],text: 'text-red-500',     dot: 'bg-red-500'    },
]

export const getZone = (i: number) =>
  zoneConfig.find((z) => i >= z.range[0] && i <= z.range[1])!

export function posBadgeClass(i: number) {
  if (i < 4)              return 'bg-emerald-500 text-white'
  if (i >= 4 && i < 10)  return 'bg-blue-100 text-blue-700'
  if (i >= 10 && i < 14) return 'bg-slate-100 text-slate-600'
  return 'bg-red-100 text-red-600'
}

export function ptsColorClass(pts: number | null) {
  if (pts === 0)                       return 'text-emerald-500'
  if (pts !== null && pts <= 2)        return 'text-emerald-600'
  if (pts !== null && pts <= 4)        return 'text-amber-500'
  return 'text-red-500'
}

export interface MemberLadder {
  userId: number
  displayName: string
  ladder: string[]
}

export function classifyTeam(teamName: string, memberPredictions: MemberLadder[]) {
  const positions = memberPredictions.map(m => m.ladder.indexOf(teamName) + 1)
  const allSame = positions.every(p => p === positions[0])
  const spread = Math.max(...positions) - Math.min(...positions)
  return { allSame, isKeyTeam: spread >= 3, spread }
}

export function getScoreForMember(member: MemberLadder, teamName: string, aflTeams: string[]) {
  const actualPos = aflTeams.indexOf(teamName) + 1
  const predIdx = member.ladder.indexOf(teamName)
  const predictedPos = predIdx >= 0 ? predIdx + 1 : null
  const diff = predictedPos !== null ? predictedPos - actualPos : null
  const points = diff !== null ? Math.abs(diff) : null
  return { predictedPos, diff, points }
}

export function totalForMember(member: MemberLadder, aflTeams: string[]) {
  return aflTeams.reduce(
    (sum, team) => sum + (getScoreForMember(member, team, aflTeams).points || 0),
    0,
  )
}
