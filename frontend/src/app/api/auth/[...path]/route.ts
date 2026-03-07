import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { DJANGO_INTERNAL_URL, COOKIE_ACCESS, COOKIE_REFRESH } from "@/lib/constants";

/**
 * Auth proxy: handles /api/auth/* routes.
 * Forwards to Django and manages JWT cookies on login/refresh/logout.
 */
async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const joined = path.join("/");
  const djangoPath = `/api/auth/${joined}${joined.endsWith("/") ? "" : "/"}`;
  const target = `${DJANGO_INTERNAL_URL}${djangoPath}`;

  const cookieStore = await cookies();
  const access = cookieStore.get(COOKIE_ACCESS)?.value;
  const refresh = cookieStore.get(COOKIE_REFRESH)?.value;

  const cookieHeader = [
    access && `${COOKIE_ACCESS}=${access}`,
    refresh && `${COOKIE_REFRESH}=${refresh}`,
  ]
    .filter(Boolean)
    .join("; ");

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  if (cookieHeader) headers.set("Cookie", cookieHeader);

  const body = req.method !== "GET" && req.method !== "HEAD"
    ? await req.arrayBuffer()
    : undefined;

  const djangoRes = await fetch(target, {
    method: req.method,
    headers,
    body,
  });

  // Build response forwarding Django's body and status
  const resHeaders = new Headers();
  djangoRes.headers.forEach((v, k) => {
    const lower = k.toLowerCase();
    if (lower !== "transfer-encoding" && lower !== "connection") {
      resHeaders.set(k, v);
    }
  });

  // Forward Set-Cookie headers from Django
  const setCookies = djangoRes.headers.getSetCookie();
  if (setCookies.length) {
    for (const sc of setCookies) {
      resHeaders.append("Set-Cookie", sc);
    }
  }

  return new NextResponse(djangoRes.body, {
    status: djangoRes.status,
    headers: resHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
