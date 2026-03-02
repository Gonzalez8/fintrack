import { http, HttpResponse } from 'msw'
import { store } from '../store'

const DEMO_USER = { id: 1, username: 'demo' }

export const authHandlers = [
  // getCsrf() calls GET /api/auth/login/ — just return 200
  http.get('/api/auth/login/', () => {
    return new HttpResponse(null, { status: 200 })
  }),

  // login() calls POST /api/auth/login/
  http.post('/api/auth/login/', () => {
    store.isLoggedIn = true
    return HttpResponse.json(DEMO_USER, { status: 200 })
  }),

  // fetchMe() — always returns demo user (auto-login in Vercel deploy)
  http.get('/api/auth/me/', () => {
    if (store.isLoggedIn) {
      return HttpResponse.json(DEMO_USER)
    }
    return new HttpResponse(null, { status: 401 })
  }),

  http.post('/api/auth/logout/', () => {
    store.isLoggedIn = false
    return new HttpResponse(null, { status: 200 })
  }),
]
