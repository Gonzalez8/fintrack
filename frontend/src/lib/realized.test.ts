import { describe, expect, it } from "vitest";
import { includesSale, localDay, realizedUntil } from "./realized";
import type { RealizedSale } from "@/types";

const sale = (date: string, pnl: string, cost: string, recorded_at?: string): RealizedSale => ({
  date, asset_name: "TeamViewer", asset_ticker: null, quantity: "370", sell_price: "7.11",
  cost_basis: cost, proceeds: "0", realized_pnl: pnl, recorded_at,
});

describe("includesSale", () => {
  const s = { date: "2026-11-02", recorded_at: "2026-11-02T19:55:31+00:00" };

  it("skips photos of the sale day taken before it was recorded", () => {
    expect(includesSale(s, "2026-11-02T08:15:00+00:00")).toBe(false);
    expect(includesSale(s, "2026-11-02T19:41:00+00:00")).toBe(false);
  });

  it("counts photos taken after it was recorded", () => {
    expect(includesSale(s, "2026-11-02T20:12:00+00:00")).toBe(true);
  });

  it("always counts on later days and never before the sale", () => {
    const late = { date: "2026-11-02", recorded_at: "2026-11-09T10:00:00+00:00" };
    expect(includesSale(late, "2026-11-03T08:00:00+00:00")).toBe(true);
    expect(includesSale(late, "2026-11-01T22:00:00+00:00")).toBe(false);
  });

  it("counts the whole day when the recording time is unknown", () => {
    expect(includesSale({ date: "2026-11-02" }, "2026-11-02T00:10:00+00:00")).toBe(true);
  });
});

describe("realizedUntil", () => {
  const sales = [
    sale("2026-10-01", "2.62", "100", "2026-10-01T10:00:00+00:00"),
    sale("2026-11-02", "527.90", "2101.80", "2026-11-02T19:55:31+00:00"),
  ];

  it("adds a same-day sale only once it is recorded", () => {
    expect(realizedUntil(sales, "2026-11-02T19:41:00+00:00").realized).toBeCloseTo(2.62);
    const after = realizedUntil(sales, "2026-11-02T20:12:00+00:00");
    expect(after.realized).toBeCloseTo(530.52);
    expect(after.soldCost).toBeCloseTo(2201.8);
  });
});

describe("localDay", () => {
  it("uses the viewer's calendar day, not the UTC one", () => {
    // 00:30 local on 3 Nov is still 2 Nov in UTC for any zone ahead of UTC
    expect(localDay(new Date(2026, 10, 3, 0, 30).toISOString())).toBe("2026-11-03");
    expect(localDay(new Date(2026, 10, 2, 23, 50).toISOString())).toBe("2026-11-02");
  });
});
