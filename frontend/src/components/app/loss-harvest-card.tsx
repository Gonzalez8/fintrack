"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SaleSimulatorDialog, type SaleSimulatorAsset } from "@/components/app/sale-simulator-dialog";
import { useTranslations } from "@/i18n/use-translations";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import type { LossHarvest } from "@/types";

/**
 * Tax-loss harvesting for the current year (Fiscal page): positions that would be sold at a loss today and what
 * selling them would save, alone and ticked together (the backend applies the offset limit). Collapsed by default;
 * hidden when the fiscal country has no estimate or there is nothing to save this year. Records nothing.
 */
export function LossHarvestCard() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [simulating, setSimulating] = useState<SaleSimulatorAsset | null>(null);

  const { data } = useQuery({
    queryKey: ["portfolio", "loss-harvesting", [...selected].sort()],
    queryFn: () => api.get<LossHarvest>(`/portfolio/loss-harvesting/?selected=${selected.join(",")}`),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  const tax = data?.tax;
  if (!tax || !data.positions.length || parseFloat(tax.max_saving) <= 0) return null;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const sel = tax.selection;
  const offset = sel.loss_offset;

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-sm font-semibold">{t("lossHarvest.title", { year: tax.year })}</h2>
            <p className="max-w-prose text-xs text-muted-foreground">
              {t("lossHarvest.summary", { gains: formatMoney(tax.gains_ytd), max: formatMoney(tax.max_saving) })}
            </p>
          </div>
          <Button variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? t("lossHarvest.hide") : t("lossHarvest.show", { count: data.positions.length })}
          </Button>
        </div>

        {open && (
          <>
            <ul className="divide-y rounded-md border text-sm">
              {data.positions.map((p) => {
                const info = tax.per_asset[p.asset_id];
                const recent = info?.wash_sale.recent_buys ?? [];
                return (
                  <li key={p.asset_id} className="flex items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-primary"
                      checked={selected.includes(p.asset_id)}
                      onChange={() => toggle(p.asset_id)}
                      aria-label={p.asset_name}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-medium">
                        {p.asset_name}
                        {recent.length > 0 && (
                          <TriangleAlert
                            className="h-3.5 w-3.5 shrink-0 text-amber-500"
                            aria-label={t("lossHarvest.recentBuy")}
                          >
                            <title>{t("lossHarvest.recentBuyHint", { dates: recent.map((b) => formatDate(b.date)).join(", ") })}</title>
                          </TriangleAlert>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {t("lossHarvest.row", {
                          loss: formatMoney(p.loss, p.currency),
                          saving: formatMoney(info?.tax_saving ?? "0"),
                        })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-xs"
                      onClick={() =>
                        setSimulating({
                          id: p.asset_id,
                          name: p.asset_name,
                          currency: p.currency,
                          held: parseFloat(p.quantity),
                          currentPrice: p.price,
                        })
                      }
                    >
                      {t("lossHarvest.simulate")}
                    </Button>
                  </li>
                );
              })}
            </ul>

            {selected.length > 0 ? (
              <div className={cn("space-y-1 rounded-md border p-3 text-sm")}>
                <p className="flex justify-between gap-3">
                  <span>{t("lossHarvest.selectedLoss", { count: selected.length })}</span>
                  <span className="font-mono tabular-nums text-red-500">{formatMoney(sel.loss)}</span>
                </p>
                <p className="flex justify-between gap-3 font-semibold text-green-600 dark:text-green-400">
                  <span>{t("saleSim.taxSaving", { year: tax.year })}</span>
                  <span className="font-mono tabular-nums">{formatMoney(sel.tax_saving)}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {[
                    parseFloat(offset.gains) > 0 &&
                      t("saleSim.offsetsGains", { amount: formatMoney(offset.gains), year: tax.year }),
                    parseFloat(offset.income) > 0 && t("saleSim.offsetsIncome", { amount: formatMoney(offset.income) }),
                    parseFloat(offset.carried_forward) > 0 &&
                      t("saleSim.carriedForward", { amount: formatMoney(offset.carried_forward) }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("lossHarvest.pick")}</p>
            )}

            <p className="text-[11px] text-muted-foreground">
              {t("lossHarvest.caution", { date: formatDate(Object.values(tax.per_asset)[0]?.wash_sale.rebuy_until) })}{" "}
              {t("saleSim.notSalary")}
            </p>
          </>
        )}
      </CardContent>

      {simulating && (
        <SaleSimulatorDialog
          key={simulating.id}
          asset={simulating}
          open
          onOpenChange={(o) => !o && setSimulating(null)}
        />
      )}
    </Card>
  );
}
