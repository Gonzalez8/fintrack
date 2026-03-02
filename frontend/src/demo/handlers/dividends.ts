import { http, HttpResponse } from 'msw'
import type { Dividend } from '@/types'
import { store } from '../store'
import { paginate } from './_pagination'

export const dividendHandlers = [
  http.get('/api/dividends/', ({ request }) => {
    const url = new URL(request.url)
    const params = url.searchParams
    let items = [...store.dividends]

    const assetId = params.get('asset')
    if (assetId) items = items.filter((d) => d.asset === assetId)

    const year = params.get('year')
    if (year) items = items.filter((d) => d.date.startsWith(year))

    items.sort((a, b) => b.date.localeCompare(a.date))

    return HttpResponse.json(paginate(items, params, '/api/dividends/'))
  }),

  http.get('/api/dividends/:id/', ({ params }) => {
    const item = store.dividends.find((d) => d.id === params.id)
    if (!item) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(item)
  }),

  http.post('/api/dividends/', async ({ request }) => {
    const body = await request.json() as Partial<Dividend>
    const asset = store.assets.find((a) => a.id === body.asset)
    const now = new Date().toISOString()
    const newItem: Dividend = {
      id: crypto.randomUUID(),
      date: body.date ?? now.slice(0, 10),
      asset: body.asset ?? '',
      asset_name: asset?.name ?? '',
      asset_ticker: asset?.ticker ?? null,
      asset_issuer_country: asset?.issuer_country ?? null,
      shares: body.shares ?? null,
      gross: body.gross ?? '0.00',
      tax: body.tax ?? '0.00',
      net: body.net ?? '0.00',
      withholding_rate: body.withholding_rate ?? null,
      created_at: now,
      updated_at: now,
    }
    store.dividends.unshift(newItem)
    return HttpResponse.json(newItem, { status: 201 })
  }),

  http.patch('/api/dividends/:id/', async ({ params, request }) => {
    const body = await request.json() as Partial<Dividend>
    const idx = store.dividends.findIndex((d) => d.id === params.id)
    if (idx === -1) return new HttpResponse(null, { status: 404 })
    store.dividends[idx] = {
      ...store.dividends[idx],
      ...body,
      updated_at: new Date().toISOString(),
    }
    return HttpResponse.json(store.dividends[idx])
  }),

  http.delete('/api/dividends/:id/', ({ params }) => {
    const idx = store.dividends.findIndex((d) => d.id === params.id)
    if (idx === -1) return new HttpResponse(null, { status: 404 })
    store.dividends.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),
]
