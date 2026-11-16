import { describe, it, expect } from "vitest";
import { formatSplitDate, formatSplitRatio } from "./splits";

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
