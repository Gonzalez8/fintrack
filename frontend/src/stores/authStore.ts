import { create } from 'zustand'
import axios from 'axios'
import { authApi } from '@/api/auth'
import { setAccessToken } from '@/api/client'
import type { User, RegisterRequest } from '@/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (data: RegisterRequest) => Promise<void>
  loginWithGoogle: (credential: string) => Promise<void>
  logout: () => Promise<void>
  /**
   * Called on app mount to restore the session from the httpOnly refresh cookie.
   * Calls /auth/token/refresh/ → if valid, gets a new access token and fetches user.
   */
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  login: async (username, password) => {
    const { data } = await authApi.tokenLogin(username, password)
    setAccessToken(data.access)
    set({ user: data.user })
  },

  register: async (data) => {
    const { data: res } = await authApi.register(data)
    setAccessToken(res.access)
    set({ user: res.user })
  },

  loginWithGoogle: async (credential) => {
    const { data } = await authApi.googleAuth(credential)
    setAccessToken(data.access)
    set({ user: data.user })
  },

  logout: async () => {
    try {
      await authApi.logout()
    } finally {
      setAccessToken(null)
      set({ user: null })
    }
  },

  fetchMe: async () => {
    try {
      // Use raw axios (bypasses interceptors) to avoid the 401 interceptor
      // triggering a redundant second refresh attempt when the cookie is missing.
      const { data: refreshData } = await axios.post<{ access: string }>(
        '/api/auth/token/refresh/',
        {},
        { withCredentials: true },
      )
      setAccessToken(refreshData.access)
      const { data: user } = await authApi.me()
      set({ user, loading: false })
    } catch {
      setAccessToken(null)
      set({ user: null, loading: false })
    }
  },
}))
