import client from './client'
import type { Portfolio, YearSummary, PatrimonioPoint, RVPoint } from '@/types'

export const portfolioApi = {
  get: () => client.get<Portfolio>('/portfolio/'),
}

export const reportsApi = {
  yearSummary: () => client.get<YearSummary[]>('/reports/year-summary/'),
  patrimonioEvolution: () => client.get<PatrimonioPoint[]>('/reports/patrimonio-evolution/'),
  rvEvolution: () => client.get<RVPoint[]>('/reports/rv-evolution/'),
}
