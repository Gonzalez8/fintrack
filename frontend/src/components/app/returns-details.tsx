"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n/use-translations";
import { cn, formatMoney, formatPct, moneyColor, uiLocale } from "@/lib/utils";
import type { ReturnsData, ReturnsSummary } from "@/types";

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString(uiLocale(), { day: "numeric", month: "short", year: "numeric" });
}

function Figures({
  data, t, returnedKey = "returns.returned",
}: { data: ReturnsSummary; t: ReturnType<typeof useTranslations>; returnedKey?: string }) {
  const rows: [string, string, string?][] = [
    [t("returns.invested"), formatMoney(data.invested)],
    [t(returnedKey), formatMoney(data.returned)],
    [t("returns.valueToday"), formatMoney(data.market_value)],
    [t("returns.totalGain"), formatMoney(data.total_gain), moneyColor(data.total_gain)],
  ];
  return (
    <dl className="space-y-1 text-sm">
      {rows.map(([label, value, color]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className={cn("font-mono tabular-nums", color)}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Rate({ data, t }: { data: ReturnsSummary; t: ReturnType<typeof useTranslations> }) {
  return (
    <p className={cn("text-2xl font-bold tabular-nums", moneyColor(data.xirr_pct))}>
      {data.xirr_pct == null ? "—" : formatPct(data.xirr_pct)}
      <span className="ml-1 text-sm font-normal text-muted-foreground">{t("returns.perYear")}</span>
    </p>
  );
}

export const DEFAULT_BENCHMARK = "msci_world";

/** Returns of the portfolio vs one benchmark; the same cache feeds the summary card and the details. */
export function useReturns(benchmark = DEFAULT_BENCHMARK) {
  return useQuery({
    queryKey: ["portfolio-returns", benchmark],
    queryFn: () => api.get<ReturnsData>(`/portfolio/returns/?benchmark=${benchmark}`),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Annualized money-weighted return (XIRR) of the portfolio, compared with the same money invested on the same
 * days in an accumulating index ETF, and the return of every asset ever held (sold ones included).
 * Rendered inside a dialog opened from the portfolio summary card.
 */
export function ReturnsDetails() {
  const t = useTranslations();
  const [benchmark, setBenchmark] = useState(DEFAULT_BENCHMARK);
  const [byAsset, setByAsset] = useState(false);
  const { data, isLoading } = useReturns(benchmark);

  if (isLoading) return <div className="h-56 animate-pulse rounded-lg bg-muted/30" />;
  if (!data || !data.portfolio.first_date) {
    return <p className="text-sm text-muted-foreground">{t("returns.noData")}</p>;
  }

  const mine = data.portfolio;
  const bench = data.benchmark;
  const diff = bench ? parseFloat(mine.total_gain) - parseFloat(bench.total_gain) : 0;
  const pp = bench && mine.xirr_pct != null && bench.xirr_pct != null
    ? parseFloat(mine.xirr_pct) - parseFloat(bench.xirr_pct)
    : null;

  return (
    <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold">{t("returns.title")}</h2>
            <p className="max-w-prose text-xs text-muted-foreground">{t("returns.explain")}</p>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t("returns.compareWith")}>
            {data.benchmarks.map((b) => (
              <Button
                key={b.key}
                size="sm"
                variant={b.key === benchmark ? "default" : "outline"}
                aria-pressed={b.key === benchmark}
                onClick={() => setBenchmark(b.key)}
              >
                {b.name}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              {t("returns.yourPortfolio")} · {t("returns.since", { date: formatDay(mine.first_date) })}
            </p>
            <Rate data={mine} t={t} />
            <Figures data={mine} t={t} />
          </div>
          <div className="space-y-2 rounded-md border p-3">
            {bench ? (
              <>
                <p className="text-xs text-muted-foreground">{t("returns.sameMoneyIn", { name: bench.name })}</p>
                <Rate data={bench} t={t} />
                <Figures data={bench} t={t} returnedKey="returns.returnedSales" />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("returns.benchmarkUnavailable")}</p>
            )}
          </div>
        </div>

        {bench && (
          <p className={cn("text-sm font-medium", moneyColor(diff))}>
            {t(diff >= 0 ? "returns.aheadOfIndex" : "returns.behindIndex", {
              amount: formatMoney(Math.abs(diff)),
              name: bench.name,
            })}
            {pp != null && (
              <span className="ml-1 font-normal text-muted-foreground">
                ({t("returns.pointsPerYear", { pp: `${pp >= 0 ? "+" : ""}${pp.toFixed(2)}` })})
              </span>
            )}
          </p>
        )}

        <div className="space-y-1 text-xs text-muted-foreground">
          {!mine.reliable && <p>{t("returns.notReliable")}</p>}
          {bench?.starts_late && <p>{t("returns.startsLate", { name: bench.name })}</p>}
          {bench && <p>{t("returns.indexNote", { ticker: bench.ticker, date: formatDay(bench.price_date) })}</p>}
        </div>

        {data.assets.length > 0 && (
          <div className="space-y-2">
            <Button variant="outline" size="sm" aria-expanded={byAsset} onClick={() => setByAsset((v) => !v)}>
              {t("returns.byAsset")}
            </Button>
            {byAsset && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t("returns.byAssetHint")}</p>
                <ul className="divide-y text-sm">
                  {data.assets.map((a) => (
                    <li key={a.asset_id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{a.asset_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("returns.since", { date: formatDay(a.first_date) })}
                          {!a.is_open && (
                            <Badge variant="outline" className="ml-2 text-[10px]">{t("returns.closed")}</Badge>
                          )}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("font-mono tabular-nums", moneyColor(a.xirr_pct))}>
                          {a.xirr_pct == null ? "—" : formatPct(a.xirr_pct)}
                          {!a.reliable && a.xirr_pct != null && <span title={t("returns.notReliable")}>*</span>}
                        </p>
                        <p className={cn("text-xs font-mono tabular-nums", moneyColor(a.total_gain))}>
                          {formatMoney(a.total_gain)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">* {t("returns.notReliable")}</p>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
