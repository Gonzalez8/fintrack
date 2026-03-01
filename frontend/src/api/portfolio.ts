import client from './client'
import type { Portfolio, YearSummary, PatrimonioPoint, RVPoint, SnapshotStatus, MonthlySavingsData } from '@/types'

export const portfolioApi = {
  get: () => client.get<Portfolio>('/portfolio/'),
}

export const reportsApi = {
  yearSummary: () => client.get<YearSummary[]>('/reports/year-summary/'),
  patrimonioEvolution: () => client.get<PatrimonioPoint[]>('/reports/patrimonio-evolution/'),
  rvEvolution: () => client.get<RVPoint[]>('/reports/rv-evolution/'),
  snapshotStatus: () => client.get<SnapshotStatus>('/reports/snapshot-status/'),
}

export const analyticsApi = {
  monthlySavings: (params?: { from?: string; to?: string }) =>
    client.get<MonthlySavingsData>('/reports/monthly-savings/', { params }),
}
