"use client";

import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Split } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslations } from "@/i18n/use-translations";
import { formatSplitDate, formatSplitRatio, useSplitsChanged } from "@/lib/splits";
import type { PaginatedResponse, StockSplit } from "@/types";

/**
 * Lists auto-detected splits waiting for the user's decision. Applying one
 * adjusts quantities and unit costs from the split date on; dismissing it
 * keeps the transactions untouched and it is never suggested again.
 */
export function PendingSplitsBanner() {
  const t = useTranslations();
  const onChanged = useSplitsChanged();

  const { data } = useQuery({
    queryKey: ["splits", "PENDING"],
    queryFn: () => api.get<PaginatedResponse<StockSplit>>("/splits/?status=PENDING"),
    staleTime: 60 * 1000,
  });

  const applyMut = useMutation({
    mutationFn: (id: string) => api.post(`/splits/${id}/apply/`),
    onSuccess: onChanged,
  });
  const dismissMut = useMutation({
    mutationFn: (id: string) => api.post(`/splits/${id}/dismiss/`),
    onSuccess: onChanged,
  });

  const pending = data?.results ?? [];
  if (pending.length === 0) return null;

  const busy = applyMut.isPending || dismissMut.isPending;

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Split className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-semibold">{t("splits.pendingTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("splits.pendingDescription")}</p>
          </div>
        </div>

        <ul className="space-y-2">
          {pending.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 text-sm">
                <Link href={`/assets/${s.asset}`} className="font-semibold text-primary hover:underline">
                  {s.asset_name || s.asset_ticker}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {t("splits.ratioLabel")} <span className="font-mono text-foreground">{formatSplitRatio(s)}</span> ·{" "}
                  {formatSplitDate(s.date)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 sm:flex-none" disabled={busy} onClick={() => applyMut.mutate(s.id)}>
                  {t("splits.apply")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 sm:flex-none"
                  disabled={busy}
                  onClick={() => dismissMut.mutate(s.id)}
                >
                  {t("splits.dismiss")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
