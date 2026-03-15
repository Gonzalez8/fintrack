import { describe, it, expect } from "vitest";
import { isDemoToken, ASSET_TYPE_KEYS, ACCOUNT_TYPE_KEYS, TRANSACTION_TYPE_KEYS } from "./constants";

describe("isDemoToken", () => {
  it("returns false for undefined", () => {
    expect(isDemoToken(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isDemoToken("")).toBe(false);
  });

  it("detects legacy demo-sig token", () => {
    expect(isDemoToken("header.payload.demo-sig")).toBe(true);
  });

  it("detects legacy demo-ref-sig token", () => {
    expect(isDemoToken("header.payload.demo-ref-sig")).toBe(true);
  });

  it("detects payload with demo:true", () => {
    const payload = Buffer.from(JSON.stringify({ demo: true })).toString("base64url");
    const token = `header.${payload}.signature`;
    expect(isDemoToken(token)).toBe(true);
  });

  it("returns false for regular JWT", () => {
    const payload = Buffer.from(JSON.stringify({ user_id: 1 })).toString("base64url");
    const token = `header.${payload}.signature`;
    expect(isDemoToken(token)).toBe(false);
  });

  it("returns false for malformed token", () => {
    expect(isDemoToken("not-a-jwt")).toBe(false);
  });
});

describe("i18n key maps", () => {
  it("ASSET_TYPE_KEYS has all expected types", () => {
    expect(ASSET_TYPE_KEYS).toHaveProperty("STOCK");
    expect(ASSET_TYPE_KEYS).toHaveProperty("ETF");
    expect(ASSET_TYPE_KEYS).toHaveProperty("FUND");
    expect(ASSET_TYPE_KEYS).toHaveProperty("CRYPTO");
    // All values should be i18n keys
    Object.values(ASSET_TYPE_KEYS).forEach((v) => {
      expect(v).toMatch(/^label\.assetType\./);
    });
  });

  it("ACCOUNT_TYPE_KEYS has all expected types", () => {
    expect(Object.keys(ACCOUNT_TYPE_KEYS)).toEqual(
      expect.arrayContaining(["OPERATIVA", "AHORRO", "INVERSION", "DEPOSITOS", "ALTERNATIVOS"]),
    );
    Object.values(ACCOUNT_TYPE_KEYS).forEach((v) => {
      expect(v).toMatch(/^label\.accountType\./);
    });
  });

  it("TRANSACTION_TYPE_KEYS has BUY/SELL/GIFT", () => {
    expect(Object.keys(TRANSACTION_TYPE_KEYS)).toEqual(
      expect.arrayContaining(["BUY", "SELL", "GIFT"]),
    );
    Object.values(TRANSACTION_TYPE_KEYS).forEach((v) => {
      expect(v).toMatch(/^label\.txType\./);
    });
  });
});
