import { http, HttpResponse } from 'msw'
import type { Transaction } from '@/types'
import { store } from '../store'
import { paginate } from './_pagination'

export const transactionHandlers = [
  http.get('/api/transactions/', ({ request }) => {
    const url = new URL(request.url)
    const params = url.searchParams
    let items = [...store.transactions]

    const assetId = params.get('asset')
    if (assetId) items = items.filter((t) => t.asset === assetId)

    const accountId = params.get('account')
    if (accountId) items = items.filter((t) => t.account === accountId)

    const type = params.get('type')
    if (type) items = items.filter((t) => t.type === type)

    const year = params.get('year')
    if (year) items = items.filter((t) => t.date.startsWith(year))

    items.sort((a, b) => b.date.localeCompare(a.date))

    return HttpResponse.json(paginate(items, params, '/api/transactions/'))
  }),

  http.get('/api/transactions/:id/', ({ params }) => {
    const item = store.transactions.find((t) => t.id === params.id)
    if (!item) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(item)
  }),

  http.post('/api/transactions/', async ({ request }) => {
    const body = await request.json() as Partial<Transaction>
    const asset = store.assets.find((a) => a.id === body.asset)
    const account = store.accounts.find((a) => a.id === body.account)
    const now = new Date().toISOString()
    const newItem: Transaction = {
      id: crypto.randomUUID(),
      date: body.date ?? now.slice(0, 10),
      type: body.type ?? 'BUY',
      asset: body.asset ?? '',
      asset_name: asset?.name ?? '',
      asset_ticker: asset?.ticker ?? null,
      account: body.account ?? '',
      account_name: account?.name ?? '',
      quantity: body.quantity ?? '0',
      price: body.price ?? null,
      commission: body.commission ?? '0.00',
      tax: body.tax ?? '0.00',
      notes: body.notes ?? '',
      created_at: now,
      updated_at: now,
    }
    store.transactions.unshift(newItem)
    return HttpResponse.json(newItem, { status: 201 })
  }),

  http.patch('/api/transactions/:id/', async ({ params, request }) => {
    const body = await request.json() as Partial<Transaction>
    const idx = store.transactions.findIndex((t) => t.id === params.id)
    if (idx === -1) return new HttpResponse(null, { status: 404 })
    store.transactions[idx] = {
      ...store.transactions[idx],
      ...body,
      updated_at: new Date().toISOString(),
    }
    return HttpResponse.json(store.transactions[idx])
  }),

  http.delete('/api/transactions/:id/', ({ params }) => {
    const idx = store.transactions.findIndex((t) => t.id === params.id)
    if (idx === -1) return new HttpResponse(null, { status: 404 })
    store.transactions.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),
]
