"use client";

import { useState, Fragment } from "react";
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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
} from "@/types";

export function TaxContent() {
  const t = useTranslations();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

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

  const summary = years?.find((y) => y.year === parseInt(year));

  // Realized sales for selected year
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

  // Dividends grouped by country -> asset
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

  // Interests grouped by account
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

  // Year summary table columns
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
      {/* Header with year selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("fiscal.title")}</h1>
        <Select value={year} onValueChange={(v) => v && setYear(v)}>
          <SelectTrigger className="w-24 font-mono">
            <span data-slot="select-value">{year}</span>
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={String(y)} className="font-mono">
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
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

      {/* Realized Sales Section */}
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
            {/* Mobile: cards */}
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

            {/* Desktop: table */}
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

      {/* Dividends Section */}
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
            {/* Mobile: cards grouped by country */}
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

            {/* Desktop: table */}
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

      {/* Interests Section */}
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
            {/* Mobile: cards */}
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

            {/* Desktop: table */}
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

      {/* Year Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("fiscal.yearHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={yearColumns}
            data={years ?? []}
            keyFn={(y) => String(y.year)}
            emptyMessage={t("common.noData")}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components ──

function KpiCard({
  label,
  value,
  colored,
  highlight,
}: {
  label: string;
  value: string;
  colored?: boolean;
  highlight?: boolean;
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
          {colored ? (
            <MoneyCell value={value} colored />
          ) : (
            formatMoney(value)
          )}
        </div>
      </CardContent>
    </Card>
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
