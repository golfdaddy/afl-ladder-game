import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/auth'

interface EmailPreferenceGroup {
  id: number
  name: string
  description: string | null
  subscribedGroupIds: number[]
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)

  const [mailingPrefDraft, setMailingPrefDraft] = useState<number[]>([])
  const [mailingPrefStatus, setMailingPrefStatus] = useState<string | null>(null)

  const { data: emailPreferences, isLoading: emailPreferencesLoading } = useQuery({
    queryKey: ['email-preferences'],
    queryFn: async () => {
      const response = await api.get('/auth/email-preferences')
      return response.data as { groups: EmailPreferenceGroup[]; subscribedGroupIds: number[] }
    },
  })

  useEffect(() => {
    if (!emailPreferences) return
    setMailingPrefDraft(emailPreferences.subscribedGroupIds || [])
  }, [emailPreferences])

  const updateEmailPreferencesMutation = useMutation({
    mutationFn: (groupIds: number[]) =>
      api.put('/auth/email-preferences', { groupIds }),
    onSuccess: (response) => {
      queryClient.setQueryData(['email-preferences'], response.data)
      setMailingPrefStatus('✅ Email preferences saved')
      setTimeout(() => setMailingPrefStatus(null), 4000)
    },
    onError: (err: any) => {
      setMailingPrefStatus(`❌ ${err.response?.data?.error || 'Failed to save preferences'}`)
    },
  })

  const mailingGroups = emailPreferences?.groups || []
  const mailingSelection = new Set(mailingPrefDraft)

  const setMailingListPreference = (groupId: number, subscribe: boolean) => {
    setMailingPrefStatus(null)
    setMailingPrefDraft((prev) =>
      subscribe ? [...prev.filter((id) => id !== groupId), groupId] : prev.filter((id) => id !== groupId)
    )
  }

  const saveMailingPreferences = () => {
    setMailingPrefStatus(null)
    updateEmailPreferencesMutation.mutate(mailingPrefDraft)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-medium mb-6 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to dashboard
          </button>
          <h1 className="text-2xl font-black text-white">Settings</h1>
          {user && <p className="text-slate-400 text-sm mt-1">{user.email}</p>}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8">
        {/* Mailing Lists */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Mailing Lists</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Choose which updates you receive. Admin campaigns can target any list and send once per user.
              </p>
            </div>
            <button
              onClick={saveMailingPreferences}
              disabled={updateEmailPreferencesMutation.isPending || emailPreferencesLoading}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {updateEmailPreferencesMutation.isPending ? 'Saving…' : 'Save Preferences'}
            </button>
          </div>

          {emailPreferencesLoading ? (
            <div className="px-6 py-8 text-center text-slate-400 text-sm">Loading mailing lists…</div>
          ) : mailingGroups.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-400 text-sm">No mailing lists available.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {mailingGroups.map((group) => {
                const subscribed = mailingSelection.has(group.id)
                return (
                  <div key={group.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{group.name}</p>
                      {group.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{group.description}</p>
                      )}
                    </div>
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden flex-shrink-0">
                      <label className={`px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${subscribed ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                        <input
                          type="radio"
                          name={`mailing-group-${group.id}`}
                          className="sr-only"
                          checked={subscribed}
                          onChange={() => setMailingListPreference(group.id, true)}
                        />
                        Subscribed
                      </label>
                      <label className={`px-3 py-1.5 text-xs font-semibold cursor-pointer border-l border-slate-200 transition-colors ${!subscribed ? 'bg-slate-100 text-slate-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                        <input
                          type="radio"
                          name={`mailing-group-${group.id}`}
                          className="sr-only"
                          checked={!subscribed}
                          onChange={() => setMailingListPreference(group.id, false)}
                        />
                        Off
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {mailingPrefStatus && (
            <div className={`mx-6 mb-4 px-4 py-3 rounded-xl text-sm font-medium ${mailingPrefStatus.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {mailingPrefStatus}
            </div>
          )}
        </div>

        {/* Account info */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Account</h2>
          </div>
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">{user?.displayName}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-500 capitalize">
              {user?.role || 'user'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
