"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ShowAllButton, useCollapsedList } from "@/components/app/collapsed-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyCell } from "@/components/app/money-cell";
import { useTranslations } from "@/i18n/use-translations";
import { TRANSACTION_TYPE_KEYS, TX_TYPE_BADGE_COLORS } from "@/lib/constants";
import { formatSplitDate, formatSplitRatio } from "@/lib/splits";
import { cn, formatQty } from "@/lib/utils";
import type { PositionHistory, PositionHistoryEvent } from "@/types";

export const POSITION_HISTORY_ANCHOR = "position-history";

/**
 * Timeline of an asset's operations and splits with the shares held after
 * each step, so the current quantity can be reconciled with the broker.
 */
export function PositionHistoryCard({ assetId }: { assetId: string }) {
  const t = useTranslations();
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["position-history", assetId],
    queryFn: () => api.get<PositionHistory>(`/assets/${assetId}/position-history/`),
  });

  // Links like /assets/{id}#position-history land here once the data is in
  useEffect(() => {
    if (!data || window.location.hash !== `#${POSITION_HISTORY_ANCHOR}`) return;
    const scroll = () => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    scroll();
    // The price chart above loads lazily and pushes this card down; re-align once it has rendered
    const timer = setTimeout(scroll, 800);
    return () => clearTimeout(timer);
  }, [data]);

  // Newest first, like the operations list
  const allEvents = data?.events ? [...data.events].reverse() : [];
  const shown = useCollapsedList(allEvents);
  if (!data || !allEvents.length) return null;

  const hasSplits = allEvents.some((e) => e.kind === "SPLIT");
  const events = shown.items;

  const label = (e: PositionHistoryEvent) => (
    <Badge variant="secondary" className={TX_TYPE_BADGE_COLORS[e.kind] ?? ""}>
      {e.kind === "SPLIT" ? t("splits.badge") : t(TRANSACTION_TYPE_KEYS[e.kind]) || e.kind}
    </Badge>
  );

  const change = (e: PositionHistoryEvent) => {
    if (e.kind === "SPLIT") {
      return (
        <span className="font-mono">
          {formatSplitRatio(e)}
          {e.status === "PENDING" && (
            <span className="ml-1 font-sans text-xs text-muted-foreground">({t("splits.notApplied")})</span>
          )}
        </span>
      );
    }
    const sign = e.kind === "SELL" ? "−" : "+";
    return <span className="font-mono">{`${sign}${formatQty(e.quantity)}`}</span>;
  };

  return (
    <div ref={ref} id={POSITION_HISTORY_ANCHOR} className="scroll-mt-20">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
            {t("positionHistory.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <p className="text-xs text-muted-foreground">
              {hasSplits ? t("positionHistory.helpWithSplits") : t("positionHistory.help")}
            </p>
            <p className="shrink-0 text-sm">
              <span className="text-muted-foreground">{t("positionHistory.currentShares")}: </span>
              <span className="font-mono font-semibold tabular-nums">{formatQty(data.quantity)}</span>
            </p>
          </div>

          {/* Mobile: stacked rows */}
          <ul className="divide-y divide-border rounded-md border border-border sm:hidden">
            {events.map((e) => (
              <li
                key={`${e.kind}-${e.id}`}
                className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2",
                  e.kind === "SPLIT" && "bg-amber-500/5",
                )}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    {label(e)}
                    <span className="text-sm">{change(e)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatSplitDate(e.date)}
                    {e.kind !== "SPLIT" && ` · ${e.account_name}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[9px] uppercase tracking-[1.5px] text-muted-foreground">
                    {t("positionHistory.sharesAfter")}
                  </p>
                  <p className="font-mono text-sm font-semibold tabular-nums">{formatQty(e.quantity_after)}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-md border border-border sm:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("common.date")}</th>
                  <th className="px-3 py-2 font-medium">{t("positionHistory.event")}</th>
                  <th className="px-3 py-2 font-medium">{t("common.account")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("positionHistory.change")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("transactions.price")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("positionHistory.sharesAfter")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((e) => (
                  <tr key={`${e.kind}-${e.id}`} className={cn(e.kind === "SPLIT" && "bg-amber-500/5")}>
                    <td className="px-3 py-2 tabular-nums">{formatSplitDate(e.date)}</td>
                    <td className="px-3 py-2">{label(e)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e.kind === "SPLIT" ? "—" : e.account_name}</td>
                    <td className="px-3 py-2 text-right">{change(e)}</td>
                    <td className="px-3 py-2 text-right">
                      {e.kind === "SPLIT" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <MoneyCell value={e.price} />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                      {formatQty(e.quantity_after)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ShowAllButton list={shown} className="mt-2 h-8 px-2" />
        </CardContent>
      </Card>
    </div>
  );
}
