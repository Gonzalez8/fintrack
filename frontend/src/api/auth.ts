import client from './client'
import type { User, RegisterRequest, ProfileData, ChangePasswordRequest } from '@/types'

interface JWTLoginResponse {
  access: string
  user: User
}

interface JWTRefreshResponse {
  access: string
}

export const authApi = {
  // JWT auth (primary for SPA)
  tokenLogin: (username: string, password: string) =>
    client.post<JWTLoginResponse>('/auth/token/', { username, password }),

  tokenRefresh: () =>
    client.post<JWTRefreshResponse>('/auth/token/refresh/'),

  logout: () => client.post('/auth/logout/'),
  me: () => client.get<User>('/auth/me/'),

  // Registration
  register: (data: RegisterRequest) =>
    client.post<JWTLoginResponse>('/auth/register/', data),

  // Google OAuth2 — sends Google's ID token to backend for verification
  googleAuth: (credential: string) =>
    client.post<JWTLoginResponse>('/auth/google/', { credential }),

  // Profile
  getProfile: () => client.get<ProfileData>('/auth/profile/'),
  updateProfile: (data: Partial<Pick<ProfileData, 'username' | 'email'>>) =>
    client.put<ProfileData>('/auth/profile/', data),

  // Password
  changePassword: (data: ChangePasswordRequest) =>
    client.post<{ access: string }>('/auth/change-password/', data),
}
