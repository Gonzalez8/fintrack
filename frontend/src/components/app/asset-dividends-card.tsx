"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "@/i18n/use-translations";
import type { Asset, DividendSuggestion } from "@/types";

/**
 * Backfill of dividend drafts for one asset: looks back to the first purchase
 * (the daily detection only looks after the last recorded dividend).
 */
export function AssetDividendsCard({ asset }: { asset: Asset }) {
  const t = useTranslations();
  const queryClient = useQueryClient();

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

  if (!asset.ticker || asset.price_mode !== "AUTO") return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
          {t("dividendDrafts.assetCardTitle")}
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          disabled={backfillMut.isPending}
          onClick={() => backfillMut.mutate()}
        >
          <HandCoins className="h-3.5 w-3.5" />
          {backfillMut.isPending ? t("common.loading") : t("dividendDrafts.backfill")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-1 text-xs text-muted-foreground">
        <p>{t("dividendDrafts.assetCardHelp")}</p>
        <Link href="/dividends" className="text-primary hover:underline">
          {t("dividendDrafts.goToDividends")}
        </Link>
      </CardContent>
    </Card>
  );
}
