"use client";

import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTranslations } from "@/i18n/use-translations";
import { cn, formatMoney, formatPct, moneyColor } from "@/lib/utils";
import type { PortfolioData } from "@/types";
import { useReturns } from "./returns-details";

/**
 * The one summary of the equity portfolio: market value, unrealized P&L (€ and %) and the annualized return.
 * The body opens the equity evolution; the footer opens the money invested over time and the index comparison.
 */
export function PortfolioSummaryCard({
  totals,
  onOpen,
}: {
  totals: PortfolioData["totals"];
  onOpen: (view: "rv" | "cost" | "returns") => void;
}) {
  const t = useTranslations();
  const { data: returns } = useReturns();

  const pnl = parseFloat(totals.total_unrealized_pnl);
  const cost = parseFloat(totals.total_cost);
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  const xirr = returns?.portfolio.xirr_pct ?? null;

  const stats: { label: string; value: string; color: string }[] = [
    { label: t("dashboard.unrealizedPnl"), value: formatMoney(totals.total_unrealized_pnl), color: moneyColor(pnl) },
    { label: t("portfolio.gainedPct"), value: formatPct(pnlPct), color: moneyColor(pnl) },
    {
      label: t("portfolio.annualReturn"),
      value: xirr == null ? "—" : `${formatPct(xirr)}`,
      color: moneyColor(xirr),
    },
  ];

  const footerBtn =
    "flex min-w-0 flex-1 basis-0 items-center justify-between gap-1 px-3 py-2.5 text-left text-[13px] sm:gap-2 sm:px-4 sm:text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <button
        type="button"
        onClick={() => onOpen("rv")}
        className="w-full space-y-4 p-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{t("dashboard.marketValue")}</p>
            <p className="text-2xl font-bold tabular-nums sm:text-3xl">{formatMoney(totals.total_market_value)}</p>
          </div>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{s.label}</p>
              <p className={cn("text-base font-semibold tabular-nums sm:text-lg", s.color)}>{s.value}</p>
            </div>
          ))}
        </div>
      </button>
      <div className="flex divide-x border-t">
        <button type="button" onClick={() => onOpen("cost")} className={footerBtn}>
          <span className="min-w-0">
            <span className="block truncate text-xs text-muted-foreground">{t("dashboard.totalCost")}</span>
            <span className="block font-medium tabular-nums">{formatMoney(totals.total_cost)}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => onOpen("returns")} className={footerBtn}>
          <span className="min-w-0">
            <span className="block truncate text-xs text-muted-foreground">{t("returns.title")}</span>
            <span className="block truncate font-medium">{t("portfolio.compareWithIndex")}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>
    </Card>
  );
}
