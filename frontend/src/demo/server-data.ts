/**
 * Server-side demo data resolver.
 * Maps Django API paths to static demo data for SSR when IS_DEMO is true.
 * This avoids needing a running Django backend on Vercel.
 */

export async function resolveDemoData<T>(path: string): Promise<T> {
  // Lazy import to avoid bundling demo data when not in demo mode
  const data = await import("./data");

  // Strip query params for matching
  const cleanPath = path.split("?")[0].replace(/\/$/, "");

  const paginatedResponse = <D>(items: D[]) => ({
    count: items.length,
    next: null,
    previous: null,
    results: items,
  });

  const routes: Record<string, unknown> = {
    "/api/auth/me": data.demoUser,
    "/api/auth/profile": { username: data.demoUser.username, email: data.demoUser.email },

    "/api/assets": paginatedResponse(data.demoAssets),
    "/api/accounts": paginatedResponse(data.demoAccounts),
    "/api/account-snapshots": paginatedResponse([]),

    "/api/transactions": paginatedResponse(data.demoTransactions),
    "/api/dividends": paginatedResponse(data.demoDividends),
    "/api/interests": paginatedResponse(data.demoInterests),

    "/api/portfolio": data.demoPortfolio,

    "/api/reports/year-summary": data.demoYearSummary,
    "/api/reports/patrimonio-evolution": data.demoPatrimonioEvolution,
    "/api/reports/rv-evolution": data.demoRVEvolution,
    "/api/reports/monthly-savings": { months: data.demoMonthlySavings, stats: data.demoMonthlySavingsStats },
    "/api/reports/snapshot-status": data.demoSnapshotStatus,
    "/api/reports/annual-savings": data.demoAnnualSavings,
    "/api/savings-goals": paginatedResponse(data.demoSavingsGoals),

    "/api/properties": paginatedResponse(data.demoProperties),
    "/api/properties/simulate": data.demoSimulationResult,
    "/api/amortizations": paginatedResponse(data.demoAmortizations),

    "/api/settings": data.demoSettings,
    "/api/storage-info": { total_mb: 12.4, tables: [] },
    "/api/health": { status: "ok" },
  };

  // Direct match
  if (cleanPath in routes) {
    return routes[cleanPath] as T;
  }

  // Pattern matching for parameterized routes
  if (/^\/api\/assets\/[^/]+\/price-history/.test(cleanPath)) {
    const id = cleanPath.split("/")[3];
    return data.getDemoPriceHistory(id) as T;
  }
  if (/^\/api\/assets\/[^/]+/.test(cleanPath)) {
    const id = cleanPath.split("/")[3];
    return (data.demoAssets.find((a) => a.id === id) ?? data.demoAssets[0]) as T;
  }
  if (/^\/api\/savings-goals\/[^/]+\/projection/.test(cleanPath)) {
    return data.demoSavingsProjection as T;
  }
  if (/^\/api\/savings-goals\/[^/]+/.test(cleanPath)) {
    const id = cleanPath.split("/")[3];
    return (data.demoSavingsGoals.find((g) => g.id === id) ?? data.demoSavingsGoals[0]) as T;
  }
  if (/^\/api\/properties\/[^/]+/.test(cleanPath)) {
    const id = cleanPath.split("/")[3];
    return (data.demoProperties.find((p) => p.id === id) ?? data.demoProperties[0]) as T;
  }
  if (/^\/api\/tasks\//.test(cleanPath)) {
    return { task_id: "demo", status: "SUCCESS", result: { updated: 8 } } as T;
  }

  // Fallback: return empty object
  return {} as T;
}
