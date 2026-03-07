import { useEffect, useState } from 'react'
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

interface EmailTemplate {
  id: number
  name: string
  description: string | null
  subjectTemplate: string
  htmlTemplate: string
  createdBy: number | null
  createdAt: string
  updatedAt: string
  tokens: string[]
}

const MONTHS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
]

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
  const { seasonId, seasonYear, cutoffAt } = useCurrentSeason()
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [fantasyRoundId, setFantasyRoundId] = useState('1')
  const [fantasyLoading, setFantasyLoading] = useState(false)
  const [fantasyStatus, setFantasyStatus] = useState<string | null>(null)
  const [cutoffDay, setCutoffDay] = useState<string>('1')
  const [cutoffMonth, setCutoffMonth] = useState<string>('1')
  const [cutoffYear, setCutoffYear] = useState<string>(String(seasonYear))
  const [cutoffStatus, setCutoffStatus] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateHtml, setTemplateHtml] = useState('')
  const [templateStatus, setTemplateStatus] = useState<string | null>(null)
  const [previewStatus, setPreviewStatus] = useState<string | null>(null)
  const [previewSubject, setPreviewSubject] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewSampleJson, setPreviewSampleJson] = useState(
    '{\n  "roundNo": 1,\n  "seasonYear": 2026,\n  "roundSummary": "Round summary goes here"\n}'
  )
  const [audienceMode, setAudienceMode] = useState<'all' | 'groups' | 'test'>('all')
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([])
  const [testEmail, setTestEmail] = useState('')
  const [campaignSeasonId, setCampaignSeasonId] = useState<string>(String(seasonId))
  const [campaignRoundNo, setCampaignRoundNo] = useState<string>('')
  const [campaignDryRun, setCampaignDryRun] = useState(true)
  const [campaignCustomDataJson, setCampaignCustomDataJson] = useState('{}')
  const [campaignStatus, setCampaignStatus] = useState<string | null>(null)

  useEffect(() => {
    setCutoffDay(String(cutoffAt.getDate()))
    setCutoffMonth(String(cutoffAt.getMonth() + 1))
    setCutoffYear(String(cutoffAt.getFullYear()))
  }, [cutoffAt.getTime()])

  useEffect(() => {
    setCampaignSeasonId(String(seasonId))
  }, [seasonId])

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

  const { data: templateData, isLoading: templatesLoading, error: templatesError } = useQuery({
    queryKey: ['admin-email-templates'],
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_BASE}/admin/email/templates`, token!)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to fetch templates')
      return body as { templates: EmailTemplate[] }
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

  const updateCutoffMutation = useMutation({
    mutationFn: async (nextCutoffDate: string) => {
      const res = await fetchWithAuth(`${API_BASE}/admin/seasons/${seasonId}/cutoff`, token!, {
        method: 'PUT',
        body: JSON.stringify({ cutoffDate: nextCutoffDate }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to update cutoff date')
      return body
    },
    onSuccess: async (body) => {
      const updated = body?.season?.cutoffDate ? new Date(body.season.cutoffDate) : null
      const formatted = updated
        ? updated.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
        : body?.season?.cutoffDate
      setCutoffStatus(`✅ Lockout date updated${formatted ? ` to ${formatted}` : ''}`)
      await queryClient.invalidateQueries({ queryKey: ['current-season'] })
    },
    onError: (err: any) => {
      setCutoffStatus(`❌ ${err.message}`)
    },
  })

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: templateName.trim(),
        description: templateDescription.trim(),
        subjectTemplate: templateSubject,
        htmlTemplate: templateHtml,
      }
      const url = selectedTemplateId
        ? `${API_BASE}/admin/email/templates/${selectedTemplateId}`
        : `${API_BASE}/admin/email/templates`
      const method = selectedTemplateId ? 'PUT' : 'POST'
      const res = await fetchWithAuth(url, token!, {
        method,
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to save template')
      return body as { template: EmailTemplate }
    },
    onSuccess: async (body) => {
      setSelectedTemplateId(body.template.id)
      setTemplateStatus(`✅ Template "${body.template.name}" saved`)
      await queryClient.invalidateQueries({ queryKey: ['admin-email-templates'] })
    },
    onError: (err: any) => {
      setTemplateStatus(`❌ ${err.message}`)
    },
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetchWithAuth(`${API_BASE}/admin/email/templates/${id}`, token!, {
        method: 'DELETE',
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to delete template')
      return body
    },
    onSuccess: async () => {
      setSelectedTemplateId(null)
      setTemplateName('')
      setTemplateDescription('')
      setTemplateSubject('')
      setTemplateHtml('')
      setTemplateStatus('✅ Template deleted')
      setPreviewSubject('')
      setPreviewHtml('')
      await queryClient.invalidateQueries({ queryKey: ['admin-email-templates'] })
    },
    onError: (err: any) => {
      setTemplateStatus(`❌ ${err.message}`)
    },
  })

  const previewTemplateMutation = useMutation({
    mutationFn: async (sampleData: Record<string, unknown>) => {
      const res = await fetchWithAuth(`${API_BASE}/admin/email/templates/preview`, token!, {
        method: 'POST',
        body: JSON.stringify({
          subjectTemplate: templateSubject,
          htmlTemplate: templateHtml,
          sampleData,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to render preview')
      return body as { preview: { subject: string; html: string }; tokens: string[] }
    },
    onSuccess: (body) => {
      setPreviewSubject(body.preview.subject)
      setPreviewHtml(body.preview.html)
      setPreviewStatus('✅ Preview updated')
    },
    onError: (err: any) => {
      setPreviewStatus(`❌ ${err.message}`)
    },
  })

  const sendCampaignMutation = useMutation({
    mutationFn: async ({
      templateId,
      customData,
    }: {
      templateId: number
      customData: Record<string, unknown>
    }) => {
      const payload: Record<string, unknown> = {
        seasonId: campaignSeasonId ? Number(campaignSeasonId) : null,
        roundNo: campaignRoundNo ? Number(campaignRoundNo) : null,
        dryRun: campaignDryRun,
        customData,
      }
      if (audienceMode === 'groups') payload.groupIds = selectedGroupIds
      if (audienceMode === 'test') payload.testEmail = testEmail.trim()

      const res = await fetchWithAuth(`${API_BASE}/admin/email/templates/${templateId}/send`, token!, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to send campaign')
      return body as {
        message: string
        recipientCount: number
        sentCount: number
        failedCount: number
      }
    },
    onSuccess: (body) => {
      setCampaignStatus(
        `✅ ${body.message} (recipients: ${body.recipientCount}, sent: ${body.sentCount}, failed: ${body.failedCount})`
      )
    },
    onError: (err: any) => {
      setCampaignStatus(`❌ ${err.message}`)
    },
  })

  const toIsoDate = (year: number, month: number, day: number) => {
    const yyyy = String(year)
    const mm = String(month).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  function resetTemplateForm() {
    setSelectedTemplateId(null)
    setTemplateName('')
    setTemplateDescription('')
    setTemplateSubject('')
    setTemplateHtml('')
    setTemplateStatus(null)
    setPreviewStatus(null)
    setPreviewSubject('')
    setPreviewHtml('')
  }

  function parseJsonObject(raw: string, label: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(raw || '{}')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${label} must be a JSON object`)
      }
      return parsed
    } catch (error: any) {
      const message = error?.message || `${label} JSON is invalid`
      if (label === 'Preview sample data') {
        setPreviewStatus(`❌ ${message}`)
      } else {
        setCampaignStatus(`❌ ${message}`)
      }
      return null
    }
  }

  function handlePreviewTemplate() {
    setPreviewStatus(null)
    const parsed = parseJsonObject(previewSampleJson, 'Preview sample data')
    if (!parsed) return
    previewTemplateMutation.mutate(parsed)
  }

  function handleSaveTemplate() {
    setTemplateStatus(null)
    if (!templateName.trim()) {
      setTemplateStatus('❌ Template name is required')
      return
    }
    if (!templateSubject.trim()) {
      setTemplateStatus('❌ Subject template is required')
      return
    }
    if (!templateHtml.trim()) {
      setTemplateStatus('❌ HTML template is required')
      return
    }
    saveTemplateMutation.mutate()
  }

  function handleDeleteTemplate() {
    if (!selectedTemplateId) return
    const ok = window.confirm('Delete this template permanently?')
    if (!ok) return
    deleteTemplateMutation.mutate(selectedTemplateId)
  }

  function handleSendCampaign() {
    setCampaignStatus(null)

    if (!selectedTemplateId) {
      setCampaignStatus('❌ Save or select a template first')
      return
    }

    if (audienceMode === 'groups' && selectedGroupIds.length === 0) {
      setCampaignStatus('❌ Select at least one email group')
      return
    }

    if (audienceMode === 'test' && !testEmail.trim()) {
      setCampaignStatus('❌ Enter a test email address')
      return
    }

    const customData = parseJsonObject(campaignCustomDataJson, 'Campaign custom data')
    if (!customData) return

    sendCampaignMutation.mutate({
      templateId: selectedTemplateId,
      customData,
    })
  }

  function toggleCampaignGroup(groupId: number) {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    )
  }

  function handleUpdateCutoffDate() {
    const year = Number(cutoffYear)
    const month = Number(cutoffMonth)
    const day = Number(cutoffDay)

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      setCutoffStatus('❌ Please select a valid day, month, and year')
      return
    }

    const daysInMonth = new Date(year, month, 0).getDate()
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
      setCutoffStatus('❌ Please select a valid calendar date')
      return
    }

    setCutoffStatus(null)
    updateCutoffMutation.mutate(toIsoDate(year, month, day))
  }

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

  const templates = templateData?.templates || []
  const activeTemplate = templates.find((template) => template.id === selectedTemplateId) || null

  useEffect(() => {
    if (selectedTemplateId && !activeTemplate) {
      setSelectedTemplateId(null)
      return
    }
    if (!selectedTemplateId || !activeTemplate) return

    setTemplateName(activeTemplate.name)
    setTemplateDescription(activeTemplate.description || '')
    setTemplateSubject(activeTemplate.subjectTemplate)
    setTemplateHtml(activeTemplate.htmlTemplate)
  }, [selectedTemplateId, activeTemplate?.id])

  useEffect(() => {
    if (audienceMode !== 'groups') setSelectedGroupIds([])
  }, [audienceMode])

  const users       = data?.users       || []
  const groups      = data?.groups      || []
  const memberships = data?.memberships || {}
  const adminCount  = users.filter((u) => u.role === 'admin').length
  const userCount   = users.filter((u) => u.role === 'user').length
  const selectedYear = Number(cutoffYear)
  const selectedMonth = Number(cutoffMonth)
  const dayCount = Number.isInteger(selectedYear) && Number.isInteger(selectedMonth)
    ? new Date(selectedYear, selectedMonth, 0).getDate()
    : 31
  const dayOptions = Array.from({ length: dayCount }, (_, i) => i + 1)

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
                `🔄 Sync Ladder from Squiggle (${seasonYear})`
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
                `📥 Export All Submissions (${seasonYear})`
              )}
            </button>
          </div>
          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-700 mb-1">Prediction Lockout Date</h3>
            <p className="text-xs text-slate-500 mb-3">
              Current cutoff: {cutoffAt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={cutoffDay}
                onChange={(e) => setCutoffDay(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm"
              >
                {dayOptions.map((day) => (
                  <option key={day} value={String(day)}>{day}</option>
                ))}
              </select>
              <select
                value={cutoffMonth}
                onChange={(e) => setCutoffMonth(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm"
              >
                {MONTHS.map((month) => (
                  <option key={month.value} value={String(month.value)}>{month.label}</option>
                ))}
              </select>
              <select
                value={cutoffYear}
                onChange={(e) => setCutoffYear(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm"
              >
                {Array.from({ length: 5 }, (_, i) => seasonYear - 2 + i).map((year) => (
                  <option key={year} value={String(year)}>{year}</option>
                ))}
              </select>
              <button
                onClick={handleUpdateCutoffDate}
                disabled={updateCutoffMutation.isPending}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
              >
                {updateCutoffMutation.isPending ? 'Saving…' : 'Save Lockout Date'}
              </button>
            </div>
            {cutoffStatus && (
              <p className={`mt-2 text-sm font-medium ${cutoffStatus.startsWith('✅') ? 'text-emerald-600' : 'text-red-500'}`}>
                {cutoffStatus}
              </p>
            )}
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

        {/* Email Campaign Builder */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">✉️ Email Template Builder</h2>
              <p className="text-sm text-slate-500">
                Personalize with tokens like <code>{'{{displayName}}'}</code>, <code>{'{{seasonYear}}'}</code>, and <code>{'{{roundNo}}'}</code>.
              </p>
            </div>
            <button
              onClick={resetTemplateForm}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              + New Template
            </button>
          </div>

          {templatesError && (
            <p className="mt-3 text-sm text-red-500">Failed to load templates.</p>
          )}

          <div className="mt-5 grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-4 border border-slate-200 rounded-xl p-3 bg-slate-50">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Template Library</p>
              {templatesLoading ? (
                <p className="text-sm text-slate-500">Loading templates…</p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-slate-500">No templates yet.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-auto pr-1">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => {
                        setSelectedTemplateId(template.id)
                        setTemplateStatus(null)
                        setPreviewStatus(null)
                      }}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                        selectedTemplateId === template.id
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-800 truncate">{template.name}</p>
                      {template.description && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">{template.description}</p>
                      )}
                      <p className="text-[11px] text-slate-400 mt-1">
                        Updated {new Date(template.updatedAt).toLocaleDateString('en-AU')}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-8 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Template Name</label>
                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Round Recap"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
                  <input
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Weekly competition summary"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Subject Template</label>
                <input
                  value={templateSubject}
                  onChange={(e) => setTemplateSubject(e.target.value)}
                  placeholder="Round {{roundNo}} recap for {{displayName}}"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">HTML Template</label>
                <textarea
                  value={templateHtml}
                  onChange={(e) => setTemplateHtml(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-mono"
                  placeholder={'<h1>Hi {{displayName}}</h1><p>Your best score is {{bestScore}}</p>'}
                />
              </div>

              {activeTemplate && activeTemplate.tokens.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Detected Tokens</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeTemplate.tokens.map((tokenName) => (
                      <span key={tokenName} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                        {tokenName}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleSaveTemplate}
                  disabled={saveTemplateMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {saveTemplateMutation.isPending ? 'Saving…' : selectedTemplateId ? 'Update Template' : 'Save Template'}
                </button>
                <button
                  onClick={handleDeleteTemplate}
                  disabled={!selectedTemplateId || deleteTemplateMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-semibold disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
              {templateStatus && (
                <p className={`text-sm font-medium ${templateStatus.startsWith('✅') ? 'text-emerald-600' : 'text-red-500'}`}>
                  {templateStatus}
                </p>
              )}

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <p className="text-sm font-bold text-slate-700">Preview</p>
                <textarea
                  value={previewSampleJson}
                  onChange={(e) => setPreviewSampleJson(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono"
                />
                <button
                  onClick={handlePreviewTemplate}
                  disabled={previewTemplateMutation.isPending}
                  className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {previewTemplateMutation.isPending ? 'Rendering…' : 'Render Preview'}
                </button>
                {previewStatus && (
                  <p className={`text-sm font-medium ${previewStatus.startsWith('✅') ? 'text-emerald-600' : 'text-red-500'}`}>
                    {previewStatus}
                  </p>
                )}
                {previewSubject && (
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Preview Subject</p>
                    <p className="text-sm font-semibold text-slate-800 mt-1">{previewSubject}</p>
                  </div>
                )}
                {previewHtml && (
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Preview Body</p>
                    <div className="max-h-64 overflow-auto" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <p className="text-sm font-bold text-slate-700">Send Campaign</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setAudienceMode('all')}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                      audienceMode === 'all'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    All users
                  </button>
                  <button
                    onClick={() => setAudienceMode('groups')}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                      audienceMode === 'groups'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    Selected groups
                  </button>
                  <button
                    onClick={() => setAudienceMode('test')}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                      audienceMode === 'test'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    Test email
                  </button>
                </div>

                {audienceMode === 'groups' && (
                  <div className="flex flex-wrap gap-1.5">
                    {groups.map((group) => {
                      const selected = selectedGroupIds.includes(group.id)
                      return (
                        <button
                          key={group.id}
                          onClick={() => toggleCampaignGroup(group.id)}
                          className={`px-2 py-1 rounded-full border text-xs font-semibold ${
                            selected
                              ? 'bg-blue-100 border-blue-300 text-blue-700'
                              : 'bg-white border-slate-200 text-slate-500'
                          }`}
                        >
                          {selected ? '✓ ' : '+ '}
                          {group.name}
                        </button>
                      )
                    })}
                  </div>
                )}

                {audienceMode === 'test' && (
                  <input
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="test@example.com"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm"
                  />
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Season ID</label>
                    <input
                      value={campaignSeasonId}
                      onChange={(e) => setCampaignSeasonId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Round Number (optional)</label>
                    <input
                      value={campaignRoundNo}
                      onChange={(e) => setCampaignRoundNo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Custom Data JSON</label>
                  <textarea
                    value={campaignCustomDataJson}
                    onChange={(e) => setCampaignCustomDataJson(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono"
                  />
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={campaignDryRun}
                    onChange={(e) => setCampaignDryRun(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Dry run only (preview payload, do not send)
                </label>

                <button
                  onClick={handleSendCampaign}
                  disabled={sendCampaignMutation.isPending || !selectedTemplateId}
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50"
                >
                  {sendCampaignMutation.isPending ? 'Running…' : campaignDryRun ? 'Run Dry Preview' : 'Send Campaign'}
                </button>

                {campaignStatus && (
                  <p className={`text-sm font-medium ${campaignStatus.startsWith('✅') ? 'text-emerald-600' : 'text-red-500'}`}>
                    {campaignStatus}
                  </p>
                )}
              </div>
            </div>
          </div>
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
