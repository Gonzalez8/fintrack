"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "@/i18n/use-translations";
import { cn, formatDate, formatPct, moneyColor } from "@/lib/utils";
import type { HistoryRebuild } from "@/types";

/**
 * Rebuilds the portfolio history before Fintrack started photographing it: first a preview (GET, writes nothing),
 * then the rebuild (POST), which only adds days without a snapshot.
 */
export function RebuildHistoryCard() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<HistoryRebuild | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);

  async function check() {
    setBusy("preview");
    try {
      setPreview(await api.get<HistoryRebuild>("/portfolio/rebuild-history/"));
    } catch {
      toast.error(t("history.failed"));
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    setBusy("apply");
    try {
      const res = await api.post<HistoryRebuild>("/portfolio/rebuild-history/", {});
      toast.success(t("history.done", { count: res.created }));
      setPreview(null);
      // Charts, net worth and returns all read the snapshots
      await queryClient.invalidateQueries();
    } catch {
      toast.error(t("history.failed"));
    } finally {
      setBusy(null);
    }
  }

  const fallback = preview?.assets.filter((a) => a.source === "OPERATIONS") ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
          {t("history.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("history.desc")}</p>

        {preview && preview.days === 0 && <p className="text-sm">{t("history.nothing")}</p>}

        {preview && preview.days > 0 && (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p>
              {t("history.willCreate", {
                count: preview.days,
                from: formatDate(preview.first_date),
                to: formatDate(preview.last_date),
              })}
            </p>
            {preview.lowest && (
              <p className="text-muted-foreground">
                {t("history.lowest", { date: formatDate(preview.lowest.date) })}{" "}
                <span className={cn("font-medium tabular-nums", moneyColor(preview.lowest.pnl_pct))}>
                  {formatPct(preview.lowest.pnl_pct)}
                </span>
              </p>
            )}
            {fallback.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("history.noYahoo", { names: fallback.map((a) => a.asset_name).join(", ") })}
              </p>
            )}
            {preview.purged_before && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t("history.purged", { date: formatDate(preview.purged_before) })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t("history.effects")}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" onClick={check} disabled={busy !== null}>
            {busy === "preview" ? `${t("common.loading")}...` : t("history.check")}
          </Button>
          {preview && preview.days > 0 && (
            <Button size="sm" onClick={apply} disabled={busy !== null}>
              {busy === "apply" ? `${t("common.loading")}...` : t("history.apply", { count: preview.days })}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
