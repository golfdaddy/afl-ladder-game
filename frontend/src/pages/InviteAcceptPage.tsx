import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import api from '../services/api'

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'needsLogin'>('loading')
  const [message, setMessage] = useState('')
  const [competitionId, setCompetitionId] = useState<number | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      setStatus('needsLogin')
      setMessage('Please log in or register to accept this invitation.')
      return
    }

    const acceptInvite = async () => {
      try {
        const response = await api.post(`/competitions/invites/${token}/accept`)
        setStatus('success')
        setMessage(response.data.message)
        setCompetitionId(response.data.competitionId)
      } catch (err: any) {
        setStatus('error')
        setMessage(err.response?.data?.error || 'Failed to accept invitation')
      }
    }

    acceptInvite()
  }, [token, isAuthenticated])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">AFL Ladder Prediction</h1>
        <h2 className="text-lg text-gray-600 mb-6">Competition Invitation</h2>

        {status === 'loading' && (
          <div>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Accepting invitation...</p>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-green-600 font-semibold text-lg mb-4">{message}</p>
            <button
              onClick={() => competitionId ? navigate(`/competition/${competitionId}`) : navigate('/dashboard')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              Go to Competition
            </button>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-red-600 font-semibold mb-4">{message}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              Go to Dashboard
            </button>
          </div>
        )}

        {status === 'needsLogin' && (
          <div>
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <p className="text-gray-700 mb-6">{message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => navigate(`/login?redirect=/invite/${token}`)}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                Log In
              </button>
              <button
                onClick={() => navigate(`/register?redirect=/invite/${token}`)}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
              >
                Register
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
