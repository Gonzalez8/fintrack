"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslations } from "@/i18n/use-translations";
import { formatSplitDate } from "@/lib/splits";
import { cn, formatQty, uiLocale } from "@/lib/utils";
import type { DividendSuggestion, PaginatedResponse } from "@/types";

export const DIVIDEND_SUGGESTIONS_KEY = ["dividend-suggestions", "PENDING"];

/**
 * Amount in the draft's own currency, in the UI locale. Per-share amounts keep
 * up to 4 decimals (e.g. 0,0476 €) so small dividends are not rounded away.
 */
export function formatDraftAmount(value: string, currency: string, perShare = false): string {
  const digits = perShare ? { minimumFractionDigits: 2, maximumFractionDigits: 4 } : {};
  try {
    return Number(value).toLocaleString(uiLocale(), { style: "currency", currency, ...digits });
  } catch {
    return `${Number(value).toFixed(perShare ? 4 : 2)} ${currency}`;
  }
}

/**
 * Dividend drafts detected from Yahoo, waiting for review. "Review" opens the
 * dividend dialog pre-filled (``onReview``) or, outside the dividends page,
 * links there; nothing is recorded until the user saves it.
 */
export function PendingDividendsBanner({ onReview }: { onReview?: (s: DividendSuggestion) => void }) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: DIVIDEND_SUGGESTIONS_KEY,
    queryFn: () =>
      api.get<PaginatedResponse<DividendSuggestion>>("/dividend-suggestions/?status=PENDING&page_size=1000"),
    staleTime: 60 * 1000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["dividend-suggestions"] });
  const dismissMut = useMutation({
    mutationFn: (id: string) => api.post(`/dividend-suggestions/${id}/dismiss/`),
    onSuccess: refresh,
  });
  const dismissAllMut = useMutation({
    mutationFn: () => api.post("/dividend-suggestions/dismiss-all/"),
    onSuccess: refresh,
  });

  const pending = data?.results ?? [];
  if (pending.length === 0) return null;
  const busy = dismissMut.isPending || dismissAllMut.isPending;

  return (
    <Card className="border-emerald-500/40 bg-emerald-500/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <HandCoins className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <div>
              <p className="text-sm font-semibold">{t("dividendDrafts.title", { count: pending.length })}</p>
              <p className="text-xs text-muted-foreground">{t("dividendDrafts.description")}</p>
            </div>
          </div>
          {pending.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 text-xs"
              disabled={busy}
              onClick={() => {
                if (confirm(t("dividendDrafts.confirmDismissAll"))) dismissAllMut.mutate();
              }}
            >
              {t("dividendDrafts.dismissAll")}
            </Button>
          )}
        </div>

        <ul className="space-y-2">
          {pending.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 text-sm">
                <span className="font-mono font-semibold">{s.asset_ticker ?? s.asset_name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {t("dividendDrafts.exDate")} {formatSplitDate(s.ex_date)} · {formatQty(s.shares)} ×{" "}
                  {formatDraftAmount(s.amount_per_share, s.currency, true)}
                </span>
                <span className="ml-1 font-semibold tabular-nums">
                  ≈ {formatDraftAmount(s.gross, s.currency)} {t("dividendDrafts.grossShort")}
                </span>
              </div>
              <div className="flex gap-2">
                {onReview ? (
                  <Button size="sm" className="flex-1 sm:flex-none" disabled={busy} onClick={() => onReview(s)}>
                    {t("dividendDrafts.review")}
                  </Button>
                ) : (
                  <Link
                    href={`/dividends?review=${s.id}`}
                    className={cn(buttonVariants({ size: "sm" }), "flex-1 sm:flex-none")}
                  >
                    {t("dividendDrafts.review")}
                  </Link>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 sm:flex-none"
                  disabled={busy}
                  onClick={() => dismissMut.mutate(s.id)}
                >
                  {t("dividendDrafts.dismiss")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
