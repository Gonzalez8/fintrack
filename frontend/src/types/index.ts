export interface User {
  id: number
  username: string
}

export interface Asset {
  id: string
  name: string
  ticker: string | null
  isin: string | null
  type: 'STOCK' | 'ETF' | 'FUND' | 'CRYPTO'
  currency: string
  current_price: string | null
  price_mode: 'MANUAL' | 'AUTO'
  issuer_country: string | null
  domicile_country: string | null
  withholding_country: string | null
  price_source: 'YAHOO' | 'MANUAL'
  price_status: 'OK' | 'ERROR' | 'NO_TICKER' | null
  price_updated_at: string | null
  created_at: string
  updated_at: string
}

export interface Account {
  id: string
  name: string
  type: 'OPERATIVA' | 'AHORRO' | 'INVERSION' | 'DEPOSITOS' | 'ALTERNATIVOS'
  currency: string
  balance: string
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  date: string
  type: 'BUY' | 'SELL' | 'GIFT'
  asset: string
  asset_name: string
  asset_ticker: string | null
  account: string
  account_name: string
  quantity: string
  price: string | null
  commission: string
  tax: string
  notes: string
  created_at: string
  updated_at: string
}

export interface Dividend {
  id: string
  date: string
  asset: string
  asset_name: string
  asset_ticker: string | null
  asset_issuer_country: string | null
  shares: string | null
  gross: string
  tax: string
  net: string
  withholding_rate: string | null
  created_at: string
  updated_at: string
}

export interface Interest {
  id: string
  date: string
  account: string
  account_name: string
  gross: string
  net: string
  balance: string | null
  annual_rate: string | null
  created_at: string
  updated_at: string
}

export interface Position {
  asset_id: string
  asset_name: string
  asset_ticker: string | null
  asset_type: string
  account_id: string | null
  quantity: string
  avg_cost: string
  cost_total: string
  current_price: string
  market_value: string
  unrealized_pnl: string
  unrealized_pnl_pct: string
  weight_pct: string
}

export interface AccountBalance {
  account_id: string
  account_name: string
  account_type: string
  balance: string
}

export interface RealizedSale {
  date: string
  asset_name: string
  asset_ticker: string | null
  quantity: string
  cost_basis: string
  sell_total: string
  realized_pnl: string
  realized_pnl_pct: string
}

export interface Portfolio {
  total_market_value: string
  total_cost: string
  total_unrealized_pnl: string
  realized_pnl_total: string
  total_cash: string
  grand_total: string
  accounts: AccountBalance[]
  positions: Position[]
  realized_sales: RealizedSale[]
}

export interface YearSummary {
  year: number
  dividends_gross: string
  dividends_tax: string
  dividends_net: string
  interests_gross: string
  interests_net: string
  sales_pnl: string
  total_net: string
}

export interface AccountSnapshot {
  id: string
  account: string
  account_name: string
  date: string
  balance: string
  note: string
  created_at: string
}

export interface PatrimonioPoint {
  month: string
  cash: string
  investments: string
  renta_variable: string
  renta_fija: string
}

export interface RVPoint {
  captured_at: string
  value: string
}

export interface SnapshotStatus {
  frequency_minutes: number
  last_snapshot: string | null
  next_snapshot: string | null
}

export interface Settings {
  base_currency: string
  cost_basis_method: string
  gift_cost_mode: string
  rounding_money: number
  rounding_qty: number
  price_update_interval: number
  default_price_source: string
  snapshot_frequency: number
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
