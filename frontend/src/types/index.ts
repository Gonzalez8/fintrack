// ── Auth ─────────────────────────────────────────────────────────
export interface User {
  id: number;
  username: string;
  email: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  password2: string;
}

export interface ProfileData {
  id?: string;
  username: string;
  email: string;
  date_joined?: string;
}

export interface ChangePasswordData {
  current_password: string;
  new_password: string;
  new_password_confirm: string;
}

export interface AuthResponse {
  access: string;
  user: User;
}

// ── Assets ───────────────────────────────────────────────────────
export type AssetType = "STOCK" | "ETF" | "FUND" | "CRYPTO";
export type PriceMode = "MANUAL" | "AUTO";
export type PriceSource = "YAHOO" | "MANUAL";
export type PriceStatus = "OK" | "ERROR" | "PENDING" | "NOT_FOUND" | "NO_TICKER";

export interface Asset {
  id: string;
  name: string;
  ticker: string | null;
  isin: string | null;
  type: AssetType;
  currency: string;
  current_price: string;
  price_mode: PriceMode;
  issuer_country: string;
  domicile_country: string;
  withholding_country: string;
  price_source: PriceSource;
  price_status: PriceStatus;
  price_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetFormData {
  name: string;
  ticker?: string;
  isin?: string;
  type: AssetType;
  currency: string;
  current_price?: string;
  price_mode: PriceMode;
  issuer_country?: string;
  domicile_country?: string;
  withholding_country?: string;
  price_source?: PriceSource;
}

// ── Accounts ─────────────────────────────────────────────────────
export type AccountType =
  | "OPERATIVA"
  | "AHORRO"
  | "INVERSION"
  | "DEPOSITOS"
  | "ALTERNATIVOS";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance: string;
  created_at: string;
  updated_at: string;
}

export interface AccountFormData {
  name: string;
  type: AccountType;
  currency: string;
}

export interface AccountSnapshot {
  id: string;
  account: string;
  account_name?: string;
  date: string;
  balance: string;
  note: string;
}

// ── Transactions ─────────────────────────────────────────────────
export type TransactionType = "BUY" | "SELL" | "GIFT";

export interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  asset: string;
  asset_name?: string;
  asset_ticker?: string;
  account: string;
  account_name?: string;
  quantity: string;
  price: string | null;
  commission: string;
  tax: string;
  notes: string;
  import_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionFormData {
  date: string;
  type: TransactionType;
  asset: string;
  account: string;
  quantity: string;
  price?: string;
  commission?: string;
  tax?: string;
  notes?: string;
}

// ── Dividends ────────────────────────────────────────────────────
export interface Dividend {
  id: string;
  date: string;
  asset: string;
  asset_name?: string;
  asset_ticker?: string;
  asset_issuer_country?: string;
  shares: string | null;
  gross: string;
  tax: string;
  commission: string;
  net: string;
  withholding_rate: string | null;
  import_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface DividendFormData {
  date: string;
  asset: string;
  shares?: string;
  gross: string;
  tax?: string;
  commission?: string;
  net: string;
  withholding_rate?: string;
}

// ── Interests ────────────────────────────────────────────────────
export interface Interest {
  id: string;
  date_start: string;
  date_end: string;
  days: number;
  account: string;
  account_name?: string;
  gross: string;
  tax: string | null;
  tax_effective: string;
  tax_is_inferred: boolean;
  commission: string;
  net: string;
  balance: string | null;
  created_at: string;
  updated_at: string;
}

export interface InterestFormData {
  date_start: string;
  date_end: string;
  account: string;
  gross: string;
  tax?: string | null;
  commission?: string;
  net: string;
  balance?: string;
}

// ── Portfolio ────────────────────────────────────────────────────
export interface Position {
  asset_id: string;
  asset_name: string;
  asset_ticker: string | null;
  asset_type: AssetType;
  currency: string;
  quantity: string;
  avg_cost: string;
  cost_basis: string;
  current_price: string;
  market_value: string;
  unrealized_pnl: string;
  unrealized_pnl_pct: string;
  weight: string;
}

export interface RealizedSale {
  date: string;
  asset_name: string;
  asset_ticker: string | null;
  quantity: string;
  sell_price: string;
  cost_basis: string;
  proceeds: string;
  realized_pnl: string;
}

export interface PortfolioData {
  positions: Position[];
  realized_sales: RealizedSale[];
  totals: {
    total_cost: string;
    total_market_value: string;
    total_unrealized_pnl: string;
    total_unrealized_pnl_pct: string;
    total_realized_pnl: string;
    total_cash: string;
    grand_total: string;
  };
}

// ── Settings ─────────────────────────────────────────────────────
export type CostBasisMethod = "FIFO" | "LIFO" | "WAC";
export type GiftCostMode = "ZERO" | "MARKET";

export interface Settings {
  base_currency: string;
  cost_basis_method: CostBasisMethod;
  fiscal_cost_method: CostBasisMethod;
  gift_cost_mode: GiftCostMode;
  rounding_money: number;
  rounding_qty: number;
  price_update_interval: number;
  default_price_source: PriceSource;
  snapshot_frequency: number;
  data_retention_days: number | null;
  purge_portfolio_snapshots: boolean;
  tax_country: string;
}

// ── Reports ──────────────────────────────────────────────────────
export interface YearSummary {
  year: number;
  dividends_gross: string;
  dividends_tax: string;
  dividends_net: string;
  interests_gross: string;
  interests_net: string;
  realized_pnl: string;
  total_income: string;
}

export interface PatrimonioPoint {
  month: string;
  cash: string;
  investments: string;
  investment_pnl: string;
  renta_variable: string;
  renta_fija: string;
}

export interface RVEvolutionPoint {
  captured_at: string;
  value: string;
  cost: string;
  pnl: string;
}

export interface MonthlySaving {
  month: string;
  income: string;
  expenses: string;
  savings: string;
  savings_rate: string;
}

export interface MonthlySavingsData {
  months: MonthlySaving[];
  stats: {
    avg_savings: string;
    avg_savings_rate: string;
    best_month: string;
    worst_month: string;
  };
}

export interface SnapshotStatus {
  last_snapshot: string | null;
  next_snapshot: string | null;
  frequency_minutes: number;
  total_snapshots: number;
}

// ── Tasks ────────────────────────────────────────────────────────
export type TaskStatus = "PENDING" | "STARTED" | "SUCCESS" | "FAILURE";

export interface TaskResult {
  task_id: string;
  status: TaskStatus;
  result?: Record<string, unknown>;
  error?: string;
}

// ── Pagination ───────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ── Charts / Price History ────────────────────────────────────────
export interface OHLCBar {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

// ── Price Update ─────────────────────────────────────────────────
export interface UpdatePricesResult {
  updated: number;
  errors: string[];
  prices: Array<{ ticker: string; name: string; price: string }>;
}

// ── Monthly Savings (detailed) ───────────────────────────────────
export interface MonthlySavingsComment {
  account_name: string;
  date: string;
  note: string;
}

export interface MonthlySavingsPoint {
  month: string;
  cash_end: string;
  cash_delta: string | null;
  investment_cost_end: string;
  investment_cost_delta: string | null;
  real_savings: string | null;
  comments: MonthlySavingsComment[];
}

export interface MonthlySavingsStats {
  current_cash: string;
  last_month_delta: string | null;
  avg_monthly_delta: string | null;
  best_month: MonthlySavingsPoint | null;
  worst_month: MonthlySavingsPoint | null;
}

// ── Annual Savings ──────────────────────────────────────────────
export interface AnnualSavingsPoint {
  year: number;
  total_real_savings: string;
  total_cash_delta: string;
  total_investment_cost_delta: string;
  cash_end: string;
  investment_cost_end: string;
  patrimony: string;
  patrimony_growth: string | null;
  patrimony_growth_pct: string | null;
  months_count: number;
}

// ── Savings Goals ───────────────────────────────────────────────
export interface SavingsGoal {
  id: string;
  name: string;
  target_amount: string;
  base_type: "PATRIMONY" | "CASH";
  deadline: string | null;
  icon: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectionScenario {
  monthly_rate: string;
  months_to_goal: number | null;
  target_date: string | null;
}

export interface SavingsProjection {
  goal: SavingsGoal;
  current_patrimony: string;
  remaining: string;
  avg_monthly_savings: string;
  scenarios: {
    conservative: ProjectionScenario;
    average: ProjectionScenario;
    optimistic: ProjectionScenario;
  };
  on_track: boolean | null;
  deadline_shortfall: string | null;
}

// ── Real Estate ─────────────────────────────────────────────────
export interface Property {
  id: string;
  name: string;
  current_value: string;
  purchase_price: string | null;
  purchase_date: string | null;
  currency: string;
  notes: string;
  original_loan_amount: string | null;
  outstanding_balance: string | null;
  annual_interest_rate: string | null;
  total_term_months: number | null;
  months_paid: number | null;
  monthly_payment: string | null;
  // computed
  net_equity: string;
  amortized_capital: string | null;
  has_mortgage: boolean;
  created_at: string;
  updated_at: string;
}

export interface PropertyFormData {
  name: string;
  current_value: string;
  purchase_price?: string;
  purchase_date?: string;
  currency?: string;
  notes?: string;
  original_loan_amount?: string;
  outstanding_balance?: string;
  annual_interest_rate?: string;
  total_term_months?: number;
  months_paid?: number;
  monthly_payment?: string;
}

export type SimulationStrategy = "REDUCE_PAYMENT" | "REDUCE_TERM";

export interface MortgageSimulationInput {
  outstanding_balance: string;
  annual_interest_rate: string;
  remaining_months: number;
  monthly_payment: string;
  extra_payment: string;
  strategy: SimulationStrategy;
}

export interface SimulationScenario {
  monthly_payment: string;
  remaining_installments: number;
  total_remaining: string;
  total_interest: string;
  remaining_years: number;
  remaining_months: number;
  monthly_interest_rate: string;
}

export interface MortgageSimulationResult {
  monthly_interest_rate: string;
  current: SimulationScenario;
  new: SimulationScenario;
  difference: Omit<SimulationScenario, "monthly_interest_rate">;
  strategy: SimulationStrategy;
}

// ── Amortization Schedule ────────────────────────────────────────
export interface AmortizationRow {
  month: number;
  date: string;
  payment: number;
  principal: number;
  interest: number;
  remainingBalance: number;
  totalInterestPaid: number;
  totalPrincipalPaid: number;
}

export interface AmortizationComparison {
  original: AmortizationRow[];
  modified: AmortizationRow[];
  amortizationMonth: number;
  extraPayment: number;
  strategy: SimulationStrategy;
  savings: {
    interestSaved: number;
    monthsReduced: number;
    newMonthlyPayment: number | null;
    originalEndDate: string;
    newEndDate: string;
  };
}

export interface AmortizationEvent {
  id: string;
  property: string;
  month: number;
  amount: string;
  strategy: SimulationStrategy;
  created_at?: string;
  updated_at?: string;
}

export interface AmortizationEventFormData {
  property: string;
  month: number;
  amount: string;
  strategy: SimulationStrategy;
}

export interface MultiAmortizationResult {
  original: AmortizationRow[];
  modified: AmortizationRow[];
  events: AmortizationEvent[];
  savings: {
    interestSaved: number;
    monthsReduced: number;
    totalExtraPayments: number;
    originalEndDate: string;
    newEndDate: string;
  };
}

// ── Storage ──────────────────────────────────────────────────────
export interface StorageInfo {
  total_mb: number;
  tables: Array<{ table: string; size_mb: number }>;
}

// ── Payroll ──────────────────────────────────────────────────────
export interface Employer {
  id: string;
  name: string;
  cif: string;
  ss_account: string;
  address: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface EmployerFormData {
  name: string;
  cif: string;
  ss_account?: string;
  address?: string;
  notes?: string;
}

export interface Payroll {
  id: string;
  period_start: string;
  period_end: string;
  concept: string;
  employer: string;
  employer_name: string;
  employer_cif: string;
  gross: string;
  ss_employee: string;
  irpf_withholding: string;
  irpf_rate: string | null;
  net: string;
  base_irpf: string | null;
  base_cc: string | null;
  employer_cost: string | null;
  notes: string;
  net_mismatch: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollFormData {
  period_start: string;
  period_end: string;
  concept: string;
  employer: string;
  gross: string;
  ss_employee: string;
  irpf_withholding: string;
  net: string;
  base_irpf?: string;
  base_cc?: string;
  employer_cost?: string;
  notes?: string;
}

/** Payload returned by POST /api/payrolls/parse-pdf/ when the parser succeeds. */
export interface PayrollPdfSuggestion {
  suggested: {
    period_start: string | null;
    period_end: string | null;
    concept: string | null;
    gross: string | null;
    ss_employee: string | null;
    irpf_withholding: string | null;
    net: string | null;
    base_irpf: string | null;
    base_cc: string | null;
    employer_cost: string | null;
    employer_name: string | null;
    employer_cif: string | null;
  };
  confidence: number;
  warnings: string[];
}

// ── Tax declaration (Modo Renta) ─────────────────────────────────
export type {
  TaxDeclaration,
  TaxEmploymentBlock,
  TaxEmploymentByEmployer,
  TaxInterestsBlock,
  TaxInterestEntity,
  TaxDividendsBlock,
  TaxDividendRow,
  TaxDoubleTaxationBlock,
  TaxDoubleTaxationCountry,
  TaxCapitalGainsBlock,
  TaxCapitalGainRow,
  TaxSummary,
  TaxNotice,
} from "./tax";
