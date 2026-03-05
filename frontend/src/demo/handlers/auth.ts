import { http, HttpResponse } from 'msw'
import { store } from '../store'

const DEMO_USER = { id: 1, username: 'demo' }
const DEMO_ACCESS_TOKEN = 'demo-access-token'
const DEMO_PROFILE = {
  id: 1,
  username: 'demo',
  email: 'demo@example.com',
  date_joined: '2024-01-01T00:00:00Z',
}

export const authHandlers = [
  // JWT login (primary endpoint used by the SPA)
  http.post('/api/auth/token/', () => {
    store.isLoggedIn = true
    return HttpResponse.json(
      { access: DEMO_ACCESS_TOKEN, user: DEMO_USER },
      { status: 200 },
    )
  }),

  // JWT refresh (called on page load to restore session from cookie)
  http.post('/api/auth/token/refresh/', () => {
    if (store.isLoggedIn) {
      return HttpResponse.json({ access: DEMO_ACCESS_TOKEN })
    }
    return new HttpResponse(null, { status: 401 })
  }),

  // Logout
  http.post('/api/auth/logout/', () => {
    store.isLoggedIn = false
    return new HttpResponse(null, { status: 200 })
  }),

  // Current user
  http.get('/api/auth/me/', () => {
    if (store.isLoggedIn) {
      return HttpResponse.json(DEMO_USER)
    }
    return new HttpResponse(null, { status: 401 })
  }),

  // Registration — demo always succeeds
  http.post('/api/auth/register/', () => {
    store.isLoggedIn = true
    return HttpResponse.json(
      { access: DEMO_ACCESS_TOKEN, user: DEMO_USER },
      { status: 201 },
    )
  }),

  // Google auth — demo always succeeds (no real token verification)
  http.post('/api/auth/google/', () => {
    store.isLoggedIn = true
    return HttpResponse.json({ access: DEMO_ACCESS_TOKEN, user: DEMO_USER })
  }),

  // Profile
  http.get('/api/auth/profile/', () => {
    return HttpResponse.json(DEMO_PROFILE)
  }),

  http.put('/api/auth/profile/', async ({ request }) => {
    const body = await request.json() as Record<string, string>
    return HttpResponse.json({ ...DEMO_PROFILE, ...body })
  }),

  // Change password
  http.post('/api/auth/change-password/', () => {
    return HttpResponse.json({ access: DEMO_ACCESS_TOKEN })
  }),

  // Legacy session login (kept for Django admin compatibility)
  http.get('/api/auth/login/', () => {
    return new HttpResponse(null, { status: 200 })
  }),
  http.post('/api/auth/login/', () => {
    store.isLoggedIn = true
    return HttpResponse.json(DEMO_USER, { status: 200 })
  }),
]
