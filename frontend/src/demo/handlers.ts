import { http, HttpResponse, delay } from "msw";

import {
  demoUser,
  demoAssets,
  demoAccounts,
  demoTransactions,
  demoDividends,
  demoInterests,
  demoPortfolio,
  demoYearSummary,
  demoPatrimonioEvolution,
  demoRVEvolution,
  demoMonthlySavings,
  demoMonthlySavingsStats,
  demoSnapshotStatus,
  demoAnnualSavings,
  demoSavingsGoals,
  demoSavingsProjection,
  demoSettings,
  getDemoPriceHistory,
  demoProperties,
  demoAmortizations,
  demoSimulationResult,
} from "./data";

// Fake JWT that won't be rejected by middleware — three base64url segments,
// exp set to year 2099 (epoch 4102444800).
const FAKE_ACCESS_TOKEN = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(
    JSON.stringify({
      user_id: 1,
      username: demoUser.username,
      exp: 4102444800,
      iat: Math.floor(Date.now() / 1000),
      demo: true,
    })
  ),
  "demo-sig",
]
  .map((s) => s.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"))
  .join(".");

const FAKE_REFRESH_TOKEN = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(
    JSON.stringify({
      token_type: "refresh",
      user_id: 1,
      exp: 4102444800,
      iat: Math.floor(Date.now() / 1000),
      demo: true,
    })
  ),
  "demo-ref-sig",
]
  .map((s) => s.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"))
  .join(".");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function paginated<T>(items: T[]) {
  return { count: items.length, next: null, previous: null, results: items };
}

function cookieHeaders() {
  return {
    "Set-Cookie": [
      `access_token=${FAKE_ACCESS_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
      `refresh_token=${FAKE_REFRESH_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
    ].join(", "),
  };
}

// ---------------------------------------------------------------------------
// Auth handlers — /api/auth/*
// ---------------------------------------------------------------------------

const authHandlers = [
  http.post("/api/auth/token/", async () => {
    await delay(200);
    return HttpResponse.json(
      { access: FAKE_ACCESS_TOKEN, user: demoUser },
      { headers: cookieHeaders() }
    );
  }),

  http.post("/api/auth/token/refresh/", async () => {
    await delay(200);
    return HttpResponse.json(
      { access: FAKE_ACCESS_TOKEN },
      { headers: cookieHeaders() }
    );
  }),

  http.post("/api/auth/logout/", async () => {
    await delay(200);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/auth/me/", async () => {
    await delay(200);
    return HttpResponse.json(demoUser);
  }),

  http.post("/api/auth/google/", async () => {
    await delay(200);
    return HttpResponse.json(
      { access: FAKE_ACCESS_TOKEN, user: demoUser },
      { headers: cookieHeaders() }
    );
  }),

  http.post("/api/auth/register/", async () => {
    await delay(200);
    return HttpResponse.json(
      { access: FAKE_ACCESS_TOKEN, user: demoUser },
      { headers: cookieHeaders() }
    );
  }),

  http.get("/api/auth/profile/", async () => {
    await delay(200);
    return HttpResponse.json({
      username: demoUser.username,
      email: demoUser.email,
    });
  }),

  http.put("/api/auth/profile/", async () => {
    await delay(200);
    return HttpResponse.json({ ok: true });
  }),

  http.post("/api/auth/change-password/", async () => {
    await delay(200);
    return HttpResponse.json({ ok: true });
  }),
];

// ---------------------------------------------------------------------------
// Proxy handlers — /api/proxy/*
// ---------------------------------------------------------------------------

const proxyHandlers = [
  // ---- Assets ----
  http.get("/api/proxy/assets/", async () => {
    await delay(200);
    return HttpResponse.json(paginated(demoAssets));
  }),

  http.post("/api/proxy/assets/", async () => {
    await delay(200);
    return HttpResponse.json(demoAssets[0]);
  }),

  http.put("/api/proxy/assets/:id/", async () => {
    await delay(200);
    return HttpResponse.json({ ok: true });
  }),

  http.delete("/api/proxy/assets/:id/", async () => {
    await delay(200);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/proxy/assets/update-prices/", async () => {
    await delay(200);
    return HttpResponse.json({ task_id: "demo-task-1", status: "queued" });
  }),

  http.get("/api/proxy/assets/:id/price-history/", async ({ params }) => {
    await delay(200);
    return HttpResponse.json(getDemoPriceHistory(params.id as string));
  }),

  http.post("/api/proxy/assets/:id/set-price/", async () => {
    await delay(200);
    return HttpResponse.json({ ok: true });
  }),

  // ---- Accounts ----
  http.get("/api/proxy/accounts/", async () => {
    await delay(200);
    return HttpResponse.json(paginated(demoAccounts));
  }),

  http.post("/api/proxy/accounts/", async () => {
    await delay(200);
    return HttpResponse.json(demoAccounts[0]);
  }),

  http.put("/api/proxy/accounts/:id/", async () => {
    await delay(200);
    return HttpResponse.json({ ok: true });
  }),

  http.delete("/api/proxy/accounts/:id/", async () => {
    await delay(200);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/proxy/accounts/bulk-snapshot/", async () => {
    await delay(200);
    return HttpResponse.json({ ok: true });
  }),

  http.get("/api/proxy/account-snapshots/", async () => {
    await delay(200);
    return HttpResponse.json(paginated([]));
  }),

  // ---- Transactions ----
  http.get("/api/proxy/transactions/", async () => {
    await delay(200);
    return HttpResponse.json(paginated(demoTransactions));
  }),

  http.post("/api/proxy/transactions/", async () => {
    await delay(200);
    return HttpResponse.json(demoTransactions[0]);
  }),

  http.put("/api/proxy/transactions/:id/", async () => {
    await delay(200);
    return HttpResponse.json({ ok: true });
  }),

  http.delete("/api/proxy/transactions/:id/", async () => {
    await delay(200);
    return new HttpResponse(null, { status: 204 });
  }),

  // ---- Dividends ----
  http.get("/api/proxy/dividends/", async () => {
    await delay(200);
    return HttpResponse.json(paginated(demoDividends));
  }),

  http.post("/api/proxy/dividends/", async () => {
    await delay(200);
    return HttpResponse.json(demoDividends[0]);
  }),

  http.put("/api/proxy/dividends/:id/", async () => {
    await delay(200);
    return HttpResponse.json({ ok: true });
  }),

  http.delete("/api/proxy/dividends/:id/", async () => {
    await delay(200);
    return new HttpResponse(null, { status: 204 });
  }),

  // ---- Interests ----
  http.get("/api/proxy/interests/", async () => {
    await delay(200);
    return HttpResponse.json(paginated(demoInterests));
  }),

  http.post("/api/proxy/interests/", async () => {
    await delay(200);
    return HttpResponse.json(demoInterests[0]);
  }),

  http.put("/api/proxy/interests/:id/", async () => {
    await delay(200);
    return HttpResponse.json({ ok: true });
  }),

  http.delete("/api/proxy/interests/:id/", async () => {
    await delay(200);
    return new HttpResponse(null, { status: 204 });
  }),

  // ---- Portfolio ----
  http.get("/api/proxy/portfolio/", async () => {
    await delay(200);
    return HttpResponse.json(demoPortfolio);
  }),

  // ---- Reports ----
  http.get("/api/proxy/reports/year-summary/", async () => {
    await delay(200);
    return HttpResponse.json(demoYearSummary);
  }),

  http.get("/api/proxy/reports/patrimonio-evolution/", async () => {
    await delay(200);
    return HttpResponse.json(demoPatrimonioEvolution);
  }),

  http.get("/api/proxy/reports/rv-evolution/", async () => {
    await delay(200);
    return HttpResponse.json(demoRVEvolution);
  }),

  http.get("/api/proxy/reports/monthly-savings/", async () => {
    await delay(200);
    return HttpResponse.json({ months: demoMonthlySavings, stats: demoMonthlySavingsStats });
  }),

  http.get("/api/proxy/reports/annual-savings/", async () => {
    await delay(200);
    return HttpResponse.json(demoAnnualSavings);
  }),

  http.get("/api/proxy/reports/snapshot-status/", async () => {
    await delay(200);
    return HttpResponse.json(demoSnapshotStatus);
  }),

  // ---- Savings Goals ----
  http.get("/api/proxy/savings-goals/", async () => {
    await delay(200);
    return HttpResponse.json(paginated(demoSavingsGoals));
  }),

  http.post("/api/proxy/savings-goals/", async () => {
    await delay(200);
    return HttpResponse.json(demoSavingsGoals[0], { status: 201 });
  }),

  http.put("/api/proxy/savings-goals/:id/", async () => {
    await delay(200);
    return HttpResponse.json(demoSavingsGoals[0]);
  }),

  http.delete("/api/proxy/savings-goals/:id/", async () => {
    await delay(200);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/proxy/savings-goals/:id/projection/", async () => {
    await delay(300);
    return HttpResponse.json(demoSavingsProjection);
  }),

  // ---- Properties ----
  http.get("/api/proxy/properties/", async () => {
    await delay(200);
    return HttpResponse.json(paginated(demoProperties));
  }),

  http.post("/api/proxy/properties/", async () => {
    await delay(200);
    return HttpResponse.json(demoProperties[0], { status: 201 });
  }),

  http.put("/api/proxy/properties/:id/", async () => {
    await delay(200);
    return HttpResponse.json(demoProperties[0]);
  }),

  http.delete("/api/proxy/properties/:id/", async () => {
    await delay(200);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/proxy/properties/simulate/", async () => {
    await delay(300);
    return HttpResponse.json(demoSimulationResult);
  }),

  // ---- Amortizations ----
  http.get("/api/proxy/amortizations/", async () => {
    await delay(200);
    return HttpResponse.json(paginated(demoAmortizations));
  }),

  http.post("/api/proxy/amortizations/", async () => {
    await delay(200);
    return HttpResponse.json(demoAmortizations[0], { status: 201 });
  }),

  http.put("/api/proxy/amortizations/:id/", async () => {
    await delay(200);
    return HttpResponse.json(demoAmortizations[0]);
  }),

  http.delete("/api/proxy/amortizations/:id/", async () => {
    await delay(200);
    return new HttpResponse(null, { status: 204 });
  }),

  // ---- Settings ----
  http.get("/api/proxy/settings/", async () => {
    await delay(200);
    return HttpResponse.json(demoSettings);
  }),

  http.put("/api/proxy/settings/", async () => {
    await delay(200);
    return HttpResponse.json(demoSettings);
  }),

  // ---- Tasks ----
  http.get("/api/proxy/tasks/:taskId/", async ({ params }) => {
    await delay(200);
    return HttpResponse.json({
      task_id: params.taskId,
      status: "SUCCESS",
      result: { updated: 8 },
    });
  }),

  // ---- Health ----
  http.get("/api/proxy/health/", async () => {
    await delay(200);
    return HttpResponse.json({ status: "ok" });
  }),

  // ---- Storage info ----
  http.get("/api/proxy/storage-info/", async () => {
    await delay(200);
    return HttpResponse.json({
      total_mb: 12.4,
      tables: [
        { table: "transactions_transaction", size_mb: 4.2 },
        { table: "assets_asset", size_mb: 2.1 },
        { table: "assets_portfoliosnapshot", size_mb: 3.8 },
        { table: "transactions_dividend", size_mb: 1.1 },
        { table: "transactions_interest", size_mb: 0.6 },
        { table: "assets_account", size_mb: 0.4 },
        { table: "core_user", size_mb: 0.2 },
      ],
    });
  }),

  // ---- Backup / Export ----
  http.get("/api/proxy/backup/export/", async () => {
    await delay(200);
    return HttpResponse.json({
      version: "2.0",
      exported_at: new Date().toISOString(),
      assets: demoAssets,
      accounts: demoAccounts,
      transactions: demoTransactions,
      dividends: demoDividends,
      interests: demoInterests,
      settings: demoSettings,
    });
  }),

  http.post("/api/proxy/backup/import/", async () => {
    await delay(200);
    return HttpResponse.json({ ok: true, imported: true });
  }),

  http.get("/api/proxy/export/transactions.csv", async () => {
    await delay(200);
    return new HttpResponse(
      "date,asset,type,shares,price,total\n2025-01-15,AAPL,BUY,10,185.50,1855.00\n2025-02-20,MSFT,BUY,5,410.25,2051.25\n",
      { headers: { "Content-Type": "text/csv" } }
    );
  }),

  http.get("/api/proxy/export/dividends.csv", async () => {
    await delay(200);
    return new HttpResponse(
      "date,asset,gross,tax,net\n2025-03-15,AAPL,25.00,4.75,20.25\n2025-06-15,MSFT,18.50,3.52,14.98\n",
      { headers: { "Content-Type": "text/csv" } }
    );
  }),

  http.get("/api/proxy/export/interests.csv", async () => {
    await delay(200);
    return new HttpResponse(
      "date,account,gross,tax,net\n2025-01-31,MyBank Savings,45.00,8.55,36.45\n2025-02-28,MyBank Savings,42.30,8.04,34.26\n",
      { headers: { "Content-Type": "text/csv" } }
    );
  }),
];

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

export const handlers = [...authHandlers, ...proxyHandlers];
