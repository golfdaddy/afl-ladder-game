import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'

export default function FantasyInviteAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [competitionId, setCompetitionId] = useState<number | null>(null)

  const handleAccept = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const response = await api.post(`/fantasy/competitions/invites/${token}/accept`)
      setSuccess(response.data.message || 'Invite accepted')
      setCompetitionId(response.data.competitionId || null)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to accept invite')
    } finally {
      setLoading(false)
    }
  }

  const handleDecline = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const response = await api.post(`/fantasy/competitions/invites/${token}/decline`)
      setSuccess(response.data.message || 'Invite declined')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to decline invite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6">
        <h1 className="text-xl font-bold text-slate-900">Fantasy Competition Invite</h1>
        <p className="text-sm text-slate-500 mt-2">
          Accept or decline your invitation. Your account email must match the invited email.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleAccept}
            disabled={loading || !token}
            className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50"
          >
            Accept
          </button>
          <button
            onClick={handleDecline}
            disabled={loading || !token}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm disabled:opacity-50"
          >
            Decline
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-4 text-sm text-emerald-600">{success}</p>}

        <div className="mt-6 flex gap-3">
          {competitionId ? (
            <button
              onClick={() => navigate(`/fantasy/competition/${competitionId}`)}
              className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-100 text-emerald-700 font-semibold text-sm"
            >
              Open Competition
            </button>
          ) : null}
          <button
            onClick={() => navigate('/fantasy/dashboard')}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm"
          >
            Fantasy Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
