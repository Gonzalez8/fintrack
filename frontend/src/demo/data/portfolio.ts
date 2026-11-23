import type { BenchmarkPoint, PortfolioData, ReturnsData, SaleSimulation } from "@/types";
import { demoAccounts } from "./accounts";

// Positions reflect net holdings after buys and sells (FIFO):
// AAPL: bought 25+10=35, sold 10 → 25 shares (cost 4070.75)
// MSFT: bought 15+5=20, sold 0 → 20 shares (cost 5903.05)
// VOO: bought 12+8+5=25, sold 0 → 25 shares (cost 10985.95)
// IWDA: bought 80+60+50+40=230, sold 0 → 230 shares (cost 18479.60)
// BTC: bought 0.05+0.02=0.07, sold 0 → 0.07 (cost 2488.88)
// AEEM: bought 500, sold 0 → 500 shares (cost 2225.00)
// CRWD: bought 8, sold 3 → 5 shares (cost 1312.62)
// NVDA: bought 40+20=60, sold 15 → 45 shares (cost 4555.62)

export const demoPortfolio: PortfolioData = {
  accounts: demoAccounts.map((a) => ({
    account_id: a.id,
    account_name: a.name,
    account_type: a.type,
    balance: a.balance,
  })),
  positions: [
    {
      asset_id: "a1b2c3d4-1111-4000-a000-000000000001",
      asset_name: "Apple Inc.",
      asset_ticker: "AAPL",
      asset_type: "STOCK",
      currency: "USD",
      quantity: "25.0000",
      avg_cost: "162.83",
      cost_basis: "4070.75",
      current_price: "227.48",
      market_value: "5687.00",
      unrealized_pnl: "1616.25",
      unrealized_pnl_pct: "39.71",
      weight: "8.53",
    },
    {
      asset_id: "a1b2c3d4-2222-4000-a000-000000000002",
      asset_name: "Microsoft Corporation",
      asset_ticker: "MSFT",
      asset_type: "STOCK",
      currency: "USD",
      quantity: "20.0000",
      avg_cost: "295.15",
      cost_basis: "5903.05",
      current_price: "438.12",
      market_value: "8762.40",
      unrealized_pnl: "2859.35",
      unrealized_pnl_pct: "48.44",
      weight: "13.14",
    },
    {
      asset_id: "a1b2c3d4-3333-4000-a000-000000000003",
      asset_name: "Vanguard S&P 500 ETF",
      asset_ticker: "VOO",
      asset_type: "ETF",
      currency: "USD",
      quantity: "25.0000",
      avg_cost: "439.44",
      cost_basis: "10985.95",
      current_price: "542.30",
      market_value: "13557.50",
      unrealized_pnl: "2571.55",
      unrealized_pnl_pct: "23.41",
      weight: "20.33",
    },
    {
      asset_id: "a1b2c3d4-4444-4000-a000-000000000004",
      asset_name: "iShares MSCI World UCITS ETF",
      asset_ticker: "IWDA.AS",
      asset_type: "ETF",
      currency: "EUR",
      quantity: "230.0000",
      avg_cost: "80.35",
      cost_basis: "18479.60",
      current_price: "94.56",
      market_value: "21748.80",
      unrealized_pnl: "3269.20",
      unrealized_pnl_pct: "17.69",
      weight: "32.61",
    },
    {
      asset_id: "a1b2c3d4-5555-4000-a000-000000000005",
      asset_name: "Bitcoin",
      asset_ticker: "BTC-EUR",
      asset_type: "CRYPTO",
      currency: "EUR",
      quantity: "0.0700",
      avg_cost: "35555.43",
      cost_basis: "2488.88",
      current_price: "95420.00",
      market_value: "6679.40",
      unrealized_pnl: "4190.52",
      unrealized_pnl_pct: "168.37",
      weight: "10.02",
    },
    {
      asset_id: "a1b2c3d4-6666-4000-a000-000000000006",
      asset_name: "Amundi MSCI Emerging Markets UCITS ETF",
      asset_ticker: "AEEM.PA",
      asset_type: "ETF",
      currency: "EUR",
      quantity: "500.0000",
      avg_cost: "4.45",
      cost_basis: "2225.00",
      current_price: "4.82",
      market_value: "2410.00",
      unrealized_pnl: "185.00",
      unrealized_pnl_pct: "8.31",
      weight: "3.61",
    },
    {
      asset_id: "a1b2c3d4-7777-4000-a000-000000000007",
      asset_name: "CrowdStrike Holdings",
      asset_ticker: "CRWD",
      asset_type: "STOCK",
      currency: "USD",
      quantity: "5.0000",
      avg_cost: "262.52",
      cost_basis: "1312.62",
      current_price: "358.74",
      market_value: "1793.70",
      unrealized_pnl: "481.08",
      unrealized_pnl_pct: "36.66",
      weight: "2.69",
    },
    {
      asset_id: "a1b2c3d4-8888-4000-a000-000000000008",
      asset_name: "NVIDIA Corporation",
      asset_ticker: "NVDA",
      asset_type: "STOCK",
      currency: "USD",
      quantity: "45.0000",
      avg_cost: "101.24",
      cost_basis: "4555.62",
      current_price: "134.50",
      market_value: "6052.50",
      unrealized_pnl: "1496.88",
      unrealized_pnl_pct: "32.86",
      weight: "9.08",
    },
  ],
  realized_sales: [
    {
      date: "2024-04-15",
      asset_name: "Apple Inc.",
      asset_ticker: "AAPL",
      quantity: "10.0000",
      sell_price: "185.20",
      cost_basis: "1425.70",
      proceeds: "1851.00",
      realized_pnl: "425.30",
    },
    {
      date: "2024-07-10",
      asset_name: "CrowdStrike Holdings",
      asset_ticker: "CRWD",
      quantity: "3.0000",
      sell_price: "392.15",
      cost_basis: "787.58",
      proceeds: "1175.45",
      realized_pnl: "387.87",
    },
    {
      date: "2025-02-20",
      asset_name: "NVIDIA Corporation",
      asset_ticker: "NVDA",
      quantity: "15.0000",
      sell_price: "131.80",
      cost_basis: "1313.18",
      proceeds: "1976.00",
      realized_pnl: "662.82",
    },
  ],
  totals: {
    total_cost: "50021.47",
    total_market_value: "66691.30",
    total_unrealized_pnl: "16669.83",
    total_unrealized_pnl_pct: "33.33",
    total_realized_pnl: "1475.99",
    total_cash: "9486.18",
    grand_total: "76177.48",
  },
};

// Illustrative month-end series from 2023-01-16 to 2026-03-07: steady contributions, the index rising smoothly and
// the portfolio swinging more around it, ending at the figures below (value + dividends, index value)
function demoBenchmarkSeries(): BenchmarkPoint[] {
  const days: string[] = ["2023-01-16"];
  for (let y = 2023, m = 1; y < 2026 || m < 3; ) {
    days.push(new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  days.push("2026-03-07");
  const n = days.length - 1;
  return days.map((date, i) => {
    const f = i / n;
    const contributed = 48250 * Math.min(1, (i + 1) / (n - 2));
    const index = contributed * (1 + 0.246 * f * f) * (1 + 0.03 * Math.sin(i / 2.5));
    const mine = contributed * (1 + 0.207 * f * f) * (1 + 0.07 * Math.sin(i / 1.8 + 0.6));
    const end = i === n;
    return {
      date,
      contributed: contributed.toFixed(2),
      portfolio: end ? "58240.60" : mine.toFixed(2),
      benchmark: end ? "60120.00" : index.toFixed(2),
    };
  });
}

// Illustrative returns for the demo (not computed from the operations above)
export const demoReturns: ReturnsData = {
  as_of: "2026-03-07",
  portfolio: {
    first_date: "2023-01-16", invested: "52480.00", returned: "6120.40", market_value: "56350.20",
    total_gain: "9990.60", xirr_pct: "8.41", reliable: true,
  },
  // Same ids as the demo positions, so a position's dialog shows its "% a year" (illustrative rate)
  assets: demoPortfolio.positions.map((p, i) => ({
    asset_id: p.asset_id,
    asset_name: p.asset_name,
    asset_ticker: p.asset_ticker,
    is_open: true,
    first_date: `2023-0${(i % 9) + 1}-15`,
    invested: p.cost_basis,
    returned: "0.00",
    market_value: p.market_value,
    total_gain: p.unrealized_pnl,
    xirr_pct: (parseFloat(p.unrealized_pnl_pct) / 2.6).toFixed(2),
    reliable: true,
  })),
  benchmark: {
    key: "msci_world", name: "MSCI World", ticker: "EUNL.DE", price_date: "2026-03-06", starts_late: false,
    series: demoBenchmarkSeries(),
    first_date: "2023-01-16", invested: "52480.00", returned: "4230.00", market_value: "60120.00",
    total_gain: "11870.00", xirr_pct: "9.62", reliable: true,
  },
  benchmarks: [
    { key: "msci_world", name: "MSCI World", ticker: "EUNL.DE" },
    { key: "sp500", name: "S&P 500", ticker: "SXR8.DE" },
    { key: "all_world", name: "FTSE All-World", ticker: "VWCE.DE" },
  ],
};

// What-if sale for the demo, computed from the demo position (one averaged lot) and the requested figures
export function demoSaleSimulation(params: URLSearchParams): SaleSimulation {
  const pos = demoPortfolio.positions.find((p) => p.asset_id === params.get("asset_id")) ?? demoPortfolio.positions[0];
  const held = parseFloat(pos.quantity);
  const qty = Math.min(parseFloat(params.get("quantity") ?? "") || held, held);
  const price = parseFloat(params.get("price") ?? "") || parseFloat(pos.current_price);
  const commission = parseFloat(params.get("commission") ?? "") || 0;
  const unit = parseFloat(pos.avg_cost);
  const cost = qty * unit;
  const proceeds = qty * price - commission;
  const gain = proceeds - cost;
  const gainsYtd = 420;
  const incomeYtd = 310.5;
  const offsetGains = gain < 0 ? Math.min(-gain, gainsYtd) : 0;
  const offsetIncome = gain < 0 ? Math.min(-gain - offsetGains, incomeYtd * 0.25) : 0;
  const taxSale = gain >= 0 ? gain * 0.19 : -(offsetGains + offsetIncome) * 0.19;
  const m = (v: number) => v.toFixed(2);
  return {
    asset: { id: pos.asset_id, name: pos.asset_name, ticker: pos.asset_ticker, currency: pos.currency, held: pos.quantity, current_price: pos.current_price },
    method: "FIFO",
    date: "2026-03-07",
    quantity: String(qty),
    price: String(price),
    commission: m(commission),
    proceeds: m(proceeds),
    cost_basis: m(cost),
    gain: m(gain),
    lots: [{ date: null, quantity_held: pos.quantity, quantity_sold: String(qty), unit_cost: m(unit), cost: m(cost), gain: m(gain) }],
    tax: {
      country: "ES", year: 2026, gains_ytd: m(gainsYtd), income_ytd: m(incomeYtd),
      tax_before: "138.70", tax_after: m(138.7 + taxSale), tax_sale: m(taxSale),
      loss_offset: gain < 0 ? { gains: m(offsetGains), income: m(offsetIncome), carried_forward: m(-gain - offsetGains - offsetIncome) } : null,
      wash_sale: gain < 0 ? { recent_buys: [], rebuy_until: "2026-05-07" } : null,
    },
  };
}
