import { NextRequest, NextResponse } from "next/server";

// Share target fallback: the service worker (public/sw.js) normally answers POST /share-target itself. If it is not
// installed yet, the shared file cannot be kept, so just open the payroll page.
export function POST(req: NextRequest) {
  return NextResponse.redirect(new URL("/nominas", req.url), 303);
}

export const GET = POST;
