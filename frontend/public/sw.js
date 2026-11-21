/*
 * Fintrack service worker.
 *
 * 1. Offline copy: every page and every GET to /api/proxy/* goes to the network first; the last good response is
 *    kept and served when there is no connection (the page is told, so it can say how old the data is).
 *    Sign-in, account data and backups are never stored. The copy is deleted on login and logout (lib/offline.ts).
 * 2. Share target: payslip PDFs shared from other apps (Android) arrive as a POST to /share-target; they are kept
 *    in a cache and the payroll page picks them up (/nominas?shared=1).
 *
 * Registered as /sw.js?v=<app version>, plus &dev=1 in development, where /_next/static files change without
 * changing name.
 */
// Cache names carry the app version (registered as /sw.js?v=<version>): a new release gets fresh caches and the
// old ones, with the previous build's files, are deleted on activate
const VERSION = new URL(self.location.href).searchParams.get("v") || "v1";
const PAGES = `fintrack-pages-${VERSION}`;
const DATA = `fintrack-data-${VERSION}`;
const ASSETS = `fintrack-assets-${VERSION}`;
const SHARE = "fintrack-share";
const DEV = new URL(self.location.href).searchParams.get("dev") === "1";
const CACHED_AT = "x-fintrack-cached-at";

// Sign-in, account (profile, tokens, avatar) and backups are never stored
const NEVER_CACHED = [
  /^\/api\/auth\//,
  /^\/api\/proxy\/auth\//,
  /^\/api\/proxy\/backup\//,
  /^\/mockServiceWorker\.js$/,
  /^\/sw\.js$/,
];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [PAGES, DATA, ASSETS, SHARE];
      for (const key of await caches.keys()) {
        if (key.startsWith("fintrack-") && !keep.includes(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

async function notify(message) {
  for (const client of await self.clients.matchAll({ type: "window" })) client.postMessage(message);
}

// App Router navigations fetch RSC payloads with a changing ?_rsc= token: key them by path only
function cacheKey(request) {
  const url = new URL(request.url);
  if (request.headers.get("RSC") === "1") {
    url.searchParams.delete("_rsc");
    url.searchParams.set("__rsc", "1");
  }
  return url.toString();
}

async function store(cacheName, key, response) {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT, new Date().toISOString());
  const body = await response.clone().blob();
  const cache = await caches.open(cacheName);
  await cache.put(key, new Response(body, { status: response.status, statusText: response.statusText, headers }));
}

async function networkFirst(request, cacheName, { report = false, fallback = null } = {}) {
  const key = cacheKey(request);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await store(cacheName, key, response);
    if (report) notify({ type: "fintrack:online" });
    return response;
  } catch (error) {
    const cached = (await caches.match(key)) || (fallback && (await caches.match(fallback)));
    if (!cached) throw error;
    if (report) notify({ type: "fintrack:offline", cachedAt: cached.headers.get(CACHED_AT) });
    return cached;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(cacheName)).put(request, response.clone());
  return response;
}

async function receiveShare(request) {
  const form = await request.formData();
  const cache = await caches.open(SHARE);
  for (const key of await cache.keys()) await cache.delete(key);
  const files = form.getAll("file").filter((f) => f instanceof File);
  await Promise.all(
    files.map((file, i) =>
      cache.put(
        `/shared/${i}`,
        new Response(file, { headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) } }),
      ),
    ),
  );
  return Response.redirect("/nominas?shared=1", 303);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== "GET" || NEVER_CACHED.some((re) => re.test(url.pathname))) return;

  if (url.pathname.startsWith("/api/proxy/")) {
    event.respondWith(networkFirst(request, DATA, { report: true }));
  } else if (request.mode === "navigate" || request.headers.get("RSC") === "1") {
    event.respondWith(networkFirst(request, PAGES, { report: true, fallback: request.mode === "navigate" ? "/" : null }));
  } else if (url.pathname.startsWith("/_next/static/") && !DEV) {
    event.respondWith(cacheFirst(request, ASSETS));
  } else if (!url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, ASSETS));
  }
});
