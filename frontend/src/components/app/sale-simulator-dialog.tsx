"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useTranslations } from "@/i18n/use-translations";
import { cn, formatDate, formatMoney, formatQty, moneyColor } from "@/lib/utils";
import type { SaleSimulation } from "@/types";

/** Waits until the user stops typing before asking the backend again. */
function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export interface SaleSimulatorAsset {
  id: string;
  name: string;
  currency: string;
  /** Shares held now */
  held: number;
  currentPrice: string | null;
}

/**
 * What-if sale of a position (records nothing): which lots go out with the fiscal cost method, the gain to declare
 * and, for Spain, the extra income tax it adds to the year and the two-month rule on losses.
 * Mount it with a key per asset so each opens with fresh inputs.
 */
export function SaleSimulatorDialog({
  asset,
  open,
  onOpenChange,
}: {
  asset: SaleSimulatorAsset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const [quantity, setQuantity] = useState(String(asset.held));
  const [price, setPrice] = useState(asset.currentPrice ? String(parseFloat(asset.currentPrice)) : "");
  const [commission, setCommission] = useState("0");
  const params = useDebounced({ quantity, price, commission });

  const qty = parseFloat(params.quantity);
  const valid = qty > 0 && qty <= asset.held && params.price !== "" && parseFloat(params.price) >= 0;
  const { data, isFetching, error } = useQuery({
    queryKey: ["sale-simulation", asset.id, params],
    queryFn: () =>
      api.get<SaleSimulation>(
        `/portfolio/simulate-sale/?${new URLSearchParams({
          asset_id: asset.id,
          quantity: params.quantity,
          price: params.price,
          commission: params.commission || "0",
        })}`,
      ),
    enabled: open && valid,
    staleTime: 60 * 1000,
  });

  const money = (v: string) => formatMoney(v, asset.currency);
  const gain = data ? parseFloat(data.gain) : 0;
  const tax = data?.tax;
  // What a loss saves this year (tax_sale is negative then)
  const saving = tax ? -parseFloat(tax.tax_sale) : 0;
  const wash = tax?.wash_sale;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("saleSim.title", { name: asset.name })}</DialogTitle>
          <DialogDescription>{t("saleSim.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="sale-qty">{t("saleSim.quantity")}</Label>
              <span className="text-xs text-muted-foreground">
                {t("saleSim.held", { qty: formatQty(asset.held) })}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Slider
                aria-label={t("saleSim.quantity")}
                min={0}
                max={asset.held}
                step={asset.held / 100}
                value={[Math.min(parseFloat(quantity) || 0, asset.held)]}
                onValueChange={(v) => setQuantity(String(+(Array.isArray(v) ? v[0] : v).toFixed(6)))}
              />
              <Input
                id="sale-qty"
                inputMode="decimal"
                className="w-28 text-right tabular-nums"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(",", "."))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sale-price">{t("saleSim.price")}</Label>
              <Input
                id="sale-price"
                inputMode="decimal"
                className="tabular-nums"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(",", "."))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-commission">{t("saleSim.commission")}</Label>
              <Input
                id="sale-commission"
                inputMode="decimal"
                className="tabular-nums"
                value={commission}
                onChange={(e) => setCommission(e.target.value.replace(",", "."))}
              />
            </div>
          </div>
        </div>

        {!valid ? (
          <p className="text-sm text-muted-foreground">{t("saleSim.invalid", { qty: formatQty(asset.held) })}</p>
        ) : error ? (
          <p className="text-sm text-destructive">{t("saleSim.error")}</p>
        ) : data ? (
          <div className={cn("space-y-4", isFetching && "opacity-60")}>
            <dl className="space-y-1 rounded-md border p-3 text-sm">
              {[
                [t("saleSim.proceeds"), money(data.proceeds)],
                [t("saleSim.costBasis"), money(data.cost_basis)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-mono tabular-nums">{value}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t pt-1 font-semibold">
                <dt>{gain >= 0 ? t("saleSim.gain") : t("saleSim.loss")}</dt>
                <dd className={cn("font-mono tabular-nums", moneyColor(gain))}>{money(data.gain)}</dd>
              </div>
              {tax && gain >= 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t("saleSim.taxSale")}</dt>
                  <dd className="font-mono tabular-nums">{formatMoney(tax.tax_sale)}</dd>
                </div>
              )}
              {tax && gain < 0 && saving > 0 && (
                <div className="flex justify-between gap-3 text-green-600 dark:text-green-400">
                  <dt>{t("saleSim.taxSaving", { year: tax.year })}</dt>
                  <dd className="font-mono tabular-nums">{formatMoney(saving)}</dd>
                </div>
              )}
            </dl>

            {tax && gain < 0 && tax.loss_offset && (
              <div className="space-y-1 text-xs text-muted-foreground">
                {saving > 0 ? (
                  <p>
                    {[
                      parseFloat(tax.loss_offset.gains) > 0 &&
                        t("saleSim.offsetsGains", { amount: formatMoney(tax.loss_offset.gains), year: tax.year }),
                      parseFloat(tax.loss_offset.income) > 0 &&
                        t("saleSim.offsetsIncome", { amount: formatMoney(tax.loss_offset.income) }),
                      parseFloat(tax.loss_offset.carried_forward) > 0 &&
                        t("saleSim.carriedForward", { amount: formatMoney(tax.loss_offset.carried_forward) }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : (
                  <p>{t("saleSim.noSaving", { year: tax.year })}</p>
                )}
                <p>{t("saleSim.notSalary")}</p>
              </div>
            )}

            {tax && gain >= 0 && (
              <p className="text-xs text-muted-foreground">
                {t("saleSim.taxContext", {
                  year: tax.year,
                  gains: formatMoney(tax.gains_ytd),
                  income: formatMoney(tax.income_ytd),
                })}
              </p>
            )}

            {wash && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                {wash.recent_buys.length > 0
                  ? t("saleSim.washRecent", { dates: wash.recent_buys.map((b) => formatDate(b.date)).join(", ") })
                  : t("saleSim.washRebuy", { date: formatDate(wash.rebuy_until) })}
              </div>
            )}

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {t("saleSim.lotsTitle", { method: data.method })}
              </p>
              <ul className="divide-y text-sm">
                {data.lots
                  .filter((l) => parseFloat(l.quantity_sold) > 0)
                  .map((l, i) => (
                    <li key={`${l.date}-${i}`} className="flex items-center justify-between gap-3 py-1.5">
                      <div className="min-w-0">
                        <p className="font-medium">{l.date ? formatDate(l.date) : t("saleSim.averageCost")}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {t("saleSim.lotDetail", {
                            sold: formatQty(l.quantity_sold),
                            held: formatQty(l.quantity_held),
                            cost: money(l.unit_cost),
                          })}
                        </p>
                      </div>
                      <p className={cn("shrink-0 font-mono tabular-nums", moneyColor(l.gain))}>{money(l.gain)}</p>
                    </li>
                  ))}
              </ul>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {tax ? t("saleSim.disclaimerTax") : t("saleSim.disclaimer")}
            </p>
          </div>
        ) : (
          <div className="h-32 animate-pulse rounded-md bg-muted/40" />
        )}
      </DialogContent>
    </Dialog>
  );
}
