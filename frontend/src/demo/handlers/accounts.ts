import { http, HttpResponse } from 'msw'
import type { Account, AccountSnapshot } from '@/types'
import { store } from '../store'
import { paginate } from './_pagination'

export const accountHandlers = [
  http.get('/api/accounts/', ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json(paginate([...store.accounts], url.searchParams, '/api/accounts/'))
  }),

  http.get('/api/accounts/:id/', ({ params }) => {
    const account = store.accounts.find((a) => a.id === params.id)
    if (!account) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(account)
  }),

  http.post('/api/accounts/', async ({ request }) => {
    const body = await request.json() as Partial<Account>
    const now = new Date().toISOString()
    const newAccount: Account = {
      id: crypto.randomUUID(),
      name: body.name ?? '',
      type: body.type ?? 'OPERATIVA',
      currency: body.currency ?? 'EUR',
      balance: '0.00',
      created_at: now,
      updated_at: now,
    }
    store.accounts.push(newAccount)
    return HttpResponse.json(newAccount, { status: 201 })
  }),

  http.patch('/api/accounts/:id/', async ({ params, request }) => {
    const body = await request.json() as Partial<Account>
    const idx = store.accounts.findIndex((a) => a.id === params.id)
    if (idx === -1) return new HttpResponse(null, { status: 404 })
    store.accounts[idx] = { ...store.accounts[idx], ...body, updated_at: new Date().toISOString() }
    return HttpResponse.json(store.accounts[idx])
  }),

  http.delete('/api/accounts/:id/', ({ params }) => {
    const idx = store.accounts.findIndex((a) => a.id === params.id)
    if (idx === -1) return new HttpResponse(null, { status: 404 })
    store.accounts.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  // Account snapshots
  http.get('/api/account-snapshots/', ({ request }) => {
    const url = new URL(request.url)
    const params = url.searchParams
    let items = [...store.snapshots]

    const accountId = params.get('account')
    if (accountId) items = items.filter((s) => s.account === accountId)

    items.sort((a, b) => b.date.localeCompare(a.date))

    return HttpResponse.json(paginate(items, params, '/api/account-snapshots/'))
  }),

  http.post('/api/account-snapshots/', async ({ request }) => {
    const body = await request.json() as Partial<AccountSnapshot>
    const account = store.accounts.find((a) => a.id === body.account)
    const now = new Date().toISOString()
    const newSnapshot: AccountSnapshot = {
      id: crypto.randomUUID(),
      account: body.account ?? '',
      account_name: account?.name ?? '',
      date: body.date ?? now.slice(0, 10),
      balance: body.balance ?? '0.00',
      note: body.note ?? '',
      created_at: now,
    }
    store.snapshots.unshift(newSnapshot)
    return HttpResponse.json(newSnapshot, { status: 201 })
  }),

  http.delete('/api/account-snapshots/:id/', ({ params }) => {
    const idx = store.snapshots.findIndex((s) => s.id === params.id)
    if (idx === -1) return new HttpResponse(null, { status: 404 })
    store.snapshots.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/accounts/bulk-snapshot/', async ({ request }) => {
    const body = await request.json() as { date: string; snapshots: Array<{ account: string; balance: string; note?: string }> }
    const now = new Date().toISOString()
    const created: AccountSnapshot[] = []
    for (const s of body.snapshots) {
      const account = store.accounts.find((a) => a.id === s.account)
      const snap: AccountSnapshot = {
        id: crypto.randomUUID(),
        account: s.account,
        account_name: account?.name ?? '',
        date: body.date,
        balance: s.balance,
        note: s.note ?? '',
        created_at: now,
      }
      store.snapshots.unshift(snap)
      created.push(snap)
    }
    return HttpResponse.json(created, { status: 201 })
  }),

  // Storage info
  http.get('/api/storage-info/', () => {
    return HttpResponse.json({
      total_mb: 0.42,
      tables: [
        { table: 'transactions', size_mb: 0.12 },
        { table: 'dividends', size_mb: 0.08 },
        { table: 'interests', size_mb: 0.05 },
        { table: 'assets', size_mb: 0.04 },
        { table: 'accounts', size_mb: 0.02 },
        { table: 'snapshots', size_mb: 0.11 },
      ],
    })
  }),
]
