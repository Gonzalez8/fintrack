"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ShowAllButton, useCollapsedList } from "@/components/app/collapsed-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "@/i18n/use-translations";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import type { Asset, Dividend, DividendSuggestion, PaginatedResponse } from "@/types";

/**
 * Dividends of one asset: its drafts (pending to review or dismiss, dismissed to restore), the recorded ones
 * (newest first, with the net total) and, for Yahoo-priced assets, the backfill
 * of dividend drafts: it looks back to the first purchase (the daily detection only looks after the last one).
 */
export function AssetDividendsCard({ asset }: { asset: Asset }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const canBackfill = Boolean(asset.ticker) && asset.price_mode === "AUTO";

  const { data } = useQuery({
    queryKey: ["dividends", { asset_id: asset.id }],
    queryFn: () => api.get<PaginatedResponse<Dividend>>(`/dividends/?asset_id=${asset.id}&page_size=1000`),
    staleTime: 60 * 1000,
  });

  // Drafts of this asset: pending ones to review, dismissed ones to restore (detection never proposes them again)
  const { data: drafts } = useQuery({
    queryKey: ["dividend-suggestions", { asset_id: asset.id }],
    queryFn: () =>
      api.get<PaginatedResponse<DividendSuggestion>>(`/dividend-suggestions/?asset_id=${asset.id}&page_size=1000`),
    staleTime: 60 * 1000,
  });
  const refreshDrafts = () => queryClient.invalidateQueries({ queryKey: ["dividend-suggestions"] });
  const dismissMut = useMutation({
    mutationFn: (id: string) => api.post(`/dividend-suggestions/${id}/dismiss/`),
    onSuccess: refreshDrafts,
  });
  const restoreMut = useMutation({
    mutationFn: (id: string) => api.post(`/dividend-suggestions/${id}/restore/`),
    onSuccess: refreshDrafts,
  });

  const backfillMut = useMutation({
    mutationFn: () =>
      api.post<{ created: DividendSuggestion[] }>("/dividend-suggestions/detect/", {
        asset_id: asset.id,
        backfill: true,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["dividend-suggestions"] });
      if (res.created.length > 0) toast.success(t("dividendDrafts.detectFound", { count: res.created.length }));
      else toast(t("dividendDrafts.detectNone"));
    },
    onError: () => toast.error(t("dividendDrafts.detectError")),
  });

  const dividends = [...(data?.results ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const shown = useCollapsedList(dividends);
  const byDate = (a: DividendSuggestion, b: DividendSuggestion) => b.ex_date.localeCompare(a.ex_date);
  const pending = (drafts?.results ?? []).filter((d) => d.status === "PENDING").sort(byDate);
  const dismissed = (drafts?.results ?? []).filter((d) => d.status === "DISMISSED").sort(byDate);
  const busy = dismissMut.isPending || restoreMut.isPending;
  if (dividends.length === 0 && pending.length === 0 && dismissed.length === 0 && !canBackfill) return null;
  const totalNet = dividends.reduce((sum, d) => sum + parseFloat(d.net), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
          {t("dividendDrafts.assetCardTitle")}
        </CardTitle>
        {canBackfill && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            title={t("dividendDrafts.assetCardHelp")}
            disabled={backfillMut.isPending}
            onClick={() => backfillMut.mutate()}
          >
            <HandCoins className="h-3.5 w-3.5" />
            {backfillMut.isPending ? t("common.loading") : t("dividendDrafts.backfill")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {(pending.length > 0 || dismissed.length > 0) && (
          <ul className="divide-y rounded-md border text-sm">
            {[...pending, ...dismissed].map((d) => {
              const isPending = d.status === "PENDING";
              return (
                <li key={d.id} className={cn("flex items-center justify-between gap-3 px-3 py-2", !isPending && "opacity-60")}>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 font-medium">
                      <span className="whitespace-nowrap">{formatDate(d.ex_date)}</span>
                      <Badge variant={isPending ? "secondary" : "outline"} className="text-[10px]">
                        {isPending ? t("dividendDrafts.statusPending") : t("dividendDrafts.statusDismissed")}
                      </Badge>
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {t("dividendDrafts.exDateEstimate", { net: formatMoney(d.net, d.currency) })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {isPending ? (
                      <>
                        <Link href={`/dividends?review=${d.id}`} className="px-2 text-xs text-primary hover:underline">
                          {t("dividendDrafts.review")}
                        </Link>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy}
                          onClick={() => dismissMut.mutate(d.id)}>
                          {t("dividendDrafts.dismiss")}
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={busy}
                        title={t("dividendDrafts.restoreHint")} onClick={() => restoreMut.mutate(d.id)}>
                        {t("dividendDrafts.restore")}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {dividends.length > 0 ? (
          <>
            <p className="text-sm">
              {t("dividends.assetSummary", { count: dividends.length })}{" "}
              <span className="font-semibold tabular-nums text-green-500">{formatMoney(totalNet, asset.currency)}</span>
            </p>
            <ul className="divide-y text-sm">
              {shown.items.map((d) => {
                const withheld = parseFloat(d.tax) + parseFloat(d.domestic_tax || "0");
                return (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="font-medium">{formatDate(d.date)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {t("dividends.gross")} {formatMoney(d.gross, asset.currency)} · {t("dividends.retention")}{" "}
                        {formatMoney(withheld, asset.currency)}
                      </p>
                    </div>
                    <p className="shrink-0 font-mono tabular-nums text-green-500">{formatMoney(d.net, asset.currency)}</p>
                  </li>
                );
              })}
            </ul>
            <ShowAllButton list={shown} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{t("dividendDrafts.assetCardHelp")}</p>
        )}
        <Link href="/dividends" className="text-xs text-primary hover:underline">
          {t("dividendDrafts.goToDividends")}
        </Link>
      </CardContent>
    </Card>
  );
}
