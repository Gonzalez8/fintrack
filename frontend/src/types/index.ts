// ── Auth ─────────────────────────────────────────────────────────
export interface User {
  id: number;
  username: string;
  email: string;
  avatar_version?: number | null;
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
  avatar_version?: number | null;
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
  /** Product of applied splits after this trade: shares today = quantity × split_factor. */
  split_factor?: string | null;
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
  /** Withheld at source (abroad for foreign assets). */
  tax: string;
  /** Retention of the fiscal-residence country added by a local payer/broker (e.g. Spanish 19 %). */
  domestic_tax: string;
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
  domestic_tax?: string;
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

// ── Other income ─────────────────────────────────────────────────
export type OtherIncomeCategory = "RENTAL" | "SELF_EMPLOYMENT" | "SIDE_JOB" | "GIFT" | "OTHER";

export interface OtherIncome {
  id: string;
  date: string;
  category: OtherIncomeCategory;
  description: string;
  amount: string;
  account: string | null;
  account_name: string | null;
  /** Rent payment of this lease */
  lease: string | null;
  property_name: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface OtherIncomeFormData {
  date: string;
  category: OtherIncomeCategory;
  description: string;
  amount: string;
  account: string | null;
  lease?: string | null;
  notes: string;
}

// ── Rental ───────────────────────────────────────────────────────
export type LeaseReduction = "PRE_2023" | "GENERAL" | "RENT_DROP" | "YOUNG" | "REHAB" | "NONE";

export interface Lease {
  id: string;
  property: string;
  property_name: string;
  tenant: string;
  start_date: string;
  end_date: string | null;
  monthly_rent: string;
  deposit: string | null;
  reduction: LeaseReduction;
  rented_share_pct: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type RentalExpenseCategory =
  | "TAXES"
  | "COMMUNITY"
  | "INSURANCE"
  | "REPAIRS"
  | "FINANCING"
  | "UTILITIES"
  | "SERVICES"
  | "IMPROVEMENT"
  | "OTHER";

export interface RentalExpense {
  id: string;
  property: string;
  property_name: string;
  date: string;
  category: RentalExpenseCategory;
  amount: string;
  description: string;
  created_at: string;
}

/** Figures of one property-year fed to the rental tax calculation (all money as strings). */
export interface RentalInputs {
  year: number;
  income: string;
  days_rented: number;
  days_vacant: number;
  rented_share_pct: string;
  ownership_pct: string;
  financing: string;
  repairs: string;
  taxes: string;
  community: string;
  insurance: string;
  utilities: string;
  services: string;
  other: string;
  acquisition_price: string | null;
  acquisition_costs: string;
  cadastral_value: string | null;
  cadastral_construction_value: string | null;
  cadastral_revised: boolean;
  improvements: string;
  furniture_value: string;
  reduction_pct: string;
  pending_excess: string;
  other_general_base: string;
  /** Days the figures cover; null = the whole year */
  period_days?: number | null;
}

export interface RentalResult {
  income: string;
  capped_expenses: string;
  capped_applied: string;
  excess_carry_forward: string;
  other_expenses: string;
  expenses_detail: Record<string, string>;
  depreciation: string;
  furniture_depreciation: string;
  net: string;
  reduction_pct: string;
  reduction: string;
  net_reduced: string;
  imputation: string;
  taxable: string;
  other_general_base: string;
  marginal_rate: string;
  estimated_tax: string;
  effective_rate_on_income: string | null;
  paid_expenses: string;
  cash_result: string;
  days_rented: number;
  days_vacant: number;
  warnings: string[];
}

export interface RentalOverviewProperty {
  property: { id: string; name: string };
  leases: Pick<Lease, "id" | "tenant" | "start_date" | "end_date" | "monthly_rent" | "reduction">[];
  missing_months: string[];
  to_date: { inputs: RentalInputs; result: RentalResult };
  projected: { inputs: RentalInputs; estimated: string[]; result: RentalResult };
}

export interface RentalOverview {
  year: number;
  other_general_base: string;
  other_general_base_projected: boolean;
  properties: RentalOverviewProperty[];
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
  /** Applied splits of this asset, oldest first. */
  splits?: PositionSplit[];
}

export interface PositionSplit {
  date: string;
  ratio_from: string;
  ratio_to: string;
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
  /** When the sale was recorded in Fintrack (ISO datetime) */
  recorded_at?: string;
}

export interface PortfolioAccount {
  account_id: string;
  account_name: string;
  account_type: AccountType;
  balance: string;
}

export interface PortfolioData {
  positions: Position[];
  accounts?: PortfolioAccount[];
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
  /** Backend URL the MCP calls; empty = suggest the web host on port 8001. */
  mcp_backend_url?: string;
}

// ── Reports ──────────────────────────────────────────────────────
export interface YearSummary {
  year: number;
  dividends_gross: string;
  /** Everything withheld: at source + domestic retention. */
  dividends_tax: string;
  dividends_tax_domestic: string;
  dividends_net: string;
  interests_gross: string;
  interests_net: string;
  realized_pnl: string;
  payroll_gross: string;
  payroll_net: string;
  /** Investments only: dividends_net + interests_net + realized_pnl. */
  total_income: string;
  /** total_income + payroll_net. */
  total_with_payroll: string;
}

export interface PatrimonioPoint {
  month: string;
  /** Cash of the month's photo minus money moved into investments after it (so nothing counts twice) */
  cash: string;
  /** Cash exactly as photographed */
  cash_snapshot?: string;
  investments: string;
  investment_pnl: string;
  renta_variable: string;
  renta_fija: string;
}

export interface InvestmentCostPoint {
  month: string; // YYYY-MM
  cost: string; // invested at month end (cost of open positions)
  delta: string; // change in the month: buys add, sales remove the cost sold
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
  /** Last successful automatic price update */
  prices_updated_at?: string | null;
  /** Automatic prices overdue (background tasks not running) */
  prices_stale?: boolean;
}

// ── Tasks ────────────────────────────────────────────────────────
export type TaskStatus = "PENDING" | "STARTED" | "SUCCESS" | "FAILURE";

export interface TaskResult {
  task_id: string;
  status: TaskStatus;
  result?: Record<string, unknown>;
  error?: string;
}

// ── Stock splits ─────────────────────────────────────────────────
export type StockSplitStatus = "PENDING" | "APPLIED" | "DISMISSED";

export interface StockSplit {
  id: string;
  date: string;
  asset: string;
  asset_name: string;
  asset_ticker: string | null;
  ratio_from: string;
  ratio_to: string;
  status: StockSplitStatus;
  source: "MANUAL" | "AUTO";
  created_at: string;
  updated_at: string;
}

export type PositionHistoryEvent =
  | {
      kind: TransactionType;
      id: string;
      date: string;
      account_name: string;
      quantity: string;
      price: string | null;
      quantity_after: string;
    }
  | {
      kind: "SPLIT";
      id: string;
      date: string;
      status: StockSplitStatus;
      ratio_from: string;
      ratio_to: string;
      quantity_after: string;
    };

export interface PositionHistory {
  quantity: string;
  events: PositionHistoryEvent[];
}

// ── Dividend drafts ──────────────────────────────────────────────
export interface DividendSuggestion {
  id: string;
  asset: string;
  asset_name: string;
  asset_ticker: string | null;
  asset_currency: string;
  /** Ex-dividend date from Yahoo; the payment usually comes days later. */
  ex_date: string;
  amount_per_share: string;
  /** Currency of the Yahoo quote the amounts are in. */
  currency: string;
  shares: string;
  gross: string;
  /** Estimated from past dividends of the asset; null when unknown. */
  tax: string | null;
  /** Estimated domestic retention from past dividends; null when none. */
  domestic_tax: string | null;
  net: string;
  status: "PENDING" | "ACCEPTED" | "DISMISSED";
  dividend: string | null;
  created_at: string;
  updated_at: string;
}

// ── API tokens (MCP) ─────────────────────────────────────────────
export type ApiTokenScope = "READ" | "WRITE";

export interface ApiToken {
  id: string;
  name: string;
  scope: ApiTokenScope;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  /** Only present in the response that creates the token. */
  key?: string;
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
  income_payroll: string;
  income_other: string;
  income_investment: string;
  income_total: string;
  /** income_total − real_savings; null without income or without a previous month */
  estimated_spending: string | null;
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
  income_payroll: string;
  income_other: string;
  income_investment: string;
  total_income: string;
  total_estimated_spending: string | null;
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
  // rental / tax data
  acquisition_costs?: string | null;
  cadastral_value?: string | null;
  cadastral_construction_value?: string | null;
  cadastral_revised?: boolean;
  furniture_value?: string | null;
  ownership_pct?: string;
  // computed
  net_equity: string;
  amortized_capital: string | null;
  has_mortgage: boolean;
  created_at: string;
  updated_at: string;
  /** NONE, ACTIVE or FINISHED (paid off, early amortizations included). */
  mortgage_status?: "NONE" | "ACTIVE" | "FINISHED";
  /** Still paying (has_mortgage only means mortgage data exists). */
  has_active_mortgage?: boolean;
  /** Calendar months since the start, capped at the term — the schedule's "today". */
  months_elapsed?: number | null;
  /** Payment due next month (after amortizations); "0" when finished. */
  current_monthly_payment?: string | null;
  /** YYYY-MM of the last payment, when the purchase date is known. */
  mortgage_end_date?: string | null;
  extra_amortizations?: string | null;
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

/** Machine-readable payroll classification. Mirrors `Payroll.PayrollType`
 * in the backend. `MONTHLY` is the default for vanilla monthly payslips.
 * BONUS bundles bonus / variable / pagas extra into a single bucket
 * (non-monthly extra payments) — see the backend docstring for the
 * reasoning. */
export type PayrollType = "MONTHLY" | "BONUS" | "ATRASOS" | "OTHER";

export const PAYROLL_TYPES: PayrollType[] = [
  "MONTHLY",
  "BONUS",
  "ATRASOS",
  "OTHER",
];

export interface Payroll {
  id: string;
  period_start: string;
  period_end: string;
  concept: string;
  payroll_type: PayrollType;
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
  payroll_type: PayrollType;
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

/** Single row in a bulk-create request to POST /api/payrolls/bulk-create/. */
export type BulkPayrollItem = Omit<PayrollFormData, "base_irpf" | "base_cc" | "employer_cost" | "notes"> & {
  base_irpf?: string | null;
  base_cc?: string | null;
  employer_cost?: string | null;
  notes?: string;
};

export interface BulkPayrollCreateResponse {
  created: Payroll[];
}

export interface BulkPayrollCreateErrorResponse {
  errors: Array<Record<string, string[]> | null>;
}

/** Payload returned by POST /api/payrolls/parse-pdf/ when the parser succeeds. */
export interface PayrollPdfSuggestion {
  suggested: {
    period_start: string | null;
    period_end: string | null;
    concept: string | null;
    payroll_type: PayrollType;
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
  TaxRentalBlock,
  TaxRentalProperty,
  TaxSummary,
  TaxNotice,
} from "./tax";

// ---- Returns (XIRR) and benchmark ----

/** Money-weighted figures of the portfolio, one asset or the benchmark replay */
export interface ReturnsSummary {
  first_date: string | null;
  /** Money put in (buys with costs, gifts at their value) */
  invested: string;
  /** Money taken out (sales, net dividends) */
  returned: string;
  market_value: string;
  /** market_value + returned − invested */
  total_gain: string;
  /** Annualized money-weighted return (XIRR), % */
  xirr_pct: string | null;
  /** False with less than a year of history */
  reliable: boolean;
}

export interface AssetReturn extends ReturnsSummary {
  asset_id: string;
  asset_name: string;
  asset_ticker: string | null;
  is_open: boolean;
}

export interface BenchmarkReturn extends ReturnsSummary {
  key: string;
  name: string;
  ticker: string;
  price_date: string;
  /** Some operations are older than the ETF; they were priced at its first close */
  starts_late: boolean;
}

export interface ReturnsData {
  as_of: string;
  portfolio: ReturnsSummary;
  assets: AssetReturn[];
  benchmark: BenchmarkReturn | null;
  benchmarks: { key: string; name: string; ticker: string }[];
}

// ---- Sale simulation ----

export interface SaleSimulationLot {
  /** Purchase date; null with the average-cost (WAC) method */
  date: string | null;
  quantity_held: string;
  quantity_sold: string;
  unit_cost: string;
  cost: string;
  gain: string;
}

/** Spanish estimate (base del ahorro) of the extra tax a sale adds to the year */
export interface SaleTaxEstimate {
  country: string;
  year: number;
  gains_ytd: string;
  income_ytd: string;
  tax_before: string;
  tax_after: string;
  tax_sale: string;
  /** Only for a loss: buys of the asset in the last two months, and until when a rebuy would defer it */
  wash_sale: { recent_buys: { date: string; quantity: string }[]; rebuy_until: string } | null;
}

export interface SaleSimulation {
  asset: { id: string; name: string; ticker: string | null; currency: string; held: string; current_price: string | null };
  method: CostBasisMethod;
  date: string;
  quantity: string;
  price: string;
  commission: string;
  proceeds: string;
  cost_basis: string;
  gain: string;
  lots: SaleSimulationLot[];
  tax: SaleTaxEstimate | null;
}
