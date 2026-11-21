"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, pollTask } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/app/data-table";
import { MoneyCell, PctCell } from "@/components/app/money-cell";
import { PendingSplitsBanner } from "@/components/app/pending-splits-banner";
import { PortfolioSummaryCard } from "@/components/app/portfolio-summary-card";
import { ReturnsDetails, useReturns } from "@/components/app/returns-details";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SplitBadge } from "@/components/app/split-badge";
import Link from "next/link";
import { describeSplit } from "@/lib/splits";
import { ArrowRight, Info, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";

const PriceChart = dynamic(
  () => import("@/components/app/price-chart").then((m) => ({ default: m.PriceChart })),
  { ssr: false },
);
const InvestedCapitalChart = dynamic(
  () => import("@/components/app/invested-capital-chart").then((m) => ({ default: m.InvestedCapitalChart })),
  { ssr: false },
);
const RVEvolutionChart = dynamic(
  () => import("@/components/app/rv-evolution-chart").then((m) => ({ default: m.RVEvolutionChart })),
  { ssr: false },
);
import { formatMoney, formatPct, moneyColor, uiLocale } from "@/lib/utils";
import { ASSET_TYPE_BADGE_COLORS } from "@/lib/constants";
import type { PortfolioData, Position } from "@/types";
import { useTranslations } from "@/i18n/use-translations";

export function PortfolioContent() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);
  const [priceResult, setPriceResult] = useState<{
    updated: number;
    errors: string[];
  } | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(
    null,
  );
  const [summaryChart, setSummaryChart] = useState<"rv" | "cost" | "returns" | null>(null);

  const { data: portfolio, isLoading } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.get<PortfolioData>("/portfolio/"),
    staleTime: 5 * 60_000,
  });

  const handleUpdatePrices = async () => {
    setUpdating(true);
    setPriceResult(null);
    try {
      const res = await api.post<{ task_id: string }>(
        "/assets/update-prices/",
      );
      const taskResult = await pollTask(res.task_id);
      if (taskResult.status === "FAILURE")
        throw new Error(taskResult.error ?? "Error");
      const result = taskResult.result as {
        updated: number;
        errors: string[];
      };
      setPriceResult({ updated: result.updated, errors: result.errors });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    } catch {
      setPriceResult({ updated: 0, errors: [t("common.error")] });
    } finally {
      setUpdating(false);
    }
  };

  const totals = portfolio?.totals;

  // Annual money-weighted return of each position (dividends included): shown only in the position dialog
  const { data: returns } = useReturns();
  const selectedAnnual = selectedPosition
    ? returns?.assets.find((a) => a.asset_id === selectedPosition.asset_id)
    : undefined;

  const positionColumns: Column<Position>[] = [
    {
      key: "name",
      header: t("common.name"),
      render: (p) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{p.asset_name}</span>
          {p.asset_ticker && (
            <span className="text-xs text-muted-foreground">
              {p.asset_ticker}
            </span>
          )}
          <SplitBadge splits={p.splits} />
        </div>
      ),
    },
    {
      key: "type",
      header: t("common.type"),
      render: (p) => <Badge className={ASSET_TYPE_BADGE_COLORS[p.asset_type] ?? ""} variant="secondary">{p.asset_type}</Badge>,
    },
    {
      key: "qty",
      header: t("portfolio.quantity"),
      className: "text-right",
      render: (p) => (
        <span className="font-mono text-sm tabular-nums">
          {parseFloat(p.quantity).toFixed(4)}
        </span>
      ),
    },
    {
      key: "cost",
      header: t("portfolio.cost"),
      className: "text-right",
      render: (p) => <MoneyCell value={p.cost_basis} />,
    },
    {
      key: "price",
      header: t("portfolio.currentPrice"),
      className: "text-right",
      render: (p) => <MoneyCell value={p.current_price} isPublic />,
    },
    {
      key: "value",
      header: t("portfolio.value"),
      className: "text-right",
      render: (p) => (
        <span className="font-semibold text-base">
          {formatMoney(p.market_value)}
        </span>
      ),
    },
    {
      key: "pnl",
      header: "P&L",
      className: "text-right",
      render: (p) => (
        <div className="text-right">
          <MoneyCell value={p.unrealized_pnl} colored />
          <div
            className={`text-xs ${moneyColor(p.unrealized_pnl_pct) || "text-muted-foreground"}`}
          >
            <PctCell value={p.unrealized_pnl_pct} />
          </div>
        </div>
      ),
    },
    {
      key: "weight",
      header: t("portfolio.weight"),
      className: "text-right",
      render: (p) => (
        <span className="font-mono text-sm tabular-nums">
          {parseFloat(p.weight).toFixed(1)}%
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header + Update Prices button */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("portfolio.positions")}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleUpdatePrices}
          disabled={updating}
        >
          <RefreshCw
            className={`h-4 w-4 sm:mr-2 ${updating ? "animate-spin" : ""}`}
          />
          <span className="hidden sm:inline">
            {updating ? t("common.loading") : t("portfolio.updatePrices")}
          </span>
        </Button>
      </div>

      <PendingSplitsBanner />

      {priceResult && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">{priceResult.updated}</span>{" "}
          {t("portfolio.pricesUpdated")}
          {priceResult.errors.length > 0 && (
            <span className="text-destructive ml-1">
              · {priceResult.errors.length} {t("common.error").toLowerCase()}
            </span>
          )}
        </p>
      )}

      {/* One summary: market value, unrealized P&L, % gained and annual return */}
      {totals && <PortfolioSummaryCard totals={totals} onOpen={setSummaryChart} />}

      {/* Mobile: clickable position cards */}
      <div className="space-y-3 md:hidden">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border bg-card p-4 space-y-3"
              >
                <div className="h-4 w-36 animate-pulse rounded bg-muted" />
                <div className="h-7 w-28 animate-pulse rounded bg-muted" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              </div>
            ))
          : portfolio?.positions.map((p) => {
              const pnl = parseFloat(p.unrealized_pnl);
              const pnlPct = parseFloat(p.unrealized_pnl_pct);
              const weight = parseFloat(p.weight);
              const isPos = pnl >= 0;
              const col = isPos ? "text-green-500" : "text-red-500";

              return (
                <button
                  key={p.asset_id}
                  onClick={() => setSelectedPosition(p)}
                  className="w-full text-left rounded-lg border bg-card p-4 transition-all duration-200 active:bg-muted/40 hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm leading-tight truncate">
                        {p.asset_name}
                      </p>
                      {(p.asset_ticker || (p.splits?.length ?? 0) > 0) && (
                        <div className="mt-0.5 flex items-center gap-1.5">
                          {p.asset_ticker && (
                            <p className="text-xs text-muted-foreground">
                              {p.asset_ticker}
                            </p>
                          )}
                          <SplitBadge splits={p.splits} />
                        </div>
                      )}
                    </div>
                    <Badge variant="secondary" className={`shrink-0 ${ASSET_TYPE_BADGE_COLORS[p.asset_type] ?? ""}`}>
                      {p.asset_type}
                    </Badge>
                  </div>

                  <div className="flex items-end justify-between mb-3">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[1.5px] text-muted-foreground mb-0.5">
                        {t("portfolio.value")}
                      </p>
                      <p className="text-xl font-bold tabular-nums leading-none">
                        {formatMoney(p.market_value)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[9px] uppercase tracking-[1.5px] text-muted-foreground mb-0.5">
                        P&L
                      </p>
                      <p
                        className={`text-base font-bold tabular-nums leading-none ${col}`}
                      >
                        {isPos ? "+" : ""}
                        {formatMoney(pnl)}
                      </p>
                      <p className={`text-xs tabular-nums mt-0.5 ${col}`}>
                        {pnlPct >= 0 ? "+" : ""}
                        {pnlPct.toFixed(2)}%
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span>
                      {t("portfolio.cost")}:{" "}
                      <span className="font-medium text-foreground">
                        {formatMoney(p.cost_basis)}
                      </span>
                    </span>
                    <span>{parseFloat(p.quantity).toFixed(4)} uds.</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(weight, 100)}%`,
                          backgroundColor: "#3b82f6",
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground tabular-nums w-9 text-right">
                      {weight.toFixed(1)}%
                    </span>
                  </div>
                </button>
              );
            })}
      </div>

      {/* Desktop: table with clickable rows */}
      <div className="hidden md:block">
        <DataTable
          columns={positionColumns}
          data={portfolio?.positions ?? []}
          keyFn={(p) => p.asset_id}
          emptyMessage={isLoading ? t("common.loading") : t("common.noData")}
          onRowClick={(row) => setSelectedPosition(row)}
        />
      </div>

      {/* Asset evolution dialog */}
      <Dialog
        open={!!selectedPosition}
        onOpenChange={(open) => {
          if (!open) setSelectedPosition(null);
        }}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] p-0 overflow-hidden gap-0">
          <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="truncate">{selectedPosition?.asset_name}</span>
              {selectedPosition?.asset_ticker && (
                <span className="text-sm font-normal text-muted-foreground shrink-0">
                  {selectedPosition.asset_ticker}
                </span>
              )}
              {selectedPosition?.asset_type && (
                <Badge variant="secondary" className="shrink-0">
                  {selectedPosition.asset_type}
                </Badge>
              )}
            </DialogTitle>
            {selectedPosition?.splits?.length ? (
              <p className="text-xs text-muted-foreground">
                {t("splits.includes", {
                  detail: selectedPosition.splits.map((sp) => describeSplit(sp, t)).join(" · "),
                })}{" "}
                ·{" "}
                <Link
                  href={`/assets/${selectedPosition.asset_id}#position-history`}
                  className="text-primary hover:underline"
                >
                  {t("splits.viewHistory")}
                </Link>
              </p>
            ) : null}
            {selectedPosition && (
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("portfolio.gainedPct")}</p>
                    <p className={`text-lg font-bold leading-tight tabular-nums ${moneyColor(selectedPosition.unrealized_pnl_pct)}`}>
                      {formatPct(selectedPosition.unrealized_pnl_pct)}
                    </p>
                  </div>
                  {selectedAnnual?.xirr_pct != null && (
                    <div>
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        {t("portfolio.annualReturn")}
                        <TooltipProvider delay={150}>
                          <Tooltip>
                            <TooltipTrigger className="inline-flex" aria-label={t("portfolio.annualHint")}>
                              <Info className="h-3 w-3 cursor-help text-muted-foreground/70" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              {t("portfolio.annualHint")}
                              {!selectedAnnual.reliable && ` ${t("returns.notReliable")}`}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </p>
                      <p className={`text-lg font-bold leading-tight tabular-nums ${moneyColor(selectedAnnual.xirr_pct)}`}>
                        {formatPct(selectedAnnual.xirr_pct)}
                        {!selectedAnnual.reliable && "*"}
                      </p>
                    </div>
                  )}
                </div>
                <dl className="grid grid-cols-3 gap-x-3 gap-y-1">
                  {[
                    [t("portfolio.quantity"), parseFloat(selectedPosition.quantity).toFixed(4)],
                    [t("portfolio.avgCost"), formatMoney(selectedPosition.avg_cost, selectedPosition.currency)],
                    [t("portfolio.weight"), `${parseFloat(selectedPosition.weight).toFixed(1)}%`],
                    [t("portfolio.cost"), formatMoney(selectedPosition.cost_basis, selectedPosition.currency)],
                    [t("portfolio.value"), formatMoney(selectedPosition.market_value, selectedPosition.currency)],
                    ["P&L", formatMoney(selectedPosition.unrealized_pnl, selectedPosition.currency), moneyColor(selectedPosition.unrealized_pnl)],
                  ].map(([label, value, color]) => (
                    <div key={label} className="min-w-0">
                      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
                      <dd className={`truncate text-[13px] font-medium tabular-nums ${color ?? ""}`}>{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {selectedAnnual?.first_date && (
                    <span>
                      {t("portfolio.heldSince")}{" "}
                      {new Date(`${selectedAnnual.first_date}T00:00:00`).toLocaleDateString(uiLocale(), {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                      {" ·"}
                    </span>
                  )}
                  <Link
                    href={`/assets/${selectedPosition.asset_id}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {t("portfolio.openAsset")}
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </p>
              </div>
            )}
          </DialogHeader>
          {selectedPosition && (
            <PriceChart assetId={selectedPosition.asset_id} ticker={selectedPosition.asset_ticker ?? null} />
          )}
        </DialogContent>
      </Dialog>

      {/* The summary card opens the equity evolution, the money invested over time or the returns details */}
      <Dialog open={summaryChart !== null} onOpenChange={(o) => !o && setSummaryChart(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {summaryChart === "cost"
                ? t("portfolio.investedCapital")
                : summaryChart === "returns"
                  ? t("returns.title")
                  : t("dashboard.rvEvolution")}
            </DialogTitle>
          </DialogHeader>
          {summaryChart === "rv" && (
            <div className="[&>div]:border-0 [&>div]:shadow-none">
              <RVEvolutionChart />
            </div>
          )}
          {summaryChart === "cost" && (
            <div className="px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
              <InvestedCapitalChart />
            </div>
          )}
          {summaryChart === "returns" && (
            <div className="px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
              <ReturnsDetails />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
