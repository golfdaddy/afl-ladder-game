import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './store/auth'

// Pages
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import CompetitionPage from './pages/CompetitionPage'
import PredictionPage from './pages/PredictionPage'
import LeaderboardPage from './pages/LeaderboardPage'
import InviteAcceptPage from './pages/InviteAcceptPage'
import AdminPage from './pages/AdminPage'
import UserLadderPage from './pages/UserLadderPage'
import NotFoundPage from './pages/NotFoundPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import FantasyDashboardPage from './pages/FantasyDashboardPage'
import FantasyCompetitionPage from './pages/FantasyCompetitionPage'
import FantasyTeamPage from './pages/FantasyTeamPage'
import FantasyLeaderboardPage from './pages/FantasyLeaderboardPage'
import FantasyInviteAcceptPage from './pages/FantasyInviteAcceptPage'
import { FEATURE_FANTASY7_ENABLED } from './config'

const queryClient = new QueryClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const location = useLocation()
  if (!isAuthenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" />
  if (!isAdmin) return <Navigate to="/dashboard" />
  return <>{children}</>
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/invite/:token" element={<InviteAcceptPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/competition/:id"
            element={
              <ProtectedRoute>
                <CompetitionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/prediction/:seasonId"
            element={
              <ProtectedRoute>
                <PredictionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leaderboard"
            element={
              <ProtectedRoute>
                <LeaderboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ladder/:userId"
            element={
              <ProtectedRoute>
                <UserLadderPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
            }
          />
          {FEATURE_FANTASY7_ENABLED && (
            <>
              <Route
                path="/fantasy/dashboard"
                element={
                  <ProtectedRoute>
                    <FantasyDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/fantasy/competition/:id"
                element={
                  <ProtectedRoute>
                    <FantasyCompetitionPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/fantasy/team/:competitionId/:roundId"
                element={
                  <ProtectedRoute>
                    <FantasyTeamPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/fantasy/leaderboard/:competitionId"
                element={
                  <ProtectedRoute>
                    <FantasyLeaderboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/fantasy/invite/:token"
                element={
                  <ProtectedRoute>
                    <FantasyInviteAcceptPage />
                  </ProtectedRoute>
                }
              />
            </>
          )}
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
