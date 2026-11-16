import { describe, it, expect } from "vitest";
import { formatDraftAmount } from "./pending-dividends-banner";

describe("formatDraftAmount", () => {
  it("keeps small per-share amounts", () => {
    document.documentElement.lang = "es";
    expect(formatDraftAmount("0.047612", "EUR", true)).toMatch(/^0,0476\s€$/);
    expect(formatDraftAmount("0.127000", "EUR", true)).toMatch(/^0,127\s€$/);
  });

  it("formats totals with two decimals in the UI locale", () => {
    document.documentElement.lang = "en";
    expect(formatDraftAmount("2.70", "USD")).toBe("$2.70");
  });

  it("falls back for unknown currencies", () => {
    expect(formatDraftAmount("1.5", "??", true)).toBe("1.5000 ??");
  });
});
