export interface TaxInterestEntity {
  name: string;
  gross: string;
  withholding: string;
  commission: string;
  net: string;
}

export interface TaxInterestsBlock {
  casilla: string;
  gross: string;
  withholding: string;
  commission: string;
  net: string;
  by_entity: TaxInterestEntity[];
}

export interface TaxDividendRow {
  country: string;
  entity: string;
  is_es: boolean;
  gross: string;
  withholding: string;
  commission: string;
  net: string;
}

export interface TaxDividendsBlock {
  casilla: string;
  gross_total: string;
  withholding_es: string;
  withholding_total: string;
  commission: string;
  net_informative: string;
  by_country_entity: TaxDividendRow[];
}

export interface TaxDoubleTaxationCountry {
  country: string;
  gross: string;
  withholding: string;
  rate_applied: string;
  is_default_rate: boolean;
  limit: string;
  deductible: string;
}

export interface TaxDoubleTaxationBlock {
  casilla: string;
  foreign_gross_total: string;
  deductible_total: string;
  by_country: TaxDoubleTaxationCountry[];
}

export interface TaxCapitalGainRow {
  date: string;
  asset_name: string;
  asset_ticker: string;
  quantity: string;
  transmission: string;
  acquisition: string;
  pnl: string;
  oversell_quantity: string;
}

export interface TaxCapitalGainsBlock {
  casilla: string;
  transmission_total: string;
  acquisition_total: string;
  total_gains: string;
  total_losses: string;
  net_result: string;
  rows: TaxCapitalGainRow[];
}

export interface TaxEmploymentByEmployer {
  name: string;
  cif: string;
  gross: string;
  ss_deductible: string;
  withholding: string;
  net: string;
}

export interface TaxEmploymentBlock {
  casilla: string;
  gross: string;
  ss_deductible: string;
  withholding: string;
  net_informative: string;
  by_employer: TaxEmploymentByEmployer[];
}

export interface TaxSummary {
  interests_gross: string;
  interests_withholding: string;
  dividends_gross: string;
  dividends_withholding_es: string;
  dividends_commission: string;
  double_taxation_foreign_gross: string;
  double_taxation_deductible: string;
  sales_transmission: string;
  sales_acquisition: string;
  sales_net: string;
  employment_gross: string;
  employment_ss_deductible: string;
  employment_withholding: string;
}

export interface TaxNotice {
  kind: string;
  scope?: string;
  message: string;
}

export interface TaxDeclaration {
  year: number;
  interests: TaxInterestsBlock;
  dividends: TaxDividendsBlock;
  double_taxation: TaxDoubleTaxationBlock;
  capital_gains: TaxCapitalGainsBlock;
  employment_income: TaxEmploymentBlock;
  summary: TaxSummary;
  warnings: TaxNotice[];
  infos: TaxNotice[];
}
