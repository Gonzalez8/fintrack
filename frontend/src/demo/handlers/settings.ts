import { http, HttpResponse } from 'msw'
import type { Settings } from '@/types'
import { store } from '../store'

export const settingsHandlers = [
  http.get('/api/settings/', () => {
    return HttpResponse.json(store.settings)
  }),

  http.put('/api/settings/', async ({ request }) => {
    const body = await request.json() as Partial<Settings>
    store.settings = { ...store.settings, ...body }
    return HttpResponse.json(store.settings)
  }),
]
