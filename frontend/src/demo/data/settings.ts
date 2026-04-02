import type { Settings } from "@/types";

export const demoSettings: Settings = {
  base_currency: "EUR",
  cost_basis_method: "FIFO",
  gift_cost_mode: "ZERO",
  rounding_money: 2,
  rounding_qty: 4,
  price_update_interval: 60,
  default_price_source: "YAHOO",
  snapshot_frequency: 60,
  fiscal_cost_method: "FIFO",
  data_retention_days: null,
  purge_portfolio_snapshots: true,
};
