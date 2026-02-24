import client from './client'
import type { Asset, Account, AccountSnapshot, Settings, StorageInfo, AssetPositionPoint, PaginatedResponse } from '@/types'

export const assetsApi = {
  list: (params?: Record<string, string>) =>
    client.get<PaginatedResponse<Asset>>('/assets/', { params }),
  get: (id: string) => client.get<Asset>(`/assets/${id}/`),
  create: (data: Partial<Asset>) => client.post<Asset>('/assets/', data),
  update: (id: string, data: Partial<Asset>) => client.patch<Asset>(`/assets/${id}/`, data),
  delete: (id: string) => client.delete(`/assets/${id}/`),
  setPrice: (id: string, price: string) => client.post<Asset>(`/assets/${id}/set-price/`, { price }),
  positionHistory: (id: string) => client.get<AssetPositionPoint[]>(`/assets/${id}/position-history/`),
  updatePrices: () => client.post<{
    updated: number
    errors: string[]
    prices: Array<{ ticker: string; name: string; price: string }>
  }>('/assets/update-prices/'),
}

export const accountsApi = {
  list: () => client.get<PaginatedResponse<Account>>('/accounts/'),
  create: (data: Partial<Account>) => client.post<Account>('/accounts/', data),
  update: (id: string, data: Partial<Account>) => client.patch<Account>(`/accounts/${id}/`, data),
  delete: (id: string) => client.delete(`/accounts/${id}/`),
}

export const snapshotsApi = {
  list: (params?: Record<string, string>) =>
    client.get<PaginatedResponse<AccountSnapshot>>('/account-snapshots/', { params }),
  create: (data: { account: string; date: string; balance: string; note?: string }) =>
    client.post<AccountSnapshot>('/account-snapshots/', data),
  delete: (id: string) => client.delete(`/account-snapshots/${id}/`),
  bulkCreate: (data: { date: string; snapshots: Array<{ account: string; balance: string; note?: string }> }) =>
    client.post<AccountSnapshot[]>('/accounts/bulk-snapshot/', data),
}

export const settingsApi = {
  get: () => client.get<Settings>('/settings/'),
  update: (data: Partial<Settings>) => client.put<Settings>('/settings/', data),
}

export const storageApi = {
  info: () => client.get<StorageInfo>('/storage-info/'),
}

export const backupApi = {
  exportUrl: '/api/backup/export/',
  import: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return client.post<{ counts: Record<string, number | boolean> }>('/backup/import/', form)
  },
}
