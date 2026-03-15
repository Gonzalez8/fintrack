/**
 * Demo price-history (OHLCBar[]) and position-history (AssetPositionPoint[])
 * for all 8 demo assets. Data is generated deterministically.
 */

import type { OHLCBar } from "@/types";

// ── Seeded pseudo-random (deterministic per asset) ───────────────────────────

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── OHLC Generator ──────────────────────────────────────────────────────────

interface AssetPriceConfig {
  id: string;
  startDate: string; // YYYY-MM-DD
  startPrice: number;
  endPrice: number; // current_price
  volatility: number; // daily vol factor (0.01 = 1%)
  seed: number;
}

function generateOHLC(config: AssetPriceConfig): OHLCBar[] {
  const { startDate, startPrice, endPrice, volatility, seed } = config;
  const rand = seededRandom(seed);
  const bars: OHLCBar[] = [];

  const start = new Date(startDate);
  const end = new Date("2025-12-15");
  const totalDays = Math.floor((end.getTime() - start.getTime()) / 86400000);

  // Generate daily prices with drift toward endPrice
  const logReturn = Math.log(endPrice / startPrice) / totalDays;
  let price = startPrice;

  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    // Skip weekends for stocks/ETFs
    if (day !== 0 && day !== 6) {
      const noise = (rand() - 0.5) * 2 * volatility;
      price = price * Math.exp(logReturn + noise);
      // Clamp to avoid negative
      price = Math.max(price * 0.5, price);

      const intraVol = volatility * 0.6;
      const open = price * (1 + (rand() - 0.5) * intraVol);
      const close = price;
      const high = Math.max(open, close) * (1 + rand() * intraVol * 0.5);
      const low = Math.min(open, close) * (1 - rand() * intraVol * 0.5);

      bars.push({
        time: d.toISOString().slice(0, 10),
        open: +open.toFixed(2),
        high: +high.toFixed(2),
        low: +low.toFixed(2),
        close: +close.toFixed(2),
      });
    }
    d.setDate(d.getDate() + 1);
  }

  // Adjust last bar to match exact current price
  if (bars.length > 0) {
    const last = bars[bars.length - 1];
    last.close = endPrice;
    last.high = Math.max(last.high, endPrice);
    last.low = Math.min(last.low, endPrice);
  }

  return bars;
}

// ── Position history generator ───────────────────────────────────────────────

interface PositionSnapshot {
  captured_at: string;
  market_value: string;
  cost_basis: string;
  unrealized_pnl: string;
  unrealized_pnl_pct: string;
  quantity: string;
}

interface PositionConfig {
  assetId: string;
  // Array of {date, quantity_delta, cost_delta} representing buys/sells
  events: { date: string; qtyAfter: number; costBasisAfter: number }[];
  endQuantity: number;
  endCostBasis: number;
}

function generatePositionHistory(
  config: PositionConfig,
  ohlcBars: OHLCBar[],
): PositionSnapshot[] {
  const snapshots: PositionSnapshot[] = [];
  const { events, endQuantity, endCostBasis } = config;

  // Build a map of date → close price from OHLC
  const priceMap = new Map<string, number>();
  for (const bar of ohlcBars) {
    priceMap.set(bar.time, bar.close);
  }

  // Build quantity/cost timeline from events
  const timeline: { date: string; qty: number; cost: number }[] = [];
  for (const ev of events) {
    timeline.push({ date: ev.date, qty: ev.qtyAfter, cost: ev.costBasisAfter });
  }

  // Generate weekly snapshots
  if (timeline.length === 0) return [];

  const startDate = new Date(timeline[0].date);
  const endDate = new Date("2025-12-15");

  let eventIdx = 0;
  let qty = 0;
  let cost = 0;

  const d = new Date(startDate);
  while (d <= endDate) {
    // Advance events
    while (eventIdx < timeline.length && new Date(timeline[eventIdx].date) <= d) {
      qty = timeline[eventIdx].qty;
      cost = timeline[eventIdx].cost;
      eventIdx++;
    }

    if (qty > 0) {
      // Find closest price
      const dateStr = d.toISOString().slice(0, 10);
      let closePrice = 0;
      // Look back up to 5 days for a price
      for (let offset = 0; offset <= 5; offset++) {
        const lookupDate = new Date(d);
        lookupDate.setDate(lookupDate.getDate() - offset);
        const p = priceMap.get(lookupDate.toISOString().slice(0, 10));
        if (p) {
          closePrice = p;
          break;
        }
      }

      if (closePrice > 0) {
        const mv = qty * closePrice;
        const pnl = mv - cost;
        const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;

        snapshots.push({
          captured_at: `${dateStr}T00:00:00Z`,
          market_value: mv.toFixed(2),
          cost_basis: cost.toFixed(2),
          unrealized_pnl: pnl.toFixed(2),
          unrealized_pnl_pct: pnlPct.toFixed(2),
          quantity: qty.toFixed(4),
        });
      }
    }

    // Advance by 7 days (weekly snapshots)
    d.setDate(d.getDate() + 7);
  }

  // Ensure last snapshot matches current position
  if (snapshots.length > 0 && endQuantity > 0) {
    const last = snapshots[snapshots.length - 1];
    last.quantity = endQuantity.toFixed(4);
    last.cost_basis = endCostBasis.toFixed(2);
  }

  return snapshots;
}

// ── Asset configurations ─────────────────────────────────────────────────────

const assetConfigs: AssetPriceConfig[] = [
  { id: "a1b2c3d4-1111-4000-a000-000000000001", startDate: "2023-01-10", startPrice: 130, endPrice: 227.48, volatility: 0.018, seed: 11111 },
  { id: "a1b2c3d4-2222-4000-a000-000000000002", startDate: "2023-02-15", startPrice: 240, endPrice: 438.12, volatility: 0.016, seed: 22222 },
  { id: "a1b2c3d4-3333-4000-a000-000000000003", startDate: "2023-03-01", startPrice: 360, endPrice: 542.30, volatility: 0.012, seed: 33333 },
  { id: "a1b2c3d4-4444-4000-a000-000000000004", startDate: "2023-03-15", startPrice: 70, endPrice: 94.56, volatility: 0.010, seed: 44444 },
  { id: "a1b2c3d4-5555-4000-a000-000000000005", startDate: "2023-06-01", startPrice: 25000, endPrice: 95420, volatility: 0.035, seed: 55555 },
  { id: "a1b2c3d4-6666-4000-a000-000000000006", startDate: "2023-09-01", startPrice: 4.20, endPrice: 4.82, volatility: 0.014, seed: 66666 },
  { id: "a1b2c3d4-7777-4000-a000-000000000007", startDate: "2024-01-15", startPrice: 250, endPrice: 358.74, volatility: 0.025, seed: 77777 },
  { id: "a1b2c3d4-8888-4000-a000-000000000008", startDate: "2024-03-01", startPrice: 80, endPrice: 134.50, volatility: 0.028, seed: 88888 },
];

// Position event timelines (derived from transactions, FIFO cost basis)
const positionConfigs: PositionConfig[] = [
  {
    assetId: "a1b2c3d4-1111-4000-a000-000000000001", // AAPL
    endQuantity: 25, endCostBasis: 4070.75,
    events: [
      { date: "2023-01-20", qtyAfter: 25, costBasisAfter: 3564.25 },
      { date: "2023-07-20", qtyAfter: 35, costBasisAfter: 5496.45 },
      { date: "2024-04-15", qtyAfter: 25, costBasisAfter: 4070.75 },
    ],
  },
  {
    assetId: "a1b2c3d4-2222-4000-a000-000000000002", // MSFT
    endQuantity: 20, endCostBasis: 5903.05,
    events: [
      { date: "2023-02-18", qtyAfter: 15, costBasisAfter: 3824.05 },
      { date: "2025-05-05", qtyAfter: 20, costBasisAfter: 5903.05 },
    ],
  },
  {
    assetId: "a1b2c3d4-3333-4000-a000-000000000003", // VOO
    endQuantity: 25, endCostBasis: 10985.95,
    events: [
      { date: "2023-03-10", qtyAfter: 12, costBasisAfter: 4503.00 },
      { date: "2024-05-20", qtyAfter: 20, costBasisAfter: 8334.70 },
      { date: "2025-03-10", qtyAfter: 25, costBasisAfter: 10985.95 },
    ],
  },
  {
    assetId: "a1b2c3d4-4444-4000-a000-000000000004", // IWDA
    endQuantity: 230, endCostBasis: 18479.60,
    events: [
      { date: "2023-04-05", qtyAfter: 80, costBasisAfter: 5945.60 },
      { date: "2023-10-05", qtyAfter: 140, costBasisAfter: 10511.60 },
      { date: "2024-09-10", qtyAfter: 190, costBasisAfter: 14831.60 },
      { date: "2025-06-15", qtyAfter: 230, costBasisAfter: 18479.60 },
    ],
  },
  {
    assetId: "a1b2c3d4-5555-4000-a000-000000000005", // BTC
    endQuantity: 0.07, endCostBasis: 2488.88,
    events: [
      { date: "2023-06-15", qtyAfter: 0.05, costBasisAfter: 1399.46 },
      { date: "2024-08-15", qtyAfter: 0.07, costBasisAfter: 2488.88 },
    ],
  },
  {
    assetId: "a1b2c3d4-6666-4000-a000-000000000006", // AEEM
    endQuantity: 500, endCostBasis: 2225.00,
    events: [
      { date: "2023-09-12", qtyAfter: 500, costBasisAfter: 2225.00 },
    ],
  },
  {
    assetId: "a1b2c3d4-7777-4000-a000-000000000007", // CRWD
    endQuantity: 5, endCostBasis: 1312.62,
    events: [
      { date: "2024-01-22", qtyAfter: 8, costBasisAfter: 2100.20 },
      { date: "2024-07-10", qtyAfter: 5, costBasisAfter: 1312.62 },
    ],
  },
  {
    assetId: "a1b2c3d4-8888-4000-a000-000000000008", // NVDA
    endQuantity: 45, endCostBasis: 4555.62,
    events: [
      { date: "2024-03-05", qtyAfter: 40, costBasisAfter: 3501.80 },
      { date: "2025-01-15", qtyAfter: 60, costBasisAfter: 5868.80 },
      { date: "2025-02-20", qtyAfter: 45, costBasisAfter: 4555.62 },
    ],
  },
];

// ── Generate and export ──────────────────────────────────────────────────────

// Price history keyed by asset ID
const _priceHistoryCache = new Map<string, OHLCBar[]>();

export function getDemoPriceHistory(assetId: string): OHLCBar[] {
  if (_priceHistoryCache.size === 0) {
    for (const cfg of assetConfigs) {
      _priceHistoryCache.set(cfg.id, generateOHLC(cfg));
    }
  }
  return _priceHistoryCache.get(assetId) ?? [];
}

// Position history keyed by asset ID
const _positionHistoryCache = new Map<string, PositionSnapshot[]>();

export function getDemoPositionHistory(assetId: string): PositionSnapshot[] {
  if (_positionHistoryCache.size === 0) {
    for (const pcfg of positionConfigs) {
      const ohlc = getDemoPriceHistory(pcfg.assetId);
      _positionHistoryCache.set(pcfg.assetId, generatePositionHistory(pcfg, ohlc));
    }
  }
  return _positionHistoryCache.get(assetId) ?? [];
}
