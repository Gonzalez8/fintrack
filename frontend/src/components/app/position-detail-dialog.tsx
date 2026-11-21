"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useReturns } from "@/components/app/returns-details";
import { useTranslations } from "@/i18n/use-translations";
import { describeSplit } from "@/lib/splits";
import { formatDate, formatMoney, formatPct, moneyColor } from "@/lib/utils";
import type { Position } from "@/types";

const PriceChart = dynamic(
  () => import("@/components/app/price-chart").then((m) => ({ default: m.PriceChart })),
  { ssr: false },
);

/**
 * Opened from a portfolio position: % gained (main figure) and the annual money-weighted return (explained in a
 * tooltip), the position's figures, a link to the asset page and the price chart.
 */
export function PositionDetailDialog({ position, onClose }: { position: Position | null; onClose: () => void }) {
  const t = useTranslations();
  const { data: returns } = useReturns();
  const annual = position ? returns?.assets.find((a) => a.asset_id === position.asset_id) : undefined;

  return (
  <Dialog
    open={!!position}
    onOpenChange={(open) => {
      if (!open) onClose();
    }}
  >
    <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] p-0 overflow-hidden gap-0">
      <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-2">
        <DialogTitle className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="truncate">{position?.asset_name}</span>
          {position?.asset_ticker && (
            <span className="text-sm font-normal text-muted-foreground shrink-0">
              {position.asset_ticker}
            </span>
          )}
          {position?.asset_type && (
            <Badge variant="secondary" className="shrink-0">
              {position.asset_type}
            </Badge>
          )}
        </DialogTitle>
        {position?.splits?.length ? (
          <p className="text-xs text-muted-foreground">
            {t("splits.includes", {
              detail: position.splits.map((sp) => describeSplit(sp, t)).join(" · "),
            })}{" "}
            ·{" "}
            <Link
              href={`/assets/${position.asset_id}#position-history`}
              className="text-primary hover:underline"
            >
              {t("splits.viewHistory")}
            </Link>
          </p>
        ) : null}
        {position && (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
              <div>
                <p className="text-[11px] text-muted-foreground">{t("portfolio.gainedPct")}</p>
                <p className={`text-lg font-bold leading-tight tabular-nums ${moneyColor(position.unrealized_pnl_pct)}`}>
                  {formatPct(position.unrealized_pnl_pct)}
                </p>
              </div>
              {annual?.xirr_pct != null && (
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
                          {!annual.reliable && ` ${t("returns.notReliable")}`}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </p>
                  <p className={`text-lg font-bold leading-tight tabular-nums ${moneyColor(annual.xirr_pct)}`}>
                    {formatPct(annual.xirr_pct)}
                    {!annual.reliable && "*"}
                  </p>
                </div>
              )}
            </div>
            <dl className="grid grid-cols-3 gap-x-3 gap-y-1">
              {[
                [t("portfolio.quantity"), parseFloat(position.quantity).toFixed(4)],
                [t("portfolio.avgCost"), formatMoney(position.avg_cost, position.currency)],
                [t("portfolio.weight"), `${parseFloat(position.weight).toFixed(1)}%`],
                [t("portfolio.cost"), formatMoney(position.cost_basis, position.currency)],
                [t("portfolio.value"), formatMoney(position.market_value, position.currency)],
                ["P&L", formatMoney(position.unrealized_pnl, position.currency), moneyColor(position.unrealized_pnl)],
              ].map(([label, value, color]) => (
                <div key={label} className="min-w-0">
                  <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
                  <dd className={`truncate text-[13px] font-medium tabular-nums ${color ?? ""}`}>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {annual?.first_date && (
                <span>
                  {t("portfolio.heldSince")}{" "}
                  {formatDate(annual.first_date)}
                  {" ·"}
                </span>
              )}
              <Link
                href={`/assets/${position.asset_id}`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {t("portfolio.openAsset")}
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </p>
          </div>
        )}
      </DialogHeader>
      {position && (
        <PriceChart assetId={position.asset_id} ticker={position.asset_ticker ?? null} />
      )}
    </DialogContent>
  </Dialog>
  );
}
