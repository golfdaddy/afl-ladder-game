import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuthStore } from '../store/auth'
import { SevensLogo } from '../components/SevensBrand'

/** Super Sevens front door — branded signup/login. SEVENS_ONLY builds only. */
export default function SevensAuthPage() {
  const navigate = useNavigate()
  const { isAuthenticated, setToken, setUser } = useAuthStore()
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'signup') await api.post('/auth/register', { email, displayName, password })
      const response = await api.post('/auth/login', { email, password })
      setToken(response.data.token)
      setUser(response.data.user)
    } catch (err: any) {
      setError(err.response?.data?.error || (mode === 'signup' ? 'Sign up failed' : 'Sign in failed'))
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 w-fit drop-shadow-[0_0_18px_rgba(16,185,129,0.4)]">
            <SevensLogo size={64} />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">SUPER SEVENS</h1>
          <p className="text-sm text-slate-400 mt-1">Pick 7. Beat your mates. Salary-cap footy fantasy.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-3">
          {mode === 'signup' && (
            <input
              type="text" required placeholder="Your name (shown on leaderboards)" value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          )}
          <input
            type="email" required placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <input
            type="password" required placeholder={mode === 'signup' ? 'Password (8+ characters)' : 'Password'} value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {error && <p className="text-xs text-red-400 font-semibold">{error}</p>}
          <button
            type="submit" disabled={busy}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-black transition-colors"
          >
            {busy ? 'One sec…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-4">
          {mode === 'signup' ? 'Already have an account?' : 'New here?'}{' '}
          <button onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError('') }} className="text-emerald-400 font-bold hover:text-emerald-300">
            {mode === 'signup' ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  )
}
