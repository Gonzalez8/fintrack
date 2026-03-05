import { http, HttpResponse } from 'msw'
import type { Asset, OHLCBar, AssetPositionPoint } from '@/types'
import { store } from '../store'
import { paginate } from './_pagination'

// Deterministic seeded random for synthetic OHLC generation
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function assetSeed(assetId: string): number {
  return assetId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
}

function generateOHLC(assetId: string, period: string): OHLCBar[] {
  const asset = store.assets.find((a) => a.id === assetId)
  const basePrice = parseFloat(asset?.current_price ?? '100')
  const rand = seededRandom(assetSeed(assetId))

  const days =
    period === '1mo' ? 30 :
    period === '3mo' ? 90 :
    period === '6mo' ? 180 :
    period === '2y'  ? 730 :
    period === '5y'  ? 1825 :
    365 // default 1y

  const bars: OHLCBar[] = []
  const endDate = new Date()
  let price = basePrice * (1 - 0.15 * rand()) // start ~15% below current

  for (let i = days; i >= 0; i--) {
    const date = new Date(endDate)
    date.setDate(endDate.getDate() - i)
    const dayOfWeek = date.getDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) continue // skip weekends

    const change = (rand() - 0.48) * 0.025 * price
    price = Math.max(price + change, 0.01)

    const high = price * (1 + rand() * 0.01)
    const low = price * (1 - rand() * 0.01)
    const open = low + rand() * (high - low)

    bars.push({
      time: date.toISOString().slice(0, 10),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(price * 100) / 100,
    })
  }
  return bars
}

function generatePositionHistory(assetId: string): AssetPositionPoint[] {
  const asset = store.assets.find((a) => a.id === assetId)
  if (!asset) return []

  const currentPrice = parseFloat(asset.current_price ?? '0')
  const rand = seededRandom(assetSeed(assetId) + 42)
  const points: AssetPositionPoint[] = []

  for (let i = 23; i >= 0; i--) {
    const date = new Date('2026-02-28')
    date.setMonth(date.getMonth() - i)

    const priceFactor = 0.85 + (0.15 * (23 - i)) / 23 + (rand() - 0.5) * 0.04
    const price = Math.round(currentPrice * priceFactor * 100) / 100
    const qty = Math.min(10 + Math.floor((23 - i) * 2.5), 68)
    const cost = Math.round(price * qty * 0.92 * 100) / 100
    const mv = Math.round(price * qty * 100) / 100
    const pnl = Math.round((mv - cost) * 100) / 100
    const pnlPct = cost > 0 ? Math.round((pnl / cost) * 10000) / 100 : 0

    points.push({
      captured_at: date.toISOString().slice(0, 10),
      market_value: mv.toFixed(2),
      cost_basis: cost.toFixed(2),
      unrealized_pnl: pnl.toFixed(2),
      unrealized_pnl_pct: pnlPct.toFixed(2),
      quantity: qty.toFixed(6),
    })
  }
  return points
}

export const assetHandlers = [
  http.get('/api/assets/', ({ request }) => {
    const url = new URL(request.url)
    const params = url.searchParams
    let items = [...store.assets]

    const search = params.get('search')
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (a) => a.name.toLowerCase().includes(q) || (a.ticker ?? '').toLowerCase().includes(q),
      )
    }
    const type = params.get('type')
    if (type) items = items.filter((a) => a.type === type)
    const status = params.get('price_status')
    if (status) items = items.filter((a) => a.price_status === status)

    return HttpResponse.json(paginate(items, params, '/api/assets/'))
  }),

  http.get('/api/assets/:id/', ({ params }) => {
    const asset = store.assets.find((a) => a.id === params.id)
    if (!asset) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(asset)
  }),

  http.post('/api/assets/', async ({ request }) => {
    const body = await request.json() as Partial<Asset>
    const now = new Date().toISOString()
    const newAsset: Asset = {
      id: crypto.randomUUID(),
      name: body.name ?? '',
      ticker: body.ticker ?? null,
      isin: body.isin ?? null,
      type: body.type ?? 'STOCK',
      currency: body.currency ?? 'EUR',
      current_price: body.current_price ?? null,
      price_mode: body.price_mode ?? 'MANUAL',
      price_source: body.price_source ?? 'MANUAL',
      price_status: null,
      price_updated_at: null,
      issuer_country: body.issuer_country ?? null,
      domicile_country: body.domicile_country ?? null,
      withholding_country: body.withholding_country ?? null,
      created_at: now,
      updated_at: now,
    }
    store.assets.push(newAsset)
    return HttpResponse.json(newAsset, { status: 201 })
  }),

  http.patch('/api/assets/:id/', async ({ params, request }) => {
    const body = await request.json() as Partial<Asset>
    const idx = store.assets.findIndex((a) => a.id === params.id)
    if (idx === -1) return new HttpResponse(null, { status: 404 })
    store.assets[idx] = { ...store.assets[idx], ...body, updated_at: new Date().toISOString() }
    return HttpResponse.json(store.assets[idx])
  }),

  http.delete('/api/assets/:id/', ({ params }) => {
    const idx = store.assets.findIndex((a) => a.id === params.id)
    if (idx === -1) return new HttpResponse(null, { status: 404 })
    store.assets.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/assets/:id/set-price/', async ({ params, request }) => {
    const body = await request.json() as { price: string }
    const idx = store.assets.findIndex((a) => a.id === params.id)
    if (idx === -1) return new HttpResponse(null, { status: 404 })
    store.assets[idx] = {
      ...store.assets[idx],
      current_price: body.price,
      price_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return HttpResponse.json(store.assets[idx])
  }),

  http.get('/api/assets/:id/price-history/', ({ params, request }) => {
    const url = new URL(request.url)
    const period = url.searchParams.get('period') ?? '1y'
    return HttpResponse.json(generateOHLC(params.id as string, period))
  }),

  http.get('/api/assets/:id/position-history/', ({ params }) => {
    return HttpResponse.json(generatePositionHistory(params.id as string))
  }),

  http.post('/api/assets/update-prices/', () => {
    return HttpResponse.json({ task_id: 'demo-task-update-prices', status: 'queued' }, { status: 202 })
  }),

  // Task status endpoint — instantly resolves with SUCCESS for demo mode
  http.get('/api/tasks/:taskId/', ({ params }) => {
    if (params.taskId === 'demo-task-update-prices') {
      return HttpResponse.json({
        task_id: params.taskId,
        status: 'SUCCESS',
        result: {
          updated: store.assets.filter((a) => a.price_mode === 'AUTO').length,
          errors: [],
          prices: store.assets
            .filter((a) => a.ticker && a.current_price)
            .map((a) => ({ ticker: a.ticker!, name: a.name, price: a.current_price! })),
        },
      })
    }
    return HttpResponse.json({ task_id: params.taskId, status: 'SUCCESS', result: {} })
  }),
]
