import { http, HttpResponse } from 'msw'
import type { Interest } from '@/types'
import { store } from '../store'
import { paginate } from './_pagination'

export const interestHandlers = [
  http.get('/api/interests/', ({ request }) => {
    const url = new URL(request.url)
    const params = url.searchParams
    let items = [...store.interests]

    const accountId = params.get('account')
    if (accountId) items = items.filter((i) => i.account === accountId)

    const year = params.get('year')
    if (year) items = items.filter((i) => i.date.startsWith(year))

    items.sort((a, b) => b.date.localeCompare(a.date))

    return HttpResponse.json(paginate(items, params, '/api/interests/'))
  }),

  http.get('/api/interests/:id/', ({ params }) => {
    const item = store.interests.find((i) => i.id === params.id)
    if (!item) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(item)
  }),

  http.post('/api/interests/', async ({ request }) => {
    const body = await request.json() as Partial<Interest>
    const account = store.accounts.find((a) => a.id === body.account)
    const now = new Date().toISOString()
    const newItem: Interest = {
      id: crypto.randomUUID(),
      date: body.date ?? now.slice(0, 10),
      account: body.account ?? '',
      account_name: account?.name ?? '',
      gross: body.gross ?? '0.00',
      net: body.net ?? '0.00',
      balance: body.balance ?? null,
      annual_rate: body.annual_rate ?? null,
      created_at: now,
      updated_at: now,
    }
    store.interests.unshift(newItem)
    return HttpResponse.json(newItem, { status: 201 })
  }),

  http.patch('/api/interests/:id/', async ({ params, request }) => {
    const body = await request.json() as Partial<Interest>
    const idx = store.interests.findIndex((i) => i.id === params.id)
    if (idx === -1) return new HttpResponse(null, { status: 404 })
    store.interests[idx] = {
      ...store.interests[idx],
      ...body,
      updated_at: new Date().toISOString(),
    }
    return HttpResponse.json(store.interests[idx])
  }),

  http.delete('/api/interests/:id/', ({ params }) => {
    const idx = store.interests.findIndex((i) => i.id === params.id)
    if (idx === -1) return new HttpResponse(null, { status: 404 })
    store.interests.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),
]
