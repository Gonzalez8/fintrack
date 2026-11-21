"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useTranslations } from "@/i18n/use-translations";
import { IS_DEMO } from "@/lib/constants";
import { uiLocale } from "@/lib/utils";

/**
 * Registers the service worker (public/sw.js) and shows a banner while the app is showing its offline copy,
 * with the time of the data. Not in demo mode, which uses its own (MSW) worker on the same scope.
 */
export function OfflineSupport() {
  const t = useTranslations();
  // undefined: online; null: offline with no time known; string: offline copy taken at that time
  const [offline, setOffline] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (IS_DEMO || !("serviceWorker" in navigator)) return;
    const params = new URLSearchParams({ v: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev" });
    if (process.env.NODE_ENV === "development") params.set("dev", "1");
    navigator.serviceWorker
      .register(`/sw.js?${params}`)
      .catch(() => {}); // e.g. plain http on a LAN address: the app works, just without offline copy

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "fintrack:offline") setOffline(event.data.cachedAt ?? null);
      if (event.data?.type === "fintrack:online") setOffline(undefined);
    };
    const onOffline = () => setOffline((prev) => (prev === undefined ? null : prev));
    navigator.serviceWorker.addEventListener("message", onMessage);
    window.addEventListener("offline", onOffline);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (offline === undefined) return null;
  const time = offline
    ? new Date(offline).toLocaleString(uiLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-300"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{time ? t("offline.banner", { time }) : t("offline.bannerNoTime")}</span>
    </div>
  );
}
