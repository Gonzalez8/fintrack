import { describe, it, expect } from "vitest";
import { buildTransactionsQuery } from "./transactions-query";

describe("buildTransactionsQuery", () => {
  it("uses the backend TransactionFilter parameter names", () => {
    const q = new URLSearchParams(
      buildTransactionsQuery({
        page: 2,
        pageSize: 25,
        search: "crwd",
        type: "BUY",
        dateFrom: "2026-01-01",
        dateTo: "2026-06-30",
        accountId: "acc-1",
      }),
    );
    expect(Object.fromEntries(q)).toEqual({
      page: "2",
      page_size: "25",
      search: "crwd",
      type: "BUY",
      from_date: "2026-01-01",
      to_date: "2026-06-30",
      account_id: "acc-1",
    });
  });

  it("omits empty filters", () => {
    expect(buildTransactionsQuery({ page: 1, pageSize: 25, search: "", dateFrom: "" })).toBe("page=1&page_size=25");
  });
});
