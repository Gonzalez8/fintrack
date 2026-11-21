"use client";

import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { api } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslations } from "@/i18n/use-translations";
import { uiLocale } from "@/lib/utils";
import type { SnapshotStatus } from "@/types";

/**
 * Warns when automatic prices have not been updated for too long (the backend decides: a day, or two
 * update cycles), which usually means the background tasks (Celery) are stopped. Hidden otherwise.
 */
export function StalePricesBanner() {
  const t = useTranslations();
  const { data } = useQuery({
    queryKey: ["snapshot-status"],
    queryFn: () => api.get<SnapshotStatus>("/reports/snapshot-status/"),
    staleTime: 5 * 60 * 1000,
  });

  if (!data?.prices_stale) return null;
  const since = data.prices_updated_at
    ? new Date(data.prices_updated_at).toLocaleString(uiLocale(), {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="flex items-start gap-3 py-3 text-sm">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <div className="space-y-0.5">
          <p className="font-medium">
            {since ? t("dashboard.pricesStale", { since }) : t("dashboard.pricesNeverUpdated")}
          </p>
          <p className="text-xs text-muted-foreground">{t("dashboard.pricesStaleHint")}</p>
        </div>
      </CardContent>
    </Card>
  );
}
