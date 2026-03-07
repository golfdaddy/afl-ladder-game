import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { FEATURE_FANTASY7_ENABLED } from '../config'
import { useCurrentSeason } from '../hooks/useCurrentSeason'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

interface AdminUser {
  id: number
  email: string
  displayName: string
  emailVerified: boolean
  role: 'user' | 'admin'
  createdAt: string
  predictionCount: number
  competitionCount: number
}

interface EmailGroup {
  id: number
  name: string
  description: string | null
}

function fetchWithAuth(url: string, token: string, opts?: RequestInit) {
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts?.headers || {}),
    },
  })
}

export default function AdminPage() {
  const navigate = useNavigate()
  const { user, token, isAdmin } = useAuthStore()
  const queryClient = useQueryClient()
  const { seasonId } = useCurrentSeason()
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [fantasyRoundId, setFantasyRoundId] = useState('1')
  const [fantasyLoading, setFantasyLoading] = useState(false)
  const [fantasyStatus, setFantasyStatus] = useState<string | null>(null)

  // Redirect if not admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Admin Access Required</h1>
          <p className="text-slate-500 mb-6">You don't have permission to view this page.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-xl font-semibold transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users-with-groups'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE}/admin/users-with-groups`, token!)
      if (!res.ok) throw new Error('Failed to fetch users')
      return res.json() as Promise<{
        users: AdminUser[]
        groups: EmailGroup[]
        memberships: Record<number, number[]>
      }>
    },
    enabled: !!token && isAdmin,
  })

  const { data: fantasyHealth } = useQuery({
    queryKey: ['admin-fantasy-health'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE}/admin/fantasy/health`, token!)
      if (!res.ok) throw new Error('Failed to fetch fantasy health')
      return res.json() as Promise<{
        featureEnabled: boolean
        provider: { provider: string; ok: boolean; details?: string }
        counts: { rounds: number; players: number; competitions: number }
      }>
    },
    enabled: !!token && isAdmin && FEATURE_FANTASY7_ENABLED,
    retry: false,
  })

  const setRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: 'user' | 'admin' }) => {
      const res = await fetchWithAuth(`${API_BASE}/admin/users/${userId}/role`, token!, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error('Failed to update role')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users-with-groups'] })
    },
  })

  const toggleGroupMutation = useMutation({
    mutationFn: async ({ userId, groupId, add }: { userId: number; groupId: number; add: boolean }) => {
      const method = add ? 'POST' : 'DELETE'
      const res = await fetchWithAuth(
        `${API_BASE}/admin/users/${userId}/email-groups/${groupId}`,
        token!,
        { method }
      )
      if (!res.ok) throw new Error('Failed to update group')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users-with-groups'] })
    },
  })

  async function handleSyncLadder() {
    setSyncLoading(true)
    setSyncStatus(null)
    try {
      const res = await fetchWithAuth(`${API_BASE}/admin/sync-ladder`, token!, {
        method: 'POST',
        body: JSON.stringify({ seasonId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      setSyncStatus(`✅ ${data.message}`)
    } catch (err: any) {
      setSyncStatus(`❌ ${err.message}`)
    } finally {
      setSyncLoading(false)
    }
  }

  async function handleExportPredictions() {
    setExportLoading(true)
    try {
      const res = await fetchWithAuth(`${API_BASE}/admin/export/predictions?format=csv&seasonId=${seasonId}`, token!)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `predictions-season${seasonId}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(`Export failed: ${err.message}`)
    } finally {
      setExportLoading(false)
    }
  }

  async function runFantasyAction(action: 'sync' | 'price' | 'scores' | 'recompute') {
    const parsedRoundId = Number(fantasyRoundId)
    if (!Number.isFinite(parsedRoundId) || parsedRoundId <= 0) {
      setFantasyStatus('❌ Enter a valid round ID')
      return
    }

    setFantasyLoading(true)
    setFantasyStatus(null)
    try {
      const res = await fetchWithAuth(`${API_BASE}/admin/fantasy/${action}/round/${parsedRoundId}`, token!, {
        method: 'POST',
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `Fantasy ${action} failed`)
      setFantasyStatus(`✅ ${body.message || `Fantasy ${action} completed`}`)
      queryClient.invalidateQueries({ queryKey: ['admin-fantasy-health'] })
    } catch (err: any) {
      setFantasyStatus(`❌ ${err.message}`)
    } finally {
      setFantasyLoading(false)
    }
  }

  const users       = data?.users       || []
  const groups      = data?.groups      || []
  const memberships = data?.memberships || {}
  const adminCount  = users.filter((u) => u.role === 'admin').length
  const userCount   = users.filter((u) => u.role === 'user').length

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="text-slate-400 hover:text-white transition-colors mr-2"
              >
                ←
              </button>
              <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-xl">
                🛡️
              </div>
              <div>
                <h1 className="text-xl font-bold">Admin Dashboard</h1>
                <p className="text-slate-400 text-sm">AFL Ladder Game</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-slate-400 text-sm">Logged in as</p>
              <p className="font-semibold text-emerald-400">{user?.displayName}</p>
            </div>
          </div>

          {/* Stats strip */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="bg-slate-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{users.length}</div>
              <div className="text-slate-400 text-xs mt-1">Total Users</div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{adminCount}</div>
              <div className="text-slate-400 text-xs mt-1">Admins</div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-amber-400">{userCount}</div>
              <div className="text-slate-400 text-xs mt-1">Regular Users</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Admin Actions */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">⚙️ Admin Actions</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSyncLadder}
              disabled={syncLoading}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2"
            >
              {syncLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Syncing…
                </>
              ) : (
                '🔄 Sync Ladder from Squiggle'
              )}
            </button>
            <button
              onClick={handleExportPredictions}
              disabled={exportLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2"
            >
              {exportLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Exporting…
                </>
              ) : (
                '📥 Export All Submissions (CSV)'
              )}
            </button>
          </div>
          {FEATURE_FANTASY7_ENABLED && (
            <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Fantasy 7 Operations</h3>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={fantasyRoundId}
                  onChange={(e) => setFantasyRoundId(e.target.value)}
                  className="w-28 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm"
                  placeholder="Round ID"
                />
                <button
                  onClick={() => runFantasyAction('sync')}
                  disabled={fantasyLoading}
                  className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
                >
                  Sync
                </button>
                <button
                  onClick={() => runFantasyAction('price')}
                  disabled={fantasyLoading}
                  className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
                >
                  Price
                </button>
                <button
                  onClick={() => runFantasyAction('scores')}
                  disabled={fantasyLoading}
                  className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
                >
                  Scores
                </button>
                <button
                  onClick={() => runFantasyAction('recompute')}
                  disabled={fantasyLoading}
                  className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
                >
                  Recompute
                </button>
              </div>
              {fantasyHealth && (
                <p className="mt-3 text-xs text-slate-500">
                  Provider: <span className="font-semibold text-slate-700">{fantasyHealth.provider.provider}</span>
                  {' • '}Rounds: {fantasyHealth.counts.rounds}
                  {' • '}Players: {fantasyHealth.counts.players}
                  {' • '}Competitions: {fantasyHealth.counts.competitions}
                </p>
              )}
              {fantasyStatus && (
                <p className={`mt-2 text-sm font-medium ${fantasyStatus.startsWith('✅') ? 'text-emerald-600' : 'text-red-500'}`}>
                  {fantasyStatus}
                </p>
              )}
            </div>
          )}
          {syncStatus && (
            <p className={`mt-3 text-sm font-medium ${syncStatus.startsWith('✅') ? 'text-emerald-600' : 'text-red-500'}`}>
              {syncStatus}
            </p>
          )}
        </div>

        {/* User Management */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">👥 User Management</h2>
            <span className="text-sm text-slate-500">{users.length} users</span>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
              <p className="mt-3 text-slate-500 text-sm">Loading users…</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">Failed to load users.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stats</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Joined</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email Groups</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => {
                    const isCurrentUser = u.id === user?.id
                    const isPending = setRoleMutation.isPending && (setRoleMutation.variables as any)?.userId === u.id

                    return (
                      <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${isCurrentUser ? 'bg-emerald-50' : ''}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0
                              ${u.role === 'admin' ? 'bg-emerald-500' : 'bg-slate-400'}`}>
                              {u.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800 flex items-center gap-2">
                                {u.displayName}
                                {isCurrentUser && (
                                  <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">You</span>
                                )}
                              </div>
                              <div className="text-sm text-slate-500">{u.email}</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                {u.emailVerified ? (
                                  <span className="text-xs text-emerald-600">✓ Verified</span>
                                ) : (
                                  <span className="text-xs text-amber-500">⚠ Unverified</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-slate-600">
                            <span className="font-medium">{u.predictionCount}</span>
                            <span className="text-slate-400"> prediction{u.predictionCount !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="text-sm text-slate-600">
                            <span className="font-medium">{u.competitionCount}</span>
                            <span className="text-slate-400"> competition{u.competitionCount !== 1 ? 's' : ''}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {new Date(u.createdAt).toLocaleDateString('en-AU', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        {/* Email groups */}
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {groups.map((g) => {
                              const isMember = (memberships[u.id] || []).includes(g.id)
                              const isToggling = toggleGroupMutation.isPending &&
                                (toggleGroupMutation.variables as any)?.userId === u.id &&
                                (toggleGroupMutation.variables as any)?.groupId === g.id
                              return (
                                <button
                                  key={g.id}
                                  title={g.description || g.name}
                                  disabled={isToggling}
                                  onClick={() => toggleGroupMutation.mutate({ userId: u.id, groupId: g.id, add: !isMember })}
                                  className={`px-2 py-0.5 rounded-full text-xs font-semibold border transition-colors ${
                                    isMember
                                      ? 'bg-blue-100 border-blue-300 text-blue-700 hover:bg-red-50 hover:border-red-300 hover:text-red-600'
                                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600'
                                  } disabled:opacity-50`}
                                >
                                  {isMember ? '✓ ' : '+ '}{g.name}
                                </button>
                              )
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <select
                              value={u.role}
                              disabled={isPending || isCurrentUser}
                              onChange={(e) =>
                                setRoleMutation.mutate({ userId: u.id, role: e.target.value as 'user' | 'admin' })
                              }
                              className={`text-sm border rounded-lg px-3 py-1.5 font-medium transition-colors cursor-pointer
                                ${u.role === 'admin'
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-white text-slate-700'}
                                disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>
                            {isPending && (
                              <svg className="animate-spin h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            )}
                            {isCurrentUser && (
                              <span className="text-xs text-slate-400 italic">your account</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
