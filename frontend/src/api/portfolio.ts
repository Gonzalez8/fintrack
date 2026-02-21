import client from './client'
import type { Portfolio, YearSummary, PatrimonioPoint, ImportResult } from '@/types'

export const portfolioApi = {
  get: () => client.get<Portfolio>('/portfolio/'),
}

export const reportsApi = {
  yearSummary: () => client.get<YearSummary[]>('/reports/year-summary/'),
  patrimonioEvolution: () => client.get<PatrimonioPoint[]>('/reports/patrimonio-evolution/'),
}

export const importApi = {
  upload: (file: File, dryRun: boolean) => {
    const formData = new FormData()
    formData.append('file', file)
    return client.post<ImportResult>(`/import/xlsx/?dry_run=${dryRun}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
