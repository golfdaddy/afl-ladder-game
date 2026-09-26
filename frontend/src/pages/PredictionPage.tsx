import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useCurrentSeason } from '../hooks/useCurrentSeason'

interface AFLTeam {
  name: string
  shortName: string
  primaryColor: string
  secondaryColor: string
  textColor: string
}

const AFL_TEAMS: AFLTeam[] = [
  { name: 'Melbourne',        shortName: 'MEL', primaryColor: '#041E42', secondaryColor: '#CC2031', textColor: '#FFFFFF' },
  { name: 'St Kilda',         shortName: 'STK', primaryColor: '#000000', secondaryColor: '#ED1C24', textColor: '#FFFFFF' },
  { name: 'Collingwood',      shortName: 'COL', primaryColor: '#000000', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'Brisbane Lions',   shortName: 'BRL', primaryColor: '#69003B', secondaryColor: '#0055A3', textColor: '#FFFFFF' },
  { name: 'Port Adelaide',    shortName: 'PTA', primaryColor: '#008AAB', secondaryColor: '#000000', textColor: '#FFFFFF' },
  { name: 'Carlton',          shortName: 'CAR', primaryColor: '#001B2A', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'North Melbourne',  shortName: 'NTH', primaryColor: '#003C71', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'GWS Giants',       shortName: 'GWS', primaryColor: '#F15C22', secondaryColor: '#4A4F55', textColor: '#FFFFFF' },
  { name: 'Richmond',         shortName: 'RIC', primaryColor: '#000000', secondaryColor: '#FED102', textColor: '#FED102' },
  { name: 'Fremantle',        shortName: 'FRE', primaryColor: '#2E0854', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'Essendon',         shortName: 'ESS', primaryColor: '#000000', secondaryColor: '#CC2031', textColor: '#CC2031' },
  { name: 'Adelaide Crows',   shortName: 'ADE', primaryColor: '#002654', secondaryColor: '#E21E31', textColor: '#FFD200' },
  { name: 'Gold Coast Suns',  shortName: 'GCS', primaryColor: '#CF2032', secondaryColor: '#F4B223', textColor: '#FFFFFF' },
  { name: 'Geelong',          shortName: 'GEE', primaryColor: '#001F3D', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'Hawthorn',         shortName: 'HAW', primaryColor: '#4D2004', secondaryColor: '#FBBF15', textColor: '#FBBF15' },
  { name: 'Sydney Swans',     shortName: 'SYD', primaryColor: '#ED171F', secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { name: 'West Coast Eagles',shortName: 'WCE', primaryColor: '#002B5C', secondaryColor: '#F2A900', textColor: '#F2A900' },
  { name: 'Western Bulldogs', shortName: 'WBD', primaryColor: '#014896', secondaryColor: '#E1251B', textColor: '#FFFFFF' },
]

const getTeamMeta = (name: string): AFLTeam =>
  AFL_TEAMS.find((t) => t.name === name) ?? {
    name,
    shortName: name.slice(0, 3).toUpperCase(),
    primaryColor: '#334155',
    secondaryColor: '#ffffff',
    textColor: '#ffffff',
  }

const zoneConfig = [
  { label: 'Top 4',  positions: '1–4',   range: [0, 3],  text: 'text-emerald-600', dot: 'bg-emerald-500' },
  { label: 'Finals', positions: '5–10',  range: [4, 9],  text: 'text-blue-600',    dot: 'bg-blue-500'   },
  { label: 'Mid',    positions: '11–14', range: [10, 13],text: 'text-slate-500',   dot: 'bg-slate-400'  },
  { label: 'Bottom', positions: '15–18', range: [14, 17],text: 'text-red-500',     dot: 'bg-red-500'    },
]
const getZone = (i: number) => zoneConfig.find((z) => i >= z.range[0] && i <= z.range[1])!

// Colour a team's position badge by predicted position
function posBadgeClass(i: number) {
  if (i < 4)              return 'bg-emerald-500 text-white'
  if (i >= 4 && i < 10)  return 'bg-blue-100 text-blue-700'
  if (i >= 10 && i < 14) return 'bg-slate-100 text-slate-600'
  return 'bg-red-100 text-red-600'
}

// Diff badge — direction shows whether team finished higher/lower than predicted
function DiffBadge({ diff, points }: { diff: number | null; points: number | null }) {
  if (diff === null || points === null) {
    return <span className="text-xs text-slate-300 font-mono w-12 text-center">—</span>
  }
  if (diff === 0) {
    return (
      <span className="inline-flex items-center justify-center w-12 text-xs font-bold text-emerald-600">
        ✓ 0
      </span>
    )
  }
  if (diff < 0) {
    // actual < predicted → team finished HIGHER than expected
    return (
      <span className="inline-flex items-center justify-center gap-0.5 w-12 text-xs font-bold text-emerald-600">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
        </svg>
        {Math.abs(diff)}
      </span>
    )
  }
  // diff > 0 → actual > predicted → team finished LOWER than expected
  return (
    <span className="inline-flex items-center justify-center gap-0.5 w-12 text-xs font-bold text-red-500">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
      </svg>
      {Math.abs(diff)}
    </span>
  )
}

// Actual ladder position badge (coloured by where the team ACTUALLY sits)
function ActualPosBadge({ pos }: { pos: number | null }) {
  if (pos === null) return <span className="w-8 text-center text-xs text-slate-300">—</span>
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black ${posBadgeClass(pos - 1)}`}>
      {pos}
    </span>
  )
}

export default function PredictionPage() {
  const { seasonId = '1' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isLocked: competitionLocked, seasonYear, cutoffAt } = useCurrentSeason()
  const [ladder, setLadder] = useState<AFLTeam[]>([...AFL_TEAMS])
  const [error, setError] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'edit' | 'score'>(competitionLocked ? 'score' : 'edit')
  const dragNode = useRef<HTMLDivElement | null>(null)
  // Touch drag state
  const touchDragIndex  = useRef<number | null>(null)
  const touchLastTarget = useRef<number | null>(null)

  useEffect(() => {
    if (competitionLocked) setViewMode('score')
  }, [competitionLocked])

  // Fetch existing prediction (enriched with actual positions if ladder exists)
  const { isLoading: isLoadingPrediction, data: predictionData } = useQuery({
    queryKey: ['prediction', seasonId],
    queryFn: async () => {
      try {
        const response = await api.get(`/predictions/${seasonId}`)
        const pred = response.data.prediction

        if (pred?.teams) {
          const sorted = [...pred.teams].sort((a: any, b: any) => a.position - b.position)
          const reordered = sorted
            .map((saved: any) => AFL_TEAMS.find((t) => t.name === saved.teamName))
            .filter(Boolean) as AFLTeam[]

          if (reordered.length === 18) {
            setLadder(reordered)
          }

          // If we have actual positions (or competition is locked), switch to score view
          const hasScores = sorted.some((t: any) => t.actualPosition !== null)
          if (hasScores || competitionLocked) setViewMode('score')
        }

        return pred
      } catch {
        return null
      }
    },
  })

  // Submit / update mutation
  const submitMutation = useMutation({
    mutationFn: () =>
      api.post('/predictions', {
        seasonId: parseInt(seasonId),
        teams: ladder.map((team, index) => ({
          position: index + 1,
          teamName: team.name,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prediction', seasonId] })
      setError('')
      navigate('/dashboard')
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to submit prediction')
    },
  })

  // Drag handlers
  const handleDragStart = (index: number, e: React.DragEvent<HTMLDivElement>) => {
    setDragIndex(index)
    dragNode.current = e.target as HTMLDivElement
    e.dataTransfer.effectAllowed = 'move'
    setTimeout(() => { if (dragNode.current) dragNode.current.style.opacity = '0.4' }, 0)
  }

  const handleDragEnter = (index: number) => {
    if (dragIndex === null || dragIndex === index) return
    setDragOverIndex(index)
    setLadder((prev) => {
      const next = [...prev]
      const item = next[dragIndex]
      next.splice(dragIndex, 1)
      next.splice(index, 0, item)
      setDragIndex(index)
      return next
    })
  }

  const handleDragEnd = () => {
    if (dragNode.current) dragNode.current.style.opacity = '1'
    setDragIndex(null)
    setDragOverIndex(null)
    dragNode.current = null
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  // Touch handlers — use document.elementFromPoint to find drop target during scroll-less drag
  const handleTouchStart = useCallback((index: number) => {
    touchDragIndex.current  = index
    touchLastTarget.current = index
    setDragIndex(index)
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault() // prevent page scroll while dragging
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const row = el?.closest('[data-team-index]') as HTMLElement | null
    if (!row) return
    const newIndex = parseInt(row.getAttribute('data-team-index') || '-1')
    if (newIndex < 0 || newIndex === touchLastTarget.current) return
    touchLastTarget.current = newIndex
    setDragOverIndex(newIndex)
    setLadder((prev) => {
      const next = [...prev]
      const from = touchDragIndex.current!
      const item = next.splice(from, 1)[0]
      next.splice(newIndex, 0, item)
      touchDragIndex.current = newIndex
      return next
    })
  }, [])

  const handleTouchEnd = useCallback(() => {
    touchDragIndex.current  = null
    touchLastTarget.current = null
    setDragIndex(null)
    setDragOverIndex(null)
  }, [])

  const moveTeam = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
    if (toIndex < 0 || toIndex >= ladder.length) return
    setLadder((prev) => {
      const next = [...prev]
      ;[next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]]
      return next
    })
  }

  if (isLoadingPrediction) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-400 mx-auto mb-4" />
          <p className="text-slate-400">Loading your prediction…</p>
        </div>
      </div>
    )
  }

  // Check if we have scored data
  const scoredTeams: any[] = predictionData?.teams ?? []
  const hasActualData = scoredTeams.some((t: any) => t.actualPosition !== null)
  const totalScore: number | null = predictionData?.totalScore ?? null
  const ladderRound: number | null = predictionData?.ladderRound ?? null
  const ladderUpdatedAt: string | null = predictionData?.ladderUpdatedAt ?? null

  // When locked, always show score/read-only view (even without actual data yet)
  const isScoreView = competitionLocked || (viewMode === 'score' && hasActualData)

  // Build a lookup from teamName → scored data (for score view)
  const scoreMap: Record<string, any> = {}
  if (hasActualData) {
    scoredTeams.forEach((t: any) => { scoreMap[t.teamName] = t })
  }

  const formatUpdatedAt = (dt: string | null) => {
    if (!dt) return ''
    return new Date(dt).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  }

  const formatCutoff = (date: Date) =>
    date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Dark header */}
      <div className="bg-slate-900 px-4 pt-6 pb-8">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-5 text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </button>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-white">{seasonYear} AFL Ladder Prediction</h1>
              <p className="text-slate-400 mt-1 text-sm">
                {competitionLocked
                  ? '🔒 Competition locked · Read-only view'
                  : isScoreView
                  ? `Live scores — Round ${ladderRound ?? '?'} · Updated ${formatUpdatedAt(ladderUpdatedAt)}`
                  : `Drag teams into your predicted finishing order · Cutoff ${formatCutoff(cutoffAt)}`}
              </p>
            </div>

            {/* View toggle — hidden when locked; only shown when we have actual data */}
            {!competitionLocked && hasActualData && (
              <div className="flex bg-slate-800 rounded-xl p-1 flex-shrink-0">
                <button
                  onClick={() => setViewMode('score')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    isScoreView ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Scores
                </button>
                <button
                  onClick={() => setViewMode('edit')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    !isScoreView ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Edit
                </button>
              </div>
            )}
          </div>

          {/* Zone legend */}
          <div className="flex gap-4 mt-4 flex-wrap">
            {zoneConfig.map((z) => (
              <div key={z.label} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${z.dot}`} />
                <span className="text-xs font-semibold text-slate-300">{z.label}</span>
                <span className="text-xs text-slate-500">{z.positions}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-12">
        {/* Score summary banner */}
        {isScoreView && (
          <div className="mt-4 mb-2 bg-white rounded-2xl border border-slate-200 px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Your current score</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-3xl font-black text-slate-900">
                  {totalScore !== null ? totalScore : '—'}
                </span>
                <span className="text-sm text-slate-400 font-medium">points</span>
                {totalScore !== null && (
                  <span className="text-xs text-slate-400">(lower is better)</span>
                )}
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-center">
                <p className="text-lg font-black text-emerald-600">
                  {scoredTeams.filter((t: any) => t.diff === 0).length}
                </p>
                <p className="text-xs text-slate-400">perfect</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-emerald-600">
                  {scoredTeams.filter((t: any) => t.diff !== null && t.diff < 0).length}
                </p>
                <p className="text-xs text-slate-400">↑ over</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-red-500">
                  {scoredTeams.filter((t: any) => t.diff !== null && t.diff > 0).length}
                </p>
                <p className="text-xs text-slate-400">↓ under</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* ── SCORE VIEW (or locked read-only view) ── */}
        {isScoreView ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mt-3">
            {/* Column headers */}
            <div className="grid grid-cols-[2.5rem_1fr_2.5rem_3rem_2.5rem] items-center px-4 py-2.5 bg-slate-900 text-slate-400 text-xs font-semibold uppercase tracking-widest">
              <div className="text-center">My</div>
              <div className="pl-2">Team</div>
              <div className="text-center">Now</div>
              <div className="text-center">Move</div>
              <div className="text-center">Pts</div>
            </div>

            <div className="divide-y divide-slate-50">
              {(hasActualData ? scoredTeams.slice().sort((a: any, b: any) => a.position - b.position) : ladder.map((team, i) => ({
                teamName: team.name,
                position: i + 1,
                actualPosition: null,
                diff: null,
                points: null,
              }))).map((t: any) => {
                  const meta = getTeamMeta(t.teamName)
                  const zone = getZone(t.position - 1)
                  const pts = t.points ?? null

                  return (
                    <div
                      key={t.teamName}
                      className={`grid grid-cols-[2.5rem_1fr_2.5rem_3rem_2.5rem] items-center px-4 py-2.5 ${
                        pts === 0 ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      {/* My predicted position */}
                      <div className="flex justify-center">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-black ${posBadgeClass(t.position - 1)}`}>
                          {t.position}
                        </span>
                      </div>

                      {/* Team */}
                      <div className="flex items-center gap-2.5 pl-2 min-w-0">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shadow-sm flex-shrink-0"
                          style={{
                            backgroundColor: meta.primaryColor,
                            color: meta.textColor,
                            border: meta.primaryColor === '#000000' ? '1px solid #333' : 'none',
                          }}
                        >
                          {meta.shortName}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 text-sm leading-tight truncate">{t.teamName}</p>
                          <p className={`text-xs ${zone.text}`}>{zone.label}</p>
                        </div>
                      </div>

                      {/* Actual position */}
                      <div className="flex justify-center">
                        <ActualPosBadge pos={t.actualPosition} />
                      </div>

                      {/* Diff arrow */}
                      <div className="flex justify-center">
                        <DiffBadge diff={t.diff} points={pts} />
                      </div>

                      {/* Points */}
                      <div className="flex justify-center">
                        <span className={`text-sm font-black ${
                          pts === 0 ? 'text-emerald-500' :
                          pts !== null && pts <= 2 ? 'text-emerald-600' :
                          pts !== null && pts <= 4 ? 'text-amber-500' :
                          'text-red-500'
                        }`}>
                          {pts !== null ? pts : '—'}
                        </span>
                      </div>
                    </div>
                  )
                })}
            </div>

            {/* Footer key */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-5 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7-7" />
                </svg>
                Team finished higher than predicted
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7 7" />
                </svg>
                Team finished lower than predicted
              </span>
            </div>
          </div>
        ) : (
          /* ── EDIT VIEW ── */
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mt-3">
            <div className="flex items-center px-4 py-2.5 bg-slate-900 text-slate-400 text-xs font-semibold uppercase tracking-widest">
              <div className="w-10 text-center">#</div>
              <div className="flex-1 pl-3">Team</div>
              <div className="w-16 text-center">Move</div>
            </div>

            <div>
              {ladder.map((team, index) => {
                const zone = getZone(index)
                const isTop4 = index < 4
                const isFinals = index >= 4 && index < 10

                return (
                  <div
                    key={team.name}
                    data-team-index={index}
                    draggable
                    onDragStart={(e) => handleDragStart(index, e)}
                    onDragEnter={() => handleDragEnter(index)}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    onTouchStart={() => handleTouchStart(index)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className={`
                      relative flex items-center px-4 py-2.5 cursor-grab active:cursor-grabbing
                      transition-colors duration-100 select-none border-b border-slate-50 last:border-b-0
                      ${dragOverIndex === index ? 'bg-emerald-50 border-l-4 border-emerald-500' : 'hover:bg-slate-50/80'}
                    `}
                  >
                    {/* Zone left accent bar */}
                    <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${isTop4 ? 'bg-emerald-500' : isFinals ? 'bg-blue-500' : 'bg-transparent'}`} />

                    {/* Position badge */}
                    <div className="w-10 flex justify-center">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-black ${posBadgeClass(index)}`}>
                        {index + 1}
                      </span>
                    </div>

                    {/* Team badge + name */}
                    <div className="flex-1 flex items-center gap-3 pl-2">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shadow-sm flex-shrink-0"
                        style={{
                          backgroundColor: team.primaryColor,
                          color: team.textColor,
                          border: team.primaryColor === '#000000' ? '1px solid #222' :
                                  team.primaryColor === '#FFFFFF' ? '1px solid #ddd' : 'none',
                        }}
                      >
                        {team.shortName}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{team.name}</p>
                        <p className={`text-xs ${zone.text}`}>{zone.label}</p>
                      </div>
                    </div>

                    {/* Drag handle + up/down buttons */}
                    <div className="flex items-center gap-1">
                      <div className="text-slate-300 px-1 cursor-grab">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
                        </svg>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); moveTeam(index, 'up') }}
                        disabled={index === 0}
                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-20 disabled:cursor-not-allowed text-slate-600 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); moveTeam(index, 'down') }}
                        disabled={index === ladder.length - 1}
                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-20 disabled:cursor-not-allowed text-slate-600 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Submit / navigation buttons — hidden when locked */}
        {!isScoreView && !competitionLocked && (
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-white font-black rounded-xl transition-colors shadow-lg text-base tracking-wide"
            >
              {submitMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </span>
              ) : 'Save Prediction'}
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {isScoreView && (
          <div className="mt-4 flex gap-3">
            {/* "Edit My Prediction" only shown when competition is open */}
            {!competitionLocked && (
              <button
                onClick={() => setViewMode('edit')}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors"
              >
                Edit My Prediction
              </button>
            )}
            <button
              onClick={() => navigate('/dashboard')}
              className={`py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition-colors ${competitionLocked ? 'flex-1' : 'px-6'}`}
            >
              Dashboard
            </button>
          </div>
        )}

        <div className="mt-4 bg-slate-900 rounded-xl p-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            {competitionLocked
              ? <>🔒 <span className="text-red-400 font-semibold">Competition is locked.</span> Submissions closed on {formatCutoff(cutoffAt)}. Scores update automatically as the AFL season progresses.</>
              : isScoreView
              ? <>Scores update automatically when the AFL ladder is synced. <span className="text-emerald-400 font-semibold">Lower total = better prediction.</span> Each team scored as |predicted − actual| position.</>
              : <><span className="text-slate-300 font-semibold">Drag</span> teams to reorder, or use the arrow buttons. You can update your prediction anytime before the <span className="text-emerald-400 font-semibold">{formatCutoff(cutoffAt)} cutoff</span>.</>
            }
          </p>
        </div>
      </div>
    </div>
  )
}
