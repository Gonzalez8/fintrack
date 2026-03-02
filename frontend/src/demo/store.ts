import type { Asset, Account, Transaction, Dividend, Interest, AccountSnapshot, Settings } from '@/types'
import { ASSETS } from './data/assets'
import { ACCOUNTS } from './data/accounts'
import { TRANSACTIONS } from './data/transactions'
import { DIVIDENDS } from './data/dividends'
import { INTERESTS } from './data/interests'
import { SNAPSHOTS } from './data/snapshots'

// Module-level mutable store — MSW handlers operate outside React,
// so a plain object is the correct pattern here.
export const store = {
  // Auto-login when VITE_DEMO_MODE=true (Vercel deploy)
  isLoggedIn: import.meta.env.VITE_DEMO_MODE === 'true',

  assets: [...ASSETS] as Asset[],
  accounts: [...ACCOUNTS] as Account[],
  transactions: [...TRANSACTIONS] as Transaction[],
  dividends: [...DIVIDENDS] as Dividend[],
  interests: [...INTERESTS] as Interest[],
  snapshots: [...SNAPSHOTS] as AccountSnapshot[],

  settings: {
    base_currency: 'EUR',
    cost_basis_method: 'FIFO',
    gift_cost_mode: 'ZERO',
    rounding_money: 2,
    rounding_qty: 6,
    price_update_interval: 0,
    default_price_source: 'YAHOO',
    snapshot_frequency: 1440,
    data_retention_days: null,
  } as Settings,
}
