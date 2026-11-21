import type { RealizedSale } from "@/types";

/**
 * Whether a snapshot taken at `capturedAt` already reflects a sale.
 *
 * A snapshot is a photo: on the day of a sale, the photos taken before it was recorded still hold
 * the open position (its gain is in the unrealized P&L). On later days the sale always counts, so
 * backdated or restored sales (recorded after their date) never take gains away from older photos.
 */
export function includesSale(sale: { date: string; recorded_at?: string }, capturedAt: string): boolean {
  const day = capturedAt.slice(0, 10);
  if (sale.date !== day) return sale.date < day;
  return !sale.recorded_at || Date.parse(capturedAt) >= Date.parse(sale.recorded_at);
}

/** Realized gain and sold cost a snapshot already reflects. `sales` sorted by date. */
export function realizedUntil(sales: RealizedSale[], capturedAt: string) {
  let realized = 0;
  let soldCost = 0;
  for (const s of sales) {
    if (s.date > capturedAt.slice(0, 10)) break;
    if (!includesSale(s, capturedAt)) continue;
    realized += parseFloat(s.realized_pnl);
    soldCost += parseFloat(s.cost_basis);
  }
  return { realized, soldCost };
}
