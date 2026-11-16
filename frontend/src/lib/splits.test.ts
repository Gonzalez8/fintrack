import { describe, it, expect } from "vitest";
import { formatSplitDate, formatSplitRatio, interleaveSplits, splitAdjustedQuantity } from "./splits";

describe("formatSplitRatio", () => {
  it("formats a forward split as new:old", () => {
    expect(formatSplitRatio({ ratio_from: "1.000000", ratio_to: "4.000000" })).toBe("4:1");
  });

  it("formats a reverse split", () => {
    expect(formatSplitRatio({ ratio_from: "10.000000", ratio_to: "1.000000" })).toBe("1:10");
  });

  it("keeps fractional ratios", () => {
    expect(formatSplitRatio({ ratio_from: "1.000000", ratio_to: "1.500000" })).toBe("1.5:1");
  });
});

describe("formatSplitDate", () => {
  it("formats in the UI locale without shifting the day", () => {
    document.documentElement.lang = "es";
    expect(formatSplitDate("2026-07-02")).toBe("02/07/2026");
  });
});

describe("interleaveSplits", () => {
  const split = (date: string) =>
    ({ id: date, date, ratio_from: "1", ratio_to: "4" }) as unknown as import("@/types").StockSplit;
  const tx = (date: string) => ({ date });
  const order = (rows: ReturnType<typeof interleaveSplits<{ date: string }>>) =>
    rows.map((r) => (r.kind === "tx" ? `tx:${r.tx.date}` : `split:${r.split.date}`));
  const single = { isFirstPage: true, isLastPage: true };

  it("places a split between older and newer trades", () => {
    const rows = interleaveSplits([tx("2026-09-01"), tx("2021-05-10")], [split("2026-07-02")], single);
    expect(order(rows)).toEqual(["tx:2026-09-01", "split:2026-07-02", "tx:2021-05-10"]);
  });

  it("keeps same-day trades above the split", () => {
    const rows = interleaveSplits([tx("2026-07-02"), tx("2021-05-10")], [split("2026-07-02")], single);
    expect(order(rows)).toEqual(["tx:2026-07-02", "split:2026-07-02", "tx:2021-05-10"]);
  });

  it("puts a split newer than every trade on top of the first page", () => {
    const rows = interleaveSplits([tx("2021-05-10")], [split("2026-07-02")], single);
    expect(order(rows)).toEqual(["split:2026-07-02", "tx:2021-05-10"]);
  });

  it("shows each split on exactly one page", () => {
    const splits = [split("2024-01-01"), split("2022-01-01")];
    const page1 = interleaveSplits([tx("2026-01-01"), tx("2023-01-01")], splits, {
      isFirstPage: true,
      isLastPage: false,
    });
    const page2 = interleaveSplits([tx("2022-01-01"), tx("2020-01-01")], splits, {
      isFirstPage: false,
      isLastPage: true,
    });
    expect(order(page1)).toEqual(["tx:2026-01-01", "split:2024-01-01", "tx:2023-01-01"]);
    // 2022-01-01 split sits below the 2022-01-01 trade, on the page that holds it
    expect(order(page2)).toEqual(["tx:2022-01-01", "split:2022-01-01", "tx:2020-01-01"]);
  });

  it("returns no splits without transactions", () => {
    expect(interleaveSplits([], [split("2026-07-02")], single)).toEqual([]);
  });
});

describe("splitAdjustedQuantity", () => {
  it("multiplies by the split factor", () => {
    expect(splitAdjustedQuantity({ quantity: "28", split_factor: "4" })).toBe(112);
  });

  it("is null when no split applies", () => {
    expect(splitAdjustedQuantity({ quantity: "28", split_factor: "1" })).toBeNull();
    expect(splitAdjustedQuantity({ quantity: "28" })).toBeNull();
  });
});
