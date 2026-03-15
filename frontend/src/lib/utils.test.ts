import { describe, it, expect } from "vitest";
import { formatMoney, formatPct, formatQty, moneyColor } from "./utils";

describe("formatMoney", () => {
  it("formats positive numbers", () => {
    const result = formatMoney(12345.67);
    expect(result).toContain("12.345,67");
    expect(result).toContain("€");
  });

  it("formats string input", () => {
    const result = formatMoney("1500.00");
    expect(result).toContain("1500,00");
  });

  it("returns dash for null", () => {
    expect(formatMoney(null)).toBe("—");
  });

  it("returns dash for empty string", () => {
    expect(formatMoney("")).toBe("—");
  });

  it("returns dash for NaN", () => {
    expect(formatMoney("abc")).toBe("—");
  });

  it("formats negative numbers", () => {
    const result = formatMoney(-500.5);
    expect(result).toContain("500,50");
  });

  it("formats zero", () => {
    const result = formatMoney(0);
    expect(result).toContain("0,00");
  });
});

describe("formatPct", () => {
  it("formats positive with +", () => {
    expect(formatPct(12.5)).toBe("+12.50%");
  });

  it("formats negative without +", () => {
    expect(formatPct(-3.2)).toBe("-3.20%");
  });

  it("returns dash for null", () => {
    expect(formatPct(null)).toBe("—");
  });
});

describe("formatQty", () => {
  it("formats integer quantity", () => {
    expect(formatQty(10)).toBe("10");
  });

  it("formats decimal quantity", () => {
    const result = formatQty(10.5);
    expect(result).toContain("10,5");
  });

  it("returns dash for null", () => {
    expect(formatQty(null)).toBe("—");
  });
});

describe("moneyColor", () => {
  it("returns green for positive", () => {
    expect(moneyColor(100)).toBe("text-green-500");
  });

  it("returns red for negative", () => {
    expect(moneyColor(-50)).toBe("text-red-500");
  });

  it("returns muted for zero", () => {
    expect(moneyColor(0)).toBe("text-muted-foreground");
  });

  it("returns muted for null", () => {
    expect(moneyColor(null)).toBe("text-muted-foreground");
  });
});
