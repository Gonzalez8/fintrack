"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, pollTask } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/app/data-table";
import { MoneyCell, PctCell } from "@/components/app/money-cell";
import { AssetEvolutionChart } from "@/components/app/asset-evolution-chart";
import { RefreshCw } from "lucide-react";
import { formatMoney, moneyColor } from "@/lib/utils";
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

  const { data: portfolio, isLoading } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.get<PortfolioData>("/portfolio/"),
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
  const totalPnl = parseFloat(totals?.total_unrealized_pnl ?? "0");
  const totalCost = parseFloat(totals?.total_cost ?? "0");
  const totalPnlPct =
    totalCost > 0 ? ((totalPnl / totalCost) * 100).toFixed(2) : "0";
  const pnlColor = moneyColor(totals?.total_unrealized_pnl);

  const positionColumns: Column<Position>[] = [
    {
      key: "name",
      header: t("common.name"),
      render: (p) => (
        <div>
          <span className="font-medium">{p.asset_name}</span>
          {p.asset_ticker && (
            <span className="ml-2 text-xs text-muted-foreground">
              {p.asset_ticker}
            </span>
          )}
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
      render: (p) => <MoneyCell value={p.current_price} />,
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

      {/* 4 Summary cards: Mercado, P&L, Coste, Efectivo */}
      {totals && (
        <div className="grid gap-3 grid-cols-2 sm:gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">
                {t("dashboard.marketValue")}
              </p>
              <p className="text-lg sm:text-2xl font-bold">
                {formatMoney(totals.total_market_value)}
              </p>
            </CardContent>
          </Card>
          <Card
            className={
              totalPnl >= 0
                ? "border-green-500/20 bg-green-500/5"
                : "border-red-500/20 bg-red-500/5"
            }
          >
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">
                {t("dashboard.unrealizedPnl")}
              </p>
              <p className={`text-lg sm:text-2xl font-bold ${pnlColor}`}>
                {formatMoney(totals.total_unrealized_pnl)}
              </p>
              <p className={`text-sm ${pnlColor}`}>{totalPnlPct}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">
                {t("dashboard.totalCost")}
              </p>
              <p className="text-base sm:text-lg font-semibold">
                {formatMoney(totals.total_cost)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">
                {t("dashboard.cash")}
              </p>
              <p className="text-base sm:text-lg font-semibold">
                {formatMoney(totals.total_cash)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

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
                      {p.asset_ticker && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.asset_ticker}
                        </p>
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
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2">
              {selectedPosition?.asset_name}
              {selectedPosition?.asset_ticker && (
                <span className="text-sm font-normal text-muted-foreground">
                  {selectedPosition.asset_ticker}
                </span>
              )}
              {selectedPosition?.asset_type && (
                <Badge variant="secondary">
                  {selectedPosition.asset_type}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedPosition && (
            <AssetEvolutionChart position={selectedPosition} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
