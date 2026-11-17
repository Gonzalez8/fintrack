"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { useTranslations } from "@/i18n/use-translations";
import type { RentalInputs, RentalOverviewProperty, RentalResult } from "@/types";

type Row = { key: string; label: string; value: (r: RentalResult) => string | null; strong?: boolean; sign?: -1 };

function useResultRows(): Row[] {
  const t = useTranslations();
  return [
    { key: "income", label: t("rental.result.income"), value: (r) => r.income },
    { key: "capped", label: t("rental.result.capped"), value: (r) => r.capped_applied, sign: -1 },
    { key: "other", label: t("rental.result.otherExpenses"), value: (r) => r.other_expenses, sign: -1 },
    { key: "dep", label: t("rental.result.depreciation"), value: (r) => r.depreciation, sign: -1 },
    { key: "furn", label: t("rental.result.furniture"), value: (r) => r.furniture_depreciation, sign: -1 },
    { key: "net", label: t("rental.result.net"), value: (r) => r.net, strong: true },
    {
      key: "red",
      label: t("rental.result.reduction"),
      value: (r) => r.reduction,
      sign: -1,
    },
    { key: "netr", label: t("rental.result.netReduced"), value: (r) => r.net_reduced, strong: true },
    { key: "imp", label: t("rental.result.imputation"), value: (r) => r.imputation },
    { key: "tax", label: t("rental.result.tax"), value: (r) => r.estimated_tax, sign: -1 },
    { key: "cash", label: t("rental.result.cash"), value: (r) => r.cash_result, strong: true },
  ];
}

function Amount({ value, sign }: { value: string | null; sign?: -1 }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const n = parseFloat(value);
  const shown = sign === -1 && n !== 0 ? `−${formatMoney(Math.abs(n).toFixed(2))}` : formatMoney(value);
  return <span className="font-mono tabular-nums">{shown}</span>;
}

function ResultFootnotes({ r }: { r: RentalResult }) {
  const t = useTranslations();
  return (
    <div className="space-y-1 text-[11px] text-muted-foreground leading-tight">
      <p>
        {t("rental.result.days", { rented: r.days_rented, vacant: r.days_vacant })} ·{" "}
        {t("rental.result.reductionPct", { pct: parseFloat(r.reduction_pct).toFixed(0) })} ·{" "}
        {t("rental.result.marginal", { rate: r.marginal_rate })}
      </p>
      {parseFloat(r.excess_carry_forward) > 0 && (
        <p>{t("rental.result.excess", { amount: formatMoney(r.excess_carry_forward) })}</p>
      )}
    </div>
  );
}

function Warnings({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 space-y-1">
      {items.map((w) => (
        <p key={w} className="flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />{w}</p>
      ))}
    </div>
  );
}

/** Up to today vs projected to year end, from the user's records */
export function RentalResultCard({ entry, year }: { entry: RentalOverviewProperty; year: number }) {
  const t = useTranslations();
  const rows = useResultRows();
  const { to_date: toDate, projected } = entry;
  const isCurrentYear = year === new Date().getFullYear();
  const columns = isCurrentYear
    ? [{ title: t("rental.toDate"), r: toDate.result }, { title: t("rental.projected"), r: projected.result }]
    : [{ title: String(year), r: toDate.result }];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t("rental.taxResult", { year })}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("rental.taxResultHelp")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border overflow-hidden">
          <div className={`grid ${columns.length === 2 ? "grid-cols-[1fr_auto_auto]" : "grid-cols-[1fr_auto]"} text-sm`}>
            <div className="px-3 py-2 bg-muted/40" />
            {columns.map((c) => (
              <div key={c.title} className="px-3 py-2 bg-muted/40 text-right text-xs font-medium">{c.title}</div>
            ))}
            {rows.map((row) => (
              <div key={row.key} className="contents">
                <div className={`px-3 py-1.5 border-t ${row.strong ? "font-medium" : "text-muted-foreground"}`}>{row.label}</div>
                {columns.map((c) => (
                  <div key={c.title} className={`px-3 py-1.5 border-t text-right ${row.strong ? "font-medium" : ""}`}>
                    <Amount value={row.value(c.r)} sign={row.sign} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <ResultFootnotes r={columns[columns.length - 1].r} />
        {isCurrentYear && projected.estimated?.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {t("rental.estimatedFields", {
              fields: projected.estimated.map((f) => t(`rental.field.${f}`)).join(", "),
            })}
          </p>
        )}
        <Warnings items={columns[columns.length - 1].r.warnings} />
      </CardContent>
    </Card>
  );
}

const SECTIONS: { title: string; fields: (keyof RentalInputs)[] }[] = [
  { title: "rental.sim.income", fields: ["income", "days_rented", "days_vacant"] },
  {
    title: "rental.sim.expenses",
    fields: ["financing", "repairs", "taxes", "community", "insurance", "utilities", "services", "other", "pending_excess"],
  },
  {
    title: "rental.sim.property",
    fields: [
      "acquisition_price", "acquisition_costs", "cadastral_value", "cadastral_construction_value",
      "improvements", "furniture_value", "rented_share_pct", "ownership_pct",
    ],
  },
  { title: "rental.sim.tax", fields: ["reduction_pct", "other_general_base"] },
];

/** Every figure editable; the server recomputes (nothing is saved) */
export function RentalSimulator({ base }: { base: RentalInputs }) {
  const t = useTranslations();
  const rows = useResultRows();
  // Remounted (key) when the base figures change, so the state starts from them
  const [inputs, setInputs] = useState<RentalInputs>(base);
  const debounced = useDebounce(inputs, 400);

  const { data: base_result } = useQuery({
    queryKey: ["rental-simulate", base],
    queryFn: () => api.post<RentalResult>("/rental/simulate/", base),
  });
  const { data: result, isError } = useQuery({
    queryKey: ["rental-simulate", debounced],
    queryFn: () => api.post<RentalResult>("/rental/simulate/", debounced),
    placeholderData: (prev) => prev,
  });

  const changed = useMemo(() => JSON.stringify(inputs) !== JSON.stringify(base), [inputs, base]);
  const set = (key: keyof RentalInputs, value: string) =>
    setInputs((f) => ({ ...f, [key]: ["days_rented", "days_vacant"].includes(key) ? Number(value || 0) : value }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{t("rental.simulator")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("rental.simulatorHelp")}</p>
          </div>
          {changed && (
            <Button size="sm" variant="ghost" onClick={() => setInputs(base)}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> {t("rental.reset")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[1fr_minmax(260px,340px)]">
        <div className="space-y-4">
          {SECTIONS.map((section) => (
            <div key={section.title} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(section.title)}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {section.fields.map((key) => (
                  <label key={key} className="space-y-1">
                    <span className="block text-[11px] text-muted-foreground leading-tight">{t(`rental.field.${key}`)}</span>
                    <Input
                      type="number"
                      step={key.startsWith("days") ? "1" : "0.01"}
                      inputMode="decimal"
                      className="h-8"
                      value={(inputs[key] as string | number | null) ?? ""}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={inputs.cadastral_revised}
              onChange={(e) => setInputs((f) => ({ ...f, cadastral_revised: e.target.checked }))}
              className="h-4 w-4 cursor-pointer accent-cyan-500"
            />
            {t("rental.cadastralRevised")}
          </label>
        </div>

        <div className="space-y-3 lg:sticky lg:top-4 self-start">
          <div className="rounded-md border text-sm">
            <div className="grid grid-cols-[1fr_auto_auto] px-3 py-2 bg-muted/40 text-xs font-medium gap-3">
              <span />
              <span className="text-right">{t("rental.simulated")}</span>
              <span className="text-right">Δ</span>
            </div>
            {rows.map((row) => {
              const v = result ? row.value(result) : null;
              const b = base_result ? row.value(base_result) : null;
              const delta = v !== null && b !== null ? parseFloat(v) - parseFloat(b) : 0;
              return (
                <div key={row.key} className={`grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-1.5 border-t ${row.strong ? "font-medium" : ""}`}>
                  <span className={row.strong ? "" : "text-muted-foreground"}>{row.label}</span>
                  <span className="text-right"><Amount value={v} sign={row.sign} /></span>
                  <span className={`text-right font-mono tabular-nums text-xs ${Math.abs(delta) < 0.005 || !row.strong ? "text-muted-foreground" : delta > 0 ? "text-green-500" : "text-red-500"}`}>
                    {Math.abs(delta) < 0.005 ? "·" : `${delta > 0 ? "+" : "−"}${formatMoney(Math.abs(delta).toFixed(2))}`}
                  </span>
                </div>
              );
            })}
          </div>
          {result && <ResultFootnotes r={result} />}
          {result && <Warnings items={result.warnings} />}
          {isError && <p className="text-xs text-destructive">{t("rental.simulateError")}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
