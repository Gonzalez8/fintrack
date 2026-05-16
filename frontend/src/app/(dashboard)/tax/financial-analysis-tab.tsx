"use client";

import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { DataTable, type Column } from "@/components/app/data-table";
import { MoneyCell } from "@/components/app/money-cell";
import { formatMoney, formatPct } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type {
  YearSummary,
  PortfolioData,
  Dividend,
  Interest,
  PaginatedResponse,
  Payroll,
  PayrollType,
} from "@/types";

interface Props {
  year: string;
}

interface PayrollAggregates {
  /** Number of payslips in the year. */
  count: number;
  /** Sum of `gross_subject` (= base_irpf when present, else gross). This
   *  is what AEAT considers "Retribuciones dinerarias sujetas" for the
   *  Renta. We use the same convention the Modo Renta tab uses. */
  grossSubject: number;
  /** Sum of `gross` — informational, includes the exempt slice. */
  grossDevengado: number;
  /** Sum of `ss_employee` and `irpf_withholding`. */
  ssEmployee: number;
  irpfWithholding: number;
  /** Sum of `net` (líquido a percibir, lo que de verdad llega). */
  net: number;
  /** Effective IRPF rate = irpf / gross_subject × 100. NaN when no
   *  payslips this year (avoids divide-by-zero). */
  irpfEffectivePct: number;
  /** Take-home = net / gross_devengado × 100. */
  takeHomePct: number;
  /** Distribution of gross_devengado by payroll_type. Used for the
   *  composition bar. */
  byType: Record<PayrollType, number>;
}

function aggregatePayrolls(payrolls: Payroll[]): PayrollAggregates {
  const byType: Record<PayrollType, number> = {
    MONTHLY: 0,
    BONUS: 0,
    ATRASOS: 0,
    OTHER: 0,
  };
  let grossSubject = 0;
  let grossDevengado = 0;
  let ssEmployee = 0;
  let irpfWithholding = 0;
  let net = 0;
  for (const p of payrolls) {
    // Mirror the Spanish adapter: prefer base_irpf when present.
    const subject = p.base_irpf ? parseFloat(p.base_irpf) : parseFloat(p.gross);
    grossSubject += subject;
    grossDevengado += parseFloat(p.gross);
    ssEmployee += parseFloat(p.ss_employee);
    irpfWithholding += parseFloat(p.irpf_withholding);
    net += parseFloat(p.net);
    byType[p.payroll_type] += parseFloat(p.gross);
  }
  return {
    count: payrolls.length,
    grossSubject,
    grossDevengado,
    ssEmployee,
    irpfWithholding,
    net,
    irpfEffectivePct: grossSubject > 0 ? (irpfWithholding / grossSubject) * 100 : NaN,
    takeHomePct: grossDevengado > 0 ? (net / grossDevengado) * 100 : NaN,
    byType,
  };
}

export function FinancialAnalysisTab({ year }: Props) {
  const t = useTranslations();

  const { data: years } = useQuery({
    queryKey: ["year-summary"],
    queryFn: () => api.get<YearSummary[]>("/reports/year-summary/"),
  });

  const { data: portfolio } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.get<PortfolioData>("/portfolio/"),
  });

  const { data: dividendsData } = useQuery({
    queryKey: ["dividends-fiscal", year],
    queryFn: () =>
      api.get<PaginatedResponse<Dividend>>(
        `/dividends/?year=${year}&page_size=500`,
      ),
  });

  const { data: interestsData } = useQuery({
    queryKey: ["interests-fiscal", year],
    queryFn: () =>
      api.get<PaginatedResponse<Interest>>(
        `/interests/?year=${year}&page_size=500`,
      ),
  });

  // Payrolls for the current year and the previous one. Year-over-year
  // comparison is the whole point of the new KPI cards, so we fetch both
  // up front. 500 page size is enough for any realistic payslip count.
  const prevYear = String(parseInt(year) - 1);
  const { data: payrollsThisYear } = useQuery({
    queryKey: ["payrolls-fiscal", year],
    queryFn: () =>
      api.get<PaginatedResponse<Payroll>>(
        `/payrolls/?year=${year}&page_size=500`,
      ),
  });
  const { data: payrollsPrevYear } = useQuery({
    queryKey: ["payrolls-fiscal", prevYear],
    queryFn: () =>
      api.get<PaginatedResponse<Payroll>>(
        `/payrolls/?year=${prevYear}&page_size=500`,
      ),
  });

  const payrollAggregates = aggregatePayrolls(payrollsThisYear?.results ?? []);
  const payrollAggregatesPrev = aggregatePayrolls(
    payrollsPrevYear?.results ?? [],
  );

  const summary = years?.find((y) => y.year === parseInt(year));

  const salesYear =
    portfolio?.realized_sales.filter((s) => s.date.startsWith(year)) ?? [];
  const salesTotals = (() => {
    const qty = salesYear.reduce((s, r) => s + parseFloat(r.quantity), 0);
    const cost = salesYear.reduce((s, r) => s + parseFloat(r.cost_basis), 0);
    const sell = salesYear.reduce((s, r) => s + parseFloat(r.proceeds), 0);
    const pnl = salesYear.reduce((s, r) => s + parseFloat(r.realized_pnl), 0);
    const pct = cost > 0 ? (pnl / cost) * 100 : 0;
    return { qty, cost, sell, pnl, pct };
  })();

  const divByCountryAsset = new Map<
    string,
    Map<
      string,
      {
        name: string;
        ticker: string | null;
        gross: number;
        tax: number;
        net: number;
      }
    >
  >();
  for (const d of dividendsData?.results ?? []) {
    const country = d.asset_issuer_country || "__none__";
    if (!divByCountryAsset.has(country))
      divByCountryAsset.set(country, new Map());
    const assetMap = divByCountryAsset.get(country)!;
    if (!assetMap.has(d.asset))
      assetMap.set(d.asset, {
        name: d.asset_name ?? "",
        ticker: d.asset_ticker ?? null,
        gross: 0,
        tax: 0,
        net: 0,
      });
    const entry = assetMap.get(d.asset)!;
    entry.gross += parseFloat(d.gross);
    entry.tax += parseFloat(d.tax);
    entry.net += parseFloat(d.net);
  }
  const sortedCountries = [...divByCountryAsset.keys()].sort((a, b) => {
    if (a === "__none__") return 1;
    if (b === "__none__") return -1;
    return a.localeCompare(b);
  });
  const divTotals = { gross: 0, tax: 0, net: 0 };
  for (const assetMap of divByCountryAsset.values()) {
    for (const r of assetMap.values()) {
      divTotals.gross += r.gross;
      divTotals.tax += r.tax;
      divTotals.net += r.net;
    }
  }

  const intByAccount = new Map<
    string,
    { name: string; gross: number; net: number }
  >();
  for (const i of interestsData?.results ?? []) {
    const key = i.account;
    if (!intByAccount.has(key))
      intByAccount.set(key, { name: i.account_name ?? "", gross: 0, net: 0 });
    const entry = intByAccount.get(key)!;
    entry.gross += parseFloat(i.gross);
    entry.net += parseFloat(i.net);
  }
  const intRows = [...intByAccount.values()].sort((a, b) => b.net - a.net);
  const intTotals = intRows.reduce(
    (acc, r) => ({ gross: acc.gross + r.gross, net: acc.net + r.net }),
    { gross: 0, net: 0 },
  );

  const yearColumns: Column<YearSummary>[] = [
    {
      key: "year",
      header: "Año",
      render: (y) => <span className="font-medium">{y.year}</span>,
    },
    {
      key: "div_gross",
      header: "Div. Bruto",
      className: "text-right",
      render: (y) => <MoneyCell value={y.dividends_gross} />,
    },
    {
      key: "div_tax",
      header: "Div. Ret.",
      className: "text-right",
      render: (y) => <MoneyCell value={y.dividends_tax} />,
    },
    {
      key: "div_net",
      header: "Div. Neto",
      className: "text-right",
      render: (y) => <MoneyCell value={y.dividends_net} colored />,
    },
    {
      key: "int_gross",
      header: "Int. Bruto",
      className: "text-right",
      render: (y) => <MoneyCell value={y.interests_gross} />,
    },
    {
      key: "int_net",
      header: "Int. Neto",
      className: "text-right",
      render: (y) => <MoneyCell value={y.interests_net} colored />,
    },
    {
      key: "pnl",
      header: "Ganancias",
      className: "text-right",
      render: (y) => <MoneyCell value={y.realized_pnl} colored />,
    },
    {
      key: "total",
      header: "Total",
      className: "text-right",
      render: (y) => <MoneyCell value={y.total_income} colored />,
    },
  ];

  const fmtMoney = (n: number) => formatMoney(n.toFixed(2));
  const fmtPctNum = (n: number) => formatPct(n.toFixed(2));

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={`${t("fiscal.netDividends")} ${year}`}
          value={summary?.dividends_net ?? "0"}
        />
        <KpiCard
          label={`${t("fiscal.netInterests")} ${year}`}
          value={summary?.interests_net ?? "0"}
        />
        <KpiCard
          label={`${t("fiscal.capitalGains")} ${year}`}
          value={summary?.realized_pnl ?? "0"}
          colored
        />
        <KpiCard
          label={t("fiscal.totalNet", { year })}
          value={summary?.total_income ?? "0"}
          colored
          highlight
        />
      </div>

      {/* Payroll-derived metrics. Only rendered when there's at least one
          payslip in the year — keeps the tab compact for users who don't
          track payrolls. */}
      {payrollAggregates.count > 0 && (
        <PayrollSection
          t={t}
          year={year}
          prevYear={prevYear}
          current={payrollAggregates}
          previous={payrollAggregatesPrev}
        />
      )}

      <section className="space-y-3">
        <SectionHeader
          eyebrow={t("fiscal.gainsSection")}
          title={t("fiscal.salesTitle", { year })}
          total={
            salesYear.length > 0
              ? { value: salesTotals.pnl.toFixed(2), colored: true }
              : undefined
          }
        />

        {salesYear.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            {t("fiscal.noSales", { year })}
          </p>
        ) : (
          <>
            <div className="space-y-2 sm:hidden">
              {salesYear.map((s, i) => {
                const pnl = parseFloat(s.realized_pnl);
                const cost = parseFloat(s.cost_basis);
                const pct = cost > 0 ? (pnl / cost) * 100 : 0;
                const positive = pnl >= 0;
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-border p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {s.asset_name}
                        </p>
                        {s.asset_ticker && (
                          <p className="font-mono text-xs text-muted-foreground">
                            {s.asset_ticker}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`font-mono text-sm font-bold tabular-nums ${positive ? "text-green-500" : "text-red-500"}`}
                        >
                          {fmtMoney(pnl)}
                        </p>
                        <p
                          className={`font-mono text-[11px] tabular-nums ${positive ? "text-green-500" : "text-red-500"}`}
                        >
                          {fmtPctNum(pct)}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 border-t border-border/40 pt-2">
                      <div>
                        <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground">
                          {t("fiscal.acquisition")}
                        </p>
                        <p className="font-mono text-xs tabular-nums">
                          {formatMoney(s.cost_basis)}
                        </p>
                      </div>
                      <div>
                        <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground">
                          {t("fiscal.transfer")}
                        </p>
                        <p className="font-mono text-xs tabular-nums">
                          {formatMoney(s.proceeds)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <TotalRow
                label={t("fiscal.total")}
                cells={[
                  {
                    label: t("fiscal.acquisition"),
                    value: fmtMoney(salesTotals.cost),
                  },
                  {
                    label: t("fiscal.transfer"),
                    value: fmtMoney(salesTotals.sell),
                  },
                  {
                    label: t("fiscal.gain"),
                    value: fmtMoney(salesTotals.pnl),
                    colored: true,
                    positive: salesTotals.pnl >= 0,
                  },
                ]}
              />
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("fiscal.entity")}</TableHead>
                    <TableHead className="text-right">
                      {t("fiscal.quantity")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("fiscal.acquisitionValue")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("fiscal.transferValue")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("fiscal.gain")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("fiscal.relativeGain")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesYear.map((s, i) => {
                    const cost = parseFloat(s.cost_basis);
                    const pnl = parseFloat(s.realized_pnl);
                    const pct = cost > 0 ? (pnl / cost) * 100 : 0;
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          <span className="font-medium">{s.asset_name}</span>
                          {s.asset_ticker && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {s.asset_ticker}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {parseFloat(s.quantity).toFixed(4)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(s.cost_basis)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(s.proceeds)}
                        </TableCell>
                        <TableCell className="text-right">
                          <MoneyCell value={s.realized_pnl} colored />
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {fmtPctNum(pct)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-semibold">
                    <TableCell>{t("fiscal.total")}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {salesTotals.qty.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtMoney(salesTotals.cost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtMoney(salesTotals.sell)}
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell
                        value={salesTotals.pnl.toFixed(2)}
                        colored
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {fmtPctNum(salesTotals.pct)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          eyebrow={t("fiscal.incomeSection")}
          title={t("fiscal.dividendsTitle", { year })}
          total={
            divTotals.net > 0
              ? { value: divTotals.net.toFixed(2) }
              : undefined
          }
        />

        {sortedCountries.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            {t("fiscal.noDividends", { year })}
          </p>
        ) : (
          <>
            <div className="space-y-4 sm:hidden">
              {sortedCountries.map((country) => {
                const assetMap = divByCountryAsset.get(country)!;
                const assets = [...assetMap.values()].sort(
                  (a, b) => b.net - a.net,
                );
                const cTotals = assets.reduce(
                  (acc, r) => ({
                    gross: acc.gross + r.gross,
                    tax: acc.tax + r.tax,
                    net: acc.net + r.net,
                  }),
                  { gross: 0, tax: 0, net: 0 },
                );
                const countryLabel =
                  country === "__none__" ? t("fiscal.noCountry") : country;
                return (
                  <div
                    key={country}
                    className="rounded-lg border border-border overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-3 py-2 bg-secondary/40">
                      <span className="font-mono text-[10px] tracking-[2px] uppercase font-semibold">
                        {countryLabel}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {fmtMoney(cTotals.net)} {t("fiscal.net")}
                      </span>
                    </div>
                    {assets.map((d, i) => (
                      <div
                        key={i}
                        className="border-t border-border/50 px-3 py-2.5 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {d.name}
                            </p>
                            {d.ticker && (
                              <p className="font-mono text-xs text-muted-foreground">
                                {d.ticker}
                              </p>
                            )}
                          </div>
                          <p className="font-mono text-sm tabular-nums font-semibold shrink-0">
                            {fmtMoney(d.net)}
                          </p>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <div>
                            <p className="font-mono text-[9px] tracking-[1px] uppercase text-muted-foreground">
                              {t("fiscal.gross")}
                            </p>
                            <p className="font-mono text-[11px] tabular-nums">
                              {fmtMoney(d.gross)}
                            </p>
                          </div>
                          <div>
                            <p className="font-mono text-[9px] tracking-[1px] uppercase text-muted-foreground">
                              {t("fiscal.withholding")}
                            </p>
                            <p className="font-mono text-[11px] tabular-nums">
                              {fmtMoney(d.tax)}
                            </p>
                          </div>
                          <div>
                            <p className="font-mono text-[9px] tracking-[1px] uppercase text-muted-foreground">
                              {t("fiscal.withholdingPct")}
                            </p>
                            <p className="font-mono text-[11px] tabular-nums">
                              {d.gross > 0
                                ? fmtPctNum((d.tax / d.gross) * 100)
                                : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              <TotalRow
                label={t("fiscal.total")}
                cells={[
                  { label: t("fiscal.gross"), value: fmtMoney(divTotals.gross) },
                  {
                    label: t("fiscal.withholding"),
                    value: fmtMoney(divTotals.tax),
                  },
                  { label: t("fiscal.net"), value: fmtMoney(divTotals.net) },
                ]}
              />
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("fiscal.country")}</TableHead>
                    <TableHead>{t("fiscal.entity")}</TableHead>
                    <TableHead className="text-right">
                      {t("fiscal.gross")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("fiscal.withholding")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("fiscal.withholdingPct")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("fiscal.net")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCountries.map((country) => {
                    const assetMap = divByCountryAsset.get(country)!;
                    const assets = [...assetMap.values()].sort(
                      (a, b) => b.net - a.net,
                    );
                    const cTotals = assets.reduce(
                      (acc, r) => ({
                        gross: acc.gross + r.gross,
                        tax: acc.tax + r.tax,
                        net: acc.net + r.net,
                      }),
                      { gross: 0, tax: 0, net: 0 },
                    );
                    const countryLabel =
                      country === "__none__"
                        ? t("fiscal.noCountry")
                        : country;
                    return (
                      <Fragment key={country}>
                        {assets.map((d, i) => (
                          <TableRow key={`${country}-${i}`}>
                            {i === 0 && (
                              <TableCell
                                rowSpan={assets.length + 1}
                                className="font-semibold align-top"
                              >
                                {countryLabel}
                              </TableCell>
                            )}
                            <TableCell>
                              <span className="font-medium">{d.name}</span>
                              {d.ticker && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {d.ticker}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {fmtMoney(d.gross)}
                            </TableCell>
                            <TableCell className="text-right">
                              {fmtMoney(d.tax)}
                            </TableCell>
                            <TableCell className="text-right">
                              {d.gross > 0
                                ? fmtPctNum((d.tax / d.gross) * 100)
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {fmtMoney(d.net)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow
                          key={`${country}-subtotal`}
                          className="bg-muted/50"
                        >
                          <TableCell className="font-medium text-sm">
                            {t("fiscal.countrySubtotal", {
                              country: countryLabel,
                            })}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {fmtMoney(cTotals.gross)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {fmtMoney(cTotals.tax)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {cTotals.gross > 0
                              ? fmtPctNum((cTotals.tax / cTotals.gross) * 100)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {fmtMoney(cTotals.net)}
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-semibold">
                    <TableCell colSpan={2}>{t("fiscal.total")}</TableCell>
                    <TableCell className="text-right">
                      {fmtMoney(divTotals.gross)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtMoney(divTotals.tax)}
                    </TableCell>
                    <TableCell className="text-right">
                      {divTotals.gross > 0
                        ? fmtPctNum((divTotals.tax / divTotals.gross) * 100)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtMoney(divTotals.net)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          eyebrow={t("fiscal.incomeSection")}
          title={t("fiscal.interestsTitle", { year })}
          total={
            intTotals.net > 0
              ? { value: intTotals.net.toFixed(2) }
              : undefined
          }
        />

        {intRows.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            {t("fiscal.noInterests", { year })}
          </p>
        ) : (
          <>
            <div className="space-y-2 sm:hidden">
              {intRows.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-3"
                >
                  <p className="text-sm font-medium truncate mr-3">{r.name}</p>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm tabular-nums font-semibold">
                      {fmtMoney(r.net)}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {t("fiscal.gross")}: {fmtMoney(r.gross)}
                    </p>
                  </div>
                </div>
              ))}
              <TotalRow
                label={t("fiscal.total")}
                cells={[
                  { label: t("fiscal.gross"), value: fmtMoney(intTotals.gross) },
                  { label: t("fiscal.net"), value: fmtMoney(intTotals.net) },
                ]}
              />
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.account")}</TableHead>
                    <TableHead className="text-right">
                      {t("fiscal.gross")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("fiscal.net")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {intRows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">
                        {fmtMoney(r.gross)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtMoney(r.net)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-semibold">
                    <TableCell>{t("fiscal.total")}</TableCell>
                    <TableCell className="text-right">
                      {fmtMoney(intTotals.gross)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtMoney(intTotals.net)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          eyebrow={t("fiscal.historySection")}
          title={t("fiscal.yearHistory")}
        />

        <div className="space-y-2 sm:hidden">
          {(years ?? []).map((y) => {
            const total = parseFloat(y.total_income);
            const positive = total >= 0;
            return (
              <div key={y.year} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-sm font-bold">{y.year}</span>
                  <span className={`font-mono text-sm font-bold tabular-nums ${positive ? "text-green-500" : "text-red-500"}`}>
                    {fmtMoney(total)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border/40 pt-2">
                  <div>
                    <p className="font-mono text-[9px] tracking-[1px] uppercase text-muted-foreground">{t("fiscal.netDividendsShort")}</p>
                    <p className="font-mono text-xs tabular-nums">{formatMoney(y.dividends_net)}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1px] uppercase text-muted-foreground">{t("fiscal.netInterestsShort")}</p>
                    <p className="font-mono text-xs tabular-nums">{formatMoney(y.interests_net)}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1px] uppercase text-muted-foreground">{t("fiscal.capitalGains")}</p>
                    <p className="font-mono text-xs tabular-nums"><MoneyCell value={y.realized_pnl} colored /></p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1px] uppercase text-muted-foreground">{t("fiscal.divWithholding")}</p>
                    <p className="font-mono text-xs tabular-nums">{formatMoney(y.dividends_tax)}</p>
                  </div>
                </div>
              </div>
            );
          })}
          {(!years || years.length === 0) && (
            <p className="py-3 text-sm text-muted-foreground">{t("common.noData")}</p>
          )}
        </div>

        <Card className="hidden sm:block">
          <CardContent className="pt-4">
            <DataTable
              columns={yearColumns}
              data={years ?? []}
              keyFn={(y) => String(y.year)}
              emptyMessage={t("common.noData")}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// Visual colour for each payroll_type slice in the composition bar.
// Matches the badge colours in /nominas so the user sees the same
// taxonomy in both places.
const TYPE_BAR_COLOURS: Record<PayrollType, string> = {
  MONTHLY: "bg-cyan-500",
  BONUS: "bg-violet-500",
  ATRASOS: "bg-amber-500",
  OTHER: "bg-muted-foreground/50",
};

function PayrollSection({
  t,
  year,
  prevYear,
  current,
  previous,
}: {
  t: ReturnType<typeof useTranslations>;
  year: string;
  prevYear: string;
  current: PayrollAggregates;
  previous: PayrollAggregates;
}) {
  // Money delta: relative change vs previous year (or NaN if no prev data).
  const grossDelta =
    previous.grossSubject > 0
      ? ((current.grossSubject - previous.grossSubject) / previous.grossSubject) * 100
      : NaN;

  // Rate deltas: absolute percentage-point change (pp).
  const irpfDelta = Number.isFinite(previous.irpfEffectivePct)
    ? current.irpfEffectivePct - previous.irpfEffectivePct
    : NaN;
  const takeHomeDelta = Number.isFinite(previous.takeHomePct)
    ? current.takeHomePct - previous.takeHomePct
    : NaN;
  const netDelta =
    previous.net > 0 ? ((current.net - previous.net) / previous.net) * 100 : NaN;

  // Composition: pct of gross_devengado per type.
  const totalForBar = current.grossDevengado || 1;
  const composition: Array<{ type: PayrollType; amount: number; pct: number }> = (
    ["MONTHLY", "BONUS", "ATRASOS", "OTHER"] as PayrollType[]
  )
    .map((type) => ({
      type,
      amount: current.byType[type],
      pct: (current.byType[type] / totalForBar) * 100,
    }))
    .filter((row) => row.amount > 0);

  // Extra label for BONUS rows: bonus as a percentage of the monthly base.
  // Many comp packages quote variable pay as "% of base salary" (e.g. "target
  // 20 % bonus on base"), so this is the figure the user actually compares
  // against. Only meaningful when both buckets have data.
  const bonusOfMonthlyPct =
    current.byType.MONTHLY > 0 && current.byType.BONUS > 0
      ? (current.byType.BONUS / current.byType.MONTHLY) * 100
      : null;

  return (
    <section className="space-y-3">
      <SectionHeader
        eyebrow={t("fiscal.payrollSection")}
        title={t("fiscal.payrollTitle", { year })}
        total={{
          value: current.grossSubject.toFixed(2),
          colored: false,
        }}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={t("fiscal.payrollGrossSubject", { year })}
          value={current.grossSubject.toFixed(2)}
          delta={
            <DeltaPill
              delta={grossDelta}
              unit="%"
              positiveIsGood
              previous={prevYear}
            />
          }
        />
        <KpiCard
          label={t("fiscal.payrollIrpfRate", { year })}
          value={`${current.irpfEffectivePct.toFixed(2)} %`}
          raw
          delta={
            <DeltaPill
              delta={irpfDelta}
              unit="pp"
              positiveIsGood={false}
              previous={prevYear}
            />
          }
        />
        <KpiCard
          label={t("fiscal.payrollTakeHome", { year })}
          value={`${current.takeHomePct.toFixed(2)} %`}
          raw
          delta={
            <DeltaPill
              delta={takeHomeDelta}
              unit="pp"
              positiveIsGood
              previous={prevYear}
            />
          }
        />
        <KpiCard
          label={t("fiscal.payrollNet", { year })}
          value={current.net.toFixed(2)}
          colored
          delta={
            <DeltaPill
              delta={netDelta}
              unit="%"
              positiveIsGood
              previous={prevYear}
            />
          }
        />
      </div>

      {/* Composition by type. Hidden when there's only one type to avoid
          a useless 100%-monthly bar. */}
      {composition.length > 1 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
              {t("fiscal.payrollComposition", { year })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-4 px-4">
            <div className="flex h-3 w-full overflow-hidden rounded-sm">
              {composition.map((row) => (
                <div
                  key={row.type}
                  className={TYPE_BAR_COLOURS[row.type]}
                  style={{ width: `${row.pct}%` }}
                  title={`${t(`payroll.type.${row.type}` as const)} · ${row.pct.toFixed(1)} %`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {composition.map((row) => (
                <div key={row.type} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={`inline-block h-2 w-2 rounded-sm ${TYPE_BAR_COLOURS[row.type]}`}
                  />
                  <span className="text-muted-foreground">
                    {t(`payroll.type.${row.type}` as const)}
                  </span>
                  <span className="font-mono tabular-nums">
                    {row.pct.toFixed(1)} % · {formatMoney(row.amount.toFixed(2))}
                  </span>
                  {row.type === "BONUS" && bonusOfMonthlyPct !== null && (
                    <span className="text-muted-foreground">
                      {t("fiscal.payrollBonusOfMonthly", {
                        pct: bonusOfMonthlyPct.toFixed(1),
                      })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function KpiCard({
  label,
  value,
  colored,
  highlight,
  raw,
  delta,
}: {
  label: string;
  value: string;
  colored?: boolean;
  highlight?: boolean;
  /** Skip ``formatMoney`` and render the value verbatim. For percentages
   *  and any other non-money KPI. */
  raw?: boolean;
  /** Optional comparative line shown below the value (e.g. "+2.1 pp vs
   *  2024"). Pre-built by the caller via :func:`DeltaPill` so colour /
   *  arrow direction is decided at the call site. */
  delta?: React.ReactNode;
}) {
  return (
    <Card
      className={
        highlight ? "border-primary/25 dark:bg-primary/[0.04]" : ""
      }
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 px-4">
        <div className="font-mono text-xl font-bold tabular-nums">
          {raw ? (
            value
          ) : colored ? (
            <MoneyCell value={value} colored />
          ) : (
            formatMoney(value)
          )}
        </div>
        {delta != null && <div className="mt-1 text-xs">{delta}</div>}
      </CardContent>
    </Card>
  );
}

/** Small badge for the year-over-year comparison line inside a KpiCard.
 *
 * - ``positiveIsGood`` flips the colour semantics so an increase shows
 *   red instead of green (used for IRPF rate: paying more tax is "bad").
 * - ``unit`` controls the suffix: "%" for relative changes on money,
 *   "pp" for absolute percentage-point changes on rates.
 * - ``previous`` is the comparison year label.
 */
function DeltaPill({
  delta,
  unit,
  positiveIsGood = true,
  previous,
}: {
  delta: number;
  unit: "%" | "pp" | "€";
  positiveIsGood?: boolean;
  previous: string;
}) {
  if (!Number.isFinite(delta)) {
    return <span className="text-muted-foreground">— vs {previous}</span>;
  }
  const sign = delta > 0 ? "+" : "";
  const isGood = positiveIsGood ? delta >= 0 : delta <= 0;
  const colour =
    Math.abs(delta) < 0.005
      ? "text-muted-foreground"
      : isGood
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400";
  return (
    <span className={colour}>
      {sign}
      {delta.toFixed(unit === "pp" ? 2 : unit === "%" ? 1 : 2)}
      {unit === "€" ? " €" : ` ${unit}`} vs {previous}
    </span>
  );
}

function SectionHeader({
  eyebrow,
  title,
  total,
}: {
  eyebrow: string;
  title: string;
  total?: { value: string; colored?: boolean };
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-end sm:justify-between border-b border-border pb-2">
      <div>
        <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
          {eyebrow}
        </p>
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      {total && (
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          Total:{" "}
          <span
            className={
              total.colored
                ? parseFloat(total.value) >= 0
                  ? "text-green-500"
                  : "text-red-500"
                : ""
            }
          >
            {formatMoney(total.value)}
          </span>
        </p>
      )}
    </div>
  );
}

function TotalRow({
  label,
  cells,
}: {
  label: string;
  cells: Array<{
    label: string;
    value: string;
    colored?: boolean;
    positive?: boolean;
  }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground mb-2">
        {label}
      </p>
      <div
        className="grid gap-x-4 gap-y-1"
        style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}
      >
        {cells.map((cell, i) => (
          <div key={i}>
            <p className="font-mono text-[9px] tracking-[1px] uppercase text-muted-foreground">
              {cell.label}
            </p>
            <p
              className={`font-mono text-sm tabular-nums font-semibold ${
                cell.colored
                  ? cell.positive
                    ? "text-green-500"
                    : "text-red-500"
                  : ""
              }`}
            >
              {cell.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
