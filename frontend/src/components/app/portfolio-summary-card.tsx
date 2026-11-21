"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { useTranslations } from "@/i18n/use-translations";
import { cn, formatMoney, formatPct, moneyColor } from "@/lib/utils";
import type { PortfolioData, RVEvolutionPoint } from "@/types";
import { useReturns } from "./returns-details";

const SPARK_POINTS = 120;

/**
 * Preview of the equity evolution chart as it opens: last year, unrealized P&L in % of cost (same data and query
 * as RVEvolutionChart), ending at today's live value. No axes; thinned to SPARK_POINTS so it stays light.
 */
function EquitySparkline({ livePct }: { livePct: number }) {
  const { data } = useQuery({
    queryKey: ["rv-evolution"],
    queryFn: () => api.get<RVEvolutionPoint[]>("/reports/rv-evolution/"),
    staleTime: 5 * 60 * 1000,
  });

  const path = useMemo(() => {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const pts = (data ?? [])
      .filter((p) => parseFloat(p.cost) > 0 && new Date(p.captured_at) >= cutoff)
      .map((p) => (parseFloat(p.pnl) / parseFloat(p.cost)) * 100);
    if (pts.length < 2) return null;
    const step = Math.max(1, Math.ceil(pts.length / SPARK_POINTS));
    const values = pts.filter((_, i) => i % step === 0);
    values.push(livePct);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const coords = values.map((v, i) => [
      (i / (values.length - 1)) * 100,
      2 + (1 - (v - min) / span) * 26, // 2..28 inside a 0..30 box
    ]);
    const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    return { line, area: `${line} L100,30 L0,30 Z` };
  }, [data, livePct]);

  if (!path) return null;
  const color = livePct >= 0 ? "#22c55e" : "#ef4444";
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="equity-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={path.area} fill="url(#equity-spark)" />
      <path d={path.line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * The one summary of the equity portfolio: market value, unrealized P&L in € and % (the main figure) and, small
 * under it, the annualized return.
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
          <div className="shrink-0">
            <p className="text-xs text-muted-foreground">{t("dashboard.marketValue")}</p>
            <p className="text-2xl font-bold tabular-nums sm:text-3xl">{formatMoney(totals.total_market_value)}</p>
          </div>
          <div className="ml-auto h-12 min-w-0 max-w-lg flex-1 self-center sm:h-14">
            <EquitySparkline livePct={pnlPct} />
          </div>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{t("dashboard.unrealizedPnl")}</p>
            <p className={cn("text-lg font-semibold tabular-nums", moneyColor(pnl))}>
              {formatMoney(totals.total_unrealized_pnl)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{t("portfolio.gainedPct")}</p>
            <p className={cn("text-lg font-semibold tabular-nums", moneyColor(pnl))}>{formatPct(pnlPct)}</p>
            {xirr != null && (
              <p className="text-xs tabular-nums text-muted-foreground">
                {t("portfolio.perYearShort", { pct: formatPct(xirr) })}
              </p>
            )}
          </div>
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
