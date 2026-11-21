import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { DJANGO_INTERNAL_URL, COOKIE_ACCESS, COOKIE_REFRESH, isDemoToken } from "@/lib/constants";

// ── Token refresh mutex to prevent concurrent refresh attempts ──
let refreshPromise: Promise<{ newAccess: string; setCookies: string[] } | null> | null = null;

async function doRefresh(refresh: string): Promise<{ newAccess: string; setCookies: string[] } | null> {
  const refreshRes = await fetch(
    `${DJANGO_INTERNAL_URL}/api/auth/token/refresh/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${COOKIE_REFRESH}=${refresh}`,
      },
    },
  );

  if (!refreshRes.ok) return null;

  const setCookies = refreshRes.headers.getSetCookie();
  let newAccess: string | undefined;
  for (const sc of setCookies) {
    if (sc.startsWith(`${COOKIE_ACCESS}=`)) {
      newAccess = sc.slice(`${COOKIE_ACCESS}=`.length).split(";")[0];
    }
  }

  return newAccess ? { newAccess, setCookies } : null;
}

function refreshOnce(refresh: string): Promise<{ newAccess: string; setCookies: string[] } | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh(refresh).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

/**
 * BFF proxy: forwards any request from the browser to Django API.
 * Browser calls /api/proxy/assets/ → Django http://backend:8000/api/assets/
 *
 * In demo mode, returns static demo data instead of calling Django.
 *
 * If the access token is expired, automatically refreshes it using the
 * refresh token and retries the original request once.
 */
async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const joined = path.join("/");
  const needsSlash = !joined.endsWith("/") && !joined.includes(".");
  const djangoPath = `/api/${joined}${needsSlash ? "/" : ""}`;

  const cookieStore = await cookies();
  let access = cookieStore.get(COOKIE_ACCESS)?.value;
  const refresh = cookieStore.get(COOKIE_REFRESH)?.value;

  // Demo session: return static data, no backend needed
  if (isDemoToken(access)) {
    // With the query string: demo answers depend on filters (year, asset) and the simulator's figures
    return resolveDemoProxy(`${djangoPath}${req.nextUrl.search}`, req.method);
  }

  const url = new URL(req.url);
  const search = url.search;
  const target = `${DJANGO_INTERNAL_URL}${djangoPath}${search}`;

  // For non-GET requests, buffer the body so we can retry after refresh
  const body = req.method !== "GET" && req.method !== "HEAD"
    ? await req.arrayBuffer()
    : undefined;

  const buildHeaders = (token?: string) => {
    const h = new Headers();
    const contentType = req.headers.get("content-type");
    if (contentType) h.set("Content-Type", contentType);
    const cookieParts = [
      token && `${COOKIE_ACCESS}=${token}`,
      refresh && `${COOKIE_REFRESH}=${refresh}`,
    ].filter(Boolean).join("; ");
    if (cookieParts) h.set("Cookie", cookieParts);
    return h;
  };

  let djangoRes: Response;
  try {
    djangoRes = await fetch(target, {
      method: req.method,
      headers: buildHeaders(access),
      body,
    });
  } catch {
    return NextResponse.json(
      { detail: "Backend unavailable" },
      { status: 502 },
    );
  }

  // If 401 and we have a refresh token, try to get a new access token and retry.
  // Uses a mutex so concurrent 401s share a single refresh attempt.
  if (djangoRes.status === 401 && refresh) {
    const refreshResult = await refreshOnce(refresh);

    if (refreshResult) {
      access = refreshResult.newAccess;

      // Retry the original request with the new access token
      djangoRes = await fetch(target, {
        method: req.method,
        headers: buildHeaders(refreshResult.newAccess),
        body,
      });

      // Build response and forward the refreshed cookies to the browser
      const resHeaders = buildResponseHeaders(djangoRes);
      for (const sc of refreshResult.setCookies) {
        resHeaders.append("Set-Cookie", sc);
      }
      return new NextResponse(djangoRes.body, {
        status: djangoRes.status,
        headers: resHeaders,
      });
    }
  }

  // Normal response (no refresh needed)
  const resHeaders = buildResponseHeaders(djangoRes);
  return new NextResponse(djangoRes.body, {
    status: djangoRes.status,
    headers: resHeaders,
  });
}

function buildResponseHeaders(djangoRes: Response): Headers {
  const resHeaders = new Headers();
  djangoRes.headers.forEach((v, k) => {
    const lower = k.toLowerCase();
    if (lower !== "transfer-encoding" && lower !== "connection") {
      resHeaders.set(k, v);
    }
  });
  const setCookies = djangoRes.headers.getSetCookie();
  for (const sc of setCookies) {
    resHeaders.append("Set-Cookie", sc);
  }
  return resHeaders;
}

// ---------------------------------------------------------------------------
// Demo mode resolver — returns static data without Django
// ---------------------------------------------------------------------------

async function resolveDemoProxy(
  djangoPath: string,
  method: string,
): Promise<NextResponse> {
  const { resolveDemoData } = await import("@/demo/server-data");

  if (method === "DELETE") {
    return new NextResponse(null, { status: 204 });
  }

  const cleanPath = djangoPath.split("?")[0].replace(/\/$/, "");

  if (method === "POST" || method === "PUT" || method === "PATCH") {
    if (cleanPath === "/api/assets/update-prices") {
      return NextResponse.json({ task_id: "demo-task-1", status: "queued" });
    }
    if (/\/set-price$/.test(cleanPath) || /\/bulk-snapshot$/.test(cleanPath)) {
      return NextResponse.json({ ok: true });
    }
    if (cleanPath === "/api/backup/import") {
      return NextResponse.json({ ok: true, imported: true });
    }
    const data = await resolveDemoData(djangoPath);
    return NextResponse.json(data);
  }

  // GET — CSV exports
  if (cleanPath.startsWith("/api/export/")) {
    return new NextResponse("date,demo,data\n", {
      headers: { "Content-Type": "text/csv" },
    });
  }
  if (cleanPath === "/api/backup/export") {
    const d = await import("@/demo/data");
    return NextResponse.json({
      version: "2.0",
      exported_at: new Date().toISOString(),
      assets: d.demoAssets,
      accounts: d.demoAccounts,
      transactions: d.demoTransactions,
      dividends: d.demoDividends,
      interests: d.demoInterests,
      settings: d.demoSettings,
    });
  }

  // GET — standard data
  const data = await resolveDemoData(djangoPath);
  return NextResponse.json(data);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
