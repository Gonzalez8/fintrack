import { http, HttpResponse } from 'msw'
import { YEAR_SUMMARY, PATRIMONIO_EVOLUTION, RV_EVOLUTION, MONTHLY_SAVINGS } from '../data/reports'

export const reportHandlers = [
  http.get('/api/reports/year-summary/', () => {
    return HttpResponse.json(YEAR_SUMMARY)
  }),

  http.get('/api/reports/patrimonio-evolution/', () => {
    return HttpResponse.json(PATRIMONIO_EVOLUTION)
  }),

  http.get('/api/reports/rv-evolution/', () => {
    return HttpResponse.json(RV_EVOLUTION)
  }),

  http.get('/api/reports/snapshot-status/', () => {
    return HttpResponse.json({
      frequency_minutes: 1440,
      last_snapshot: '2026-02-28T22:00:00Z',
      next_snapshot: '2026-03-01T22:00:00Z',
    })
  }),

  http.get('/api/reports/monthly-savings/', () => {
    return HttpResponse.json(MONTHLY_SAVINGS)
  }),
]
