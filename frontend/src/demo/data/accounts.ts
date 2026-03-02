import type { Account } from '@/types'

export const ACCOUNTS: Account[] = [
  {
    id: 'acc00001-0000-0000-0000-000000000001',
    name: 'DEGIRO Broker',
    type: 'INVERSION',
    currency: 'EUR',
    balance: '2450.80',
    created_at: '2024-01-10T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
  },
  {
    id: 'acc00002-0000-0000-0000-000000000002',
    name: 'ING Cuenta Naranja',
    type: 'AHORRO',
    currency: 'EUR',
    balance: '18200.00',
    created_at: '2024-01-10T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
  },
  {
    id: 'acc00003-0000-0000-0000-000000000003',
    name: 'Cuenta Nómina Sabadell',
    type: 'OPERATIVA',
    currency: 'EUR',
    balance: '4350.00',
    created_at: '2024-01-10T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
  },
]
