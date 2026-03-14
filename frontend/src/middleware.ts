import { NextRequest, NextResponse } from "next/server";
import { COOKIE_ACCESS, COOKIE_REFRESH, COOKIE_LANG, DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/lib/constants";

const DJANGO_INTERNAL_URL = process.env.DJANGO_INTERNAL_URL || "http://backend:8000";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const PUBLIC_PATHS = ["/login", "/welcome"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip API routes, static files, favicon, MSW service worker
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname === "/mockServiceWorker.js"
  ) {
    return NextResponse.next();
  }

  // Public pages — no auth needed
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // ── Auth check for dashboard routes ──
  const access = req.cookies.get(COOKIE_ACCESS)?.value;
  const refresh = req.cookies.get(COOKIE_REFRESH)?.value;

  // No tokens at all → redirect to welcome/landing
  if (!access && !refresh) {
    return NextResponse.redirect(new URL("/welcome", req.url));
  }

  // Check if access token is expired by decoding the payload (no signature verification)
  if (access) {
    try {
      const payload = JSON.parse(
        Buffer.from(access.split(".")[1], "base64url").toString(),
      );
      const exp = payload.exp * 1000;
      if (Date.now() < exp) {
        // Token still valid
        return withLocale(req, NextResponse.next());
      }
    } catch {
      // Malformed token, try refresh
    }
  }

  // Demo mode: no Django backend to refresh against
  if (IS_DEMO) {
    return NextResponse.redirect(new URL("/welcome", req.url));
  }

  // Access token expired or missing — try refresh
  if (refresh) {
    try {
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

      if (refreshRes.ok) {
        // Forward Set-Cookie from Django to the browser
        const res = NextResponse.next();
        const setCookies = refreshRes.headers.getSetCookie();
        for (const sc of setCookies) {
          res.headers.append("Set-Cookie", sc);
        }
        return withLocale(req, res);
      }
    } catch {
      // Refresh failed
    }
  }

  // All auth attempts failed → redirect to welcome/landing
  return NextResponse.redirect(new URL("/welcome", req.url));
}

function withLocale(req: NextRequest, res: NextResponse): NextResponse {
  // Detect locale from cookie or Accept-Language
  const langCookie = req.cookies.get(COOKIE_LANG)?.value;
  if (!langCookie) {
    const acceptLang = req.headers.get("accept-language") || "";
    const preferred = acceptLang
      .split(",")
      .map((l) => l.split(";")[0].trim().split("-")[0])
      .find((l) => (SUPPORTED_LOCALES as readonly string[]).includes(l));
    const locale = preferred || DEFAULT_LOCALE;
    res.cookies.set(COOKIE_LANG, locale, { path: "/", maxAge: 365 * 24 * 3600 });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
