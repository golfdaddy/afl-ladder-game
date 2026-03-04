import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function NotFoundPage() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-12">
        <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
          <span className="text-white font-black text-sm tracking-tight">AFL</span>
        </div>
        <span className="text-slate-900 font-bold text-lg">Ladder Predictor</span>
      </div>

      {/* Error card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center max-w-md w-full">
        {/* Big 404 */}
        <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl font-black text-slate-400">404</span>
        </div>

        <h1 className="text-xl font-black text-slate-900 mb-2">Page not found</h1>
        <p className="text-slate-500 text-sm leading-relaxed mb-8">
          The page you're looking for doesn't exist or may have been moved.
          {!isAuthenticated && ' You may need to sign in to view this page.'}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {isAuthenticated ? (
            <>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm transition-colors"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => navigate(-1)}
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors"
              >
                Go back
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate('/login')}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm transition-colors"
              >
                Sign in
              </button>
              <button
                onClick={() => navigate('/register')}
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors"
              >
                Create account
              </button>
            </>
          )}
        </div>
      </div>

      <p className="text-slate-400 text-xs mt-8">
        If you followed a link, it may have expired or been removed.
      </p>
    </div>
  )
}
