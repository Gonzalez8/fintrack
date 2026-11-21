"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "@/i18n/use-translations";
import { formatMoney, uiLocale } from "@/lib/utils";
import type { Asset, Dividend, DividendSuggestion, PaginatedResponse } from "@/types";

const VISIBLE = 5; // most recent payments shown before "show all"

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(uiLocale(), { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Dividends recorded for one asset (newest first, with the net total) and, for Yahoo-priced assets, the backfill
 * of dividend drafts: it looks back to the first purchase (the daily detection only looks after the last one).
 */
export function AssetDividendsCard({ asset }: { asset: Asset }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const canBackfill = Boolean(asset.ticker) && asset.price_mode === "AUTO";
  const [showAll, setShowAll] = useState(false);

  const { data } = useQuery({
    queryKey: ["dividends", { asset_id: asset.id }],
    queryFn: () => api.get<PaginatedResponse<Dividend>>(`/dividends/?asset_id=${asset.id}&page_size=1000`),
    staleTime: 60 * 1000,
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
  if (dividends.length === 0 && !canBackfill) return null;
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
        {dividends.length > 0 ? (
          <>
            <p className="text-sm">
              {t("dividends.assetSummary", { count: dividends.length })}{" "}
              <span className="font-semibold tabular-nums text-green-500">{formatMoney(totalNet, asset.currency)}</span>
            </p>
            <ul className="divide-y text-sm">
              {(showAll ? dividends : dividends.slice(0, VISIBLE)).map((d) => {
                const withheld = parseFloat(d.tax) + parseFloat(d.domestic_tax || "0");
                return (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="font-medium">{formatDay(d.date)}</p>
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
            {dividends.length > VISIBLE && (
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setShowAll((v) => !v)}>
                {showAll ? t("common.showLess") : t("common.showAll", { count: dividends.length })}
              </Button>
            )}
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
