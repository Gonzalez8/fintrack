// Browser side of the service worker (public/sw.js): offline copy and files shared from other apps.

const OFFLINE_CACHE_PREFIX = "fintrack-";
const SHARE_CACHE = "fintrack-share";

/** Deletes the offline copy of pages and data (on logout, so nothing stays on the device). */
export async function clearOfflineData(): Promise<void> {
  if (typeof caches === "undefined") return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith(OFFLINE_CACHE_PREFIX)).map((k) => caches.delete(k)));
}

/** Files shared to Fintrack from another app (share target), removed once taken. */
export async function takeSharedFiles(): Promise<File[]> {
  if (typeof caches === "undefined") return [];
  const cache = await caches.open(SHARE_CACHE);
  const files: File[] = [];
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (response) {
      const name = decodeURIComponent(response.headers.get("X-File-Name") ?? "nomina.pdf");
      const blob = await response.blob();
      files.push(new File([blob], name, { type: blob.type || "application/pdf" }));
    }
    await cache.delete(request);
  }
  return files;
}
