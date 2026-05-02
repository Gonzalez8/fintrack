/**
 * Demo price-history (OHLCBar[]) for all 8 demo assets.
 * Data is generated deterministically.
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
