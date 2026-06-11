import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'
import { useAuthStore } from '../store/auth'

const PENDING_CODE_KEY = 'multi_pending_comp_code'

/** Join a comp by code, swallowing "already a member" so links are idempotent. */
async function tryJoinComp(code: string) {
  try {
    await api.post('/multi/comps/join', { code })
  } catch (error: any) {
    const message = error.response?.data?.error || ''
    if (!message.includes('already')) throw error
  }
}

/**
 * Multi's own front door — branded signup/login with optional comp invite.
 * Used only in MULTI_ONLY builds; never references the ladder product.
 */
export default function MultiAuthPage() {
  const navigate = useNavigate()
  const { code: routeCode } = useParams()
  const { isAuthenticated, setToken, setUser } = useAuthStore()

  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Arriving via an invite link stores the code so it survives the auth hop
  useEffect(() => {
    if (routeCode) sessionStorage.setItem(PENDING_CODE_KEY, routeCode.toUpperCase())
  }, [routeCode])

  const pendingCode = routeCode?.toUpperCase() || sessionStorage.getItem(PENDING_CODE_KEY) || ''

  // Already signed in (e.g. clicked an invite link twice): join and go
  useEffect(() => {
    if (!isAuthenticated) return
    const code = sessionStorage.getItem(PENDING_CODE_KEY)
    const finish = async () => {
      if (code) {
        try { await tryJoinComp(code) } catch { /* surfaced on the comps tab instead */ }
        sessionStorage.removeItem(PENDING_CODE_KEY)
      }
      navigate('/', { replace: true })
    }
    finish()
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        await api.post('/auth/register', { email, displayName, password })
      }
      const response = await api.post('/auth/login', { email, password })
      setToken(response.data.token)
      setUser(response.data.user)
      // The isAuthenticated effect above handles comp join + redirect
    } catch (err: any) {
      setError(err.response?.data?.error || (mode === 'signup' ? 'Sign up failed' : 'Sign in failed'))
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-violet-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-violet-500/30">
            <span className="text-white font-black text-2xl">×</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Multi</h1>
          <p className="text-sm text-slate-400 mt-1">Footy tipping with a bookie's brain. Fake cash only.</p>
        </div>

        {/* Invite banner */}
        {pendingCode && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-violet-500/10 border border-violet-500/30 text-center">
            <p className="text-xs text-violet-300 font-semibold">You've been invited to a comp</p>
            <p className="text-lg font-black text-white tracking-widest">{pendingCode}</p>
            <p className="text-[10px] text-slate-400">{mode === 'signup' ? 'Create an account and you are in.' : 'Sign in and you are in.'}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-3">
          {mode === 'signup' && (
            <input
              type="text" required placeholder="Your name (shown on leaderboards)" value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          )}
          <input
            type="email" required placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <input
            type="password" required placeholder={mode === 'signup' ? 'Password (8+ characters)' : 'Password'} value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          {error && <p className="text-xs text-red-400 font-semibold">{error}</p>}
          <button
            type="submit" disabled={busy}
            className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-black transition-colors"
          >
            {busy ? 'One sec…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-4">
          {mode === 'signup' ? 'Already have an account?' : 'New here?'}{' '}
          <button onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError('') }} className="text-violet-400 font-bold hover:text-violet-300">
            {mode === 'signup' ? 'Sign in' : 'Create one'}
          </button>
        </p>
        <p className="text-center text-[10px] text-slate-600 mt-6">
          No real money. Ever. Just bragging rights.
        </p>
      </div>
    </div>
  )
}
