import { create } from 'zustand'

export type UserRole = 'user' | 'admin'

export interface User {
  id: number
  email: string
  displayName: string
  emailVerified: boolean
  role: UserRole
}

interface AuthStore {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isAdmin: boolean
  setUser: (user: User) => void
  setToken: (token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  isAdmin: (() => {
    try {
      const u = localStorage.getItem('user')
      return u ? JSON.parse(u).role === 'admin' : false
    } catch {
      return false
    }
  })(),

  setUser: (user) => {
    set({ user, isAdmin: user.role === 'admin' })
    localStorage.setItem('user', JSON.stringify(user))
  },

  setToken: (token) => {
    set({ token, isAuthenticated: true })
    localStorage.setItem('token', token)
  },

  logout: () => {
    set({ user: null, token: null, isAuthenticated: false, isAdmin: false })
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }
}))
