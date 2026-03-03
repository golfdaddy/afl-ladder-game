import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

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
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)

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
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE}/admin/users`, token!)
      if (!res.ok) throw new Error('Failed to fetch users')
      return res.json() as Promise<{ users: AdminUser[] }>
    },
    enabled: !!token && isAdmin,
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
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  async function handleSyncLadder() {
    setSyncLoading(true)
    setSyncStatus(null)
    try {
      const res = await fetchWithAuth(`${API_BASE}/admin/sync-ladder`, token!, {
        method: 'POST',
        body: JSON.stringify({ seasonId: 1 }),
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

  const users = data?.users || []
  const adminCount = users.filter((u) => u.role === 'admin').length
  const userCount = users.filter((u) => u.role === 'user').length

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
          </div>
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
