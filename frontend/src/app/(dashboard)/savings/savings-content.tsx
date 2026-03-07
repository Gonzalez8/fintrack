"use client";

import { useMemo, useState, useRef, useCallback, Fragment, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
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
import { MoneyCell } from "@/components/app/money-cell";
import {
  MonthlySavingsChart,
  type SavingsRange,
  filterByRange,
} from "@/components/app/monthly-savings-chart";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { MonthlySavingsPoint, MonthlySavingsStats } from "@/types";

interface SavingsResponse {
  months: MonthlySavingsPoint[];
  stats: MonthlySavingsStats | null;
}

// ── Client-side stats (range-aware + trimmed mean) ──────────────────────────

interface ClientStats {
  current_cash: string;
  last_month_delta: string | null;
  avg_monthly_delta: string | null;
  is_normalized: boolean;
  best_month: MonthlySavingsPoint | null;
  worst_month: MonthlySavingsPoint | null;
  delta_count: number;
}

function computeClientStats(
  months: MonthlySavingsPoint[],
  normalize: boolean,
): ClientStats | null {
  if (months.length === 0) return null;

  const deltaMonths = months.filter((m) => m.real_savings !== null);
  const indexed = deltaMonths.map((m) => ({
    m,
    delta: parseFloat(m.real_savings!),
  }));

  const best =
    indexed.length > 0
      ? indexed.reduce((a, x) => (x.delta > a.delta ? x : a))
      : null;
  const worst =
    indexed.length > 0
      ? indexed.reduce((a, x) => (x.delta < a.delta ? x : a))
      : null;

  let avgDelta: number | null = null;
  let isNormalized = false;

  if (indexed.length >= 6 && normalize) {
    const sorted = [...indexed].sort((a, b) => a.delta - b.delta);
    const trimmed = sorted.slice(1, -1);
    avgDelta = trimmed.reduce((s, x) => s + x.delta, 0) / trimmed.length;
    isNormalized = true;
  } else if (indexed.length > 0) {
    avgDelta = indexed.reduce((s, x) => s + x.delta, 0) / indexed.length;
  }

  const last = months[months.length - 1];
  return {
    current_cash: last.cash_end,
    last_month_delta: last.real_savings,
    avg_monthly_delta: avgDelta !== null ? avgDelta.toFixed(2) : null,
    is_normalized: isNormalized,
    best_month: best?.m ?? null,
    worst_month: worst?.m ?? null,
    delta_count: indexed.length,
  };
}

// ── Formatters ──────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MONTH_ABBR = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function fmtMonth(m: string): string {
  const [year, month] = m.split("-");
  return `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;
}

function fmtMonthShort(m: string): string {
  const [year, month] = m.split("-");
  return `${MONTH_ABBR[parseInt(month) - 1]} ${year}`;
}

const RANGE_LABELS: Record<SavingsRange, string> = {
  "3M": "últimos 3 meses",
  "6M": "últimos 6 meses",
  "1A": "último año",
  "2A": "últimos 2 años",
  MAX: "historial completo",
};

// ── Delta cell ──────────────────────────────────────────────────────────────

function DeltaCell({ value }: { value: string | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const num = parseFloat(value);
  const sign = num > 0 ? "+" : "";
  const cls =
    num > 0 ? "text-green-500" : num < 0 ? "text-red-500" : "text-muted-foreground";
  return (
    <span className={`font-mono tabular-nums ${cls}`}>
      {sign}
      {formatMoney(value)}
    </span>
  );
}

// ── Mobile month card ───────────────────────────────────────────────────────

function MobileMonthCard({
  m,
  indent = false,
  selected = false,
  onSelect,
}: {
  m: MonthlySavingsPoint;
  indent?: boolean;
  selected?: boolean;
  onSelect?: (month: string) => void;
}) {
  return (
    <div
      className={`py-3 ${indent ? "pl-8 pr-4" : "px-4"} transition-colors ${
        selected
          ? "bg-primary/5 border-l-2 border-primary"
          : "active:bg-secondary/40 cursor-pointer"
      }`}
      onClick={() => onSelect?.(m.month)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect?.(m.month);
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm">{fmtMonth(m.month)}</span>
        <span className="font-mono text-sm font-semibold tabular-nums shrink-0">
          <DeltaCell value={m.real_savings} />
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-x-2 text-[11px] font-mono">
        <div>
          <p className="text-muted-foreground/60 mb-0.5">Efectivo</p>
          <p className="tabular-nums text-foreground/80">{formatMoney(m.cash_end)}</p>
        </div>
        <div>
          <p className="text-muted-foreground/60 mb-0.5">Δ Efectivo</p>
          <p><DeltaCell value={m.cash_delta} /></p>
        </div>
        <div>
          <p className="text-muted-foreground/60 mb-0.5">Δ Coste inv.</p>
          <p><DeltaCell value={m.investment_cost_delta} /></p>
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export function SavingsContent() {
  const t = useTranslations();
  const [range, setRange] = useState<SavingsRange>("1A");
  const [normalize, setNormalize] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["monthly-savings"],
    queryFn: () => api.get<SavingsResponse>("/reports/monthly-savings/"),
    staleTime: 5 * 60_000,
  });

  const allMonths = data?.months ?? [];
  const filteredMonths = useMemo(
    () => filterByRange(allMonths, range),
    [allMonths, range],
  );
  const stats = useMemo(
    () => computeClientStats(filteredMonths, normalize),
    [filteredMonths, normalize],
  );

  const avgSubtitle = stats
    ? `${RANGE_LABELS[range]}${stats.is_normalized ? ` · ${t("savings.noOutliers")}` : ""}`
    : undefined;

  const handleMonthSelect = useCallback((month: string | null) => {
    setSelectedMonth(month);
    if (month && tableRef.current) {
      requestAnimationFrame(() => {
        tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  // ── Table data (descending) ──
  const tableData = useMemo(() => [...filteredMonths].reverse(), [filteredMonths]);

  // ── Year grouping for MAX range ──
  const currentYear = String(new Date().getFullYear());
  const groupByYear = range === "MAX";

  const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!groupByYear) return;
    const toCollapse = new Set<string>();
    for (const m of filteredMonths) {
      const y = m.month.slice(0, 4);
      if (y !== currentYear) toCollapse.add(y);
    }
    setCollapsedYears(toCollapse);
  }, [filteredMonths, groupByYear, currentYear]);

  useEffect(() => {
    if (!groupByYear || !selectedMonth) return;
    const year = selectedMonth.slice(0, 4);
    setCollapsedYears((prev) => {
      if (!prev.has(year)) return prev;
      const next = new Set(prev);
      next.delete(year);
      return next;
    });
  }, [selectedMonth, groupByYear]);

  const toggleYear = (year: string) => {
    setCollapsedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const yearGroups = useMemo(() => {
    if (!groupByYear) return null;
    const map = new Map<string, MonthlySavingsPoint[]>();
    for (const m of tableData) {
      const year = m.month.slice(0, 4);
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(m);
    }
    return Array.from(map.entries());
  }, [tableData, groupByYear]);

  const highlightStyle = {
    boxShadow: "inset 2px 0 0 hsl(var(--primary))",
    background: "hsl(var(--primary) / 0.05)",
  };

  const indicator = useMemo(() => {
    if (filteredMonths.length === 0) return null;
    return {
      count: filteredMonths.length,
      from: fmtMonthShort(filteredMonths[0].month),
      to: fmtMonthShort(filteredMonths[filteredMonths.length - 1].month),
    };
  }, [filteredMonths]);

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground text-sm">
        {t("common.loading")}
      </div>
    );
  }

  if (allMonths.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          {t("common.noData")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">{t("savings.title")}</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
              {t("savings.currentCash")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="font-mono text-xl font-bold tabular-nums">
              {formatMoney(stats?.current_cash)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
              {t("savings.lastMonth")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <MoneyCell value={stats?.last_month_delta} colored className="text-xl font-bold" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
              {t("savings.monthlyAvg")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <MoneyCell value={stats?.avg_monthly_delta} colored className="text-xl font-bold" />
            {avgSubtitle && (
              <p className="font-mono text-[9px] text-muted-foreground mt-1 tracking-wide leading-tight">
                {avgSubtitle}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pb-4 pt-4 px-4 space-y-3">
            <div>
              <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground mb-1">
                {t("savings.bestMonth")}
              </p>
              <p className="font-mono text-lg font-bold tabular-nums text-green-500 leading-none">
                {stats?.best_month?.real_savings != null
                  ? `+${formatMoney(stats.best_month.real_savings)}`
                  : "—"}
              </p>
              {stats?.best_month && (
                <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                  {fmtMonthShort(stats.best_month.month)}
                </p>
              )}
            </div>
            <div className="h-px bg-border/60" />
            <div>
              <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground mb-1">
                {t("savings.worstMonth")}
              </p>
              <p
                className={`font-mono text-lg font-bold tabular-nums leading-none ${
                  stats?.worst_month?.real_savings != null &&
                  parseFloat(stats.worst_month.real_savings) < 0
                    ? "text-red-500"
                    : "text-green-500"
                }`}
              >
                {stats?.worst_month?.real_savings != null
                  ? formatMoney(stats.worst_month.real_savings)
                  : "—"}
              </p>
              {stats?.worst_month && (
                <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                  {fmtMonthShort(stats.worst_month.month)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bar Chart */}
      <MonthlySavingsChart
        months={filteredMonths}
        range={range}
        onRangeChange={setRange}
        normalize={normalize}
        onNormalizeChange={setNormalize}
        deltaCount={stats?.delta_count ?? 0}
        selectedMonth={selectedMonth}
        onMonthSelect={handleMonthSelect}
      />

      {/* Table */}
      <div ref={tableRef}>
        {tableData.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
                  {groupByYear ? t("savings.fullHistory") : RANGE_LABELS[range]}
                </CardTitle>
                {indicator && (
                  <p className="font-mono text-[9px] text-muted-foreground">
                    {indicator.count} {indicator.count === 1 ? "mes" : "meses"} · {indicator.from} – {indicator.to}
                  </p>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {/* Mobile card list */}
              <div className="sm:hidden divide-y divide-border/40">
                {groupByYear && yearGroups
                  ? yearGroups.map(([year, yearMonths]) => {
                      const isCollapsed = collapsedYears.has(year);
                      const yearDelta = yearMonths
                        .filter((m) => m.real_savings !== null)
                        .reduce((sum, m) => sum + parseFloat(m.real_savings!), 0);
                      return (
                        <Fragment key={year}>
                          <div
                            className="cursor-pointer bg-secondary/30 active:bg-secondary/60 transition-colors select-none px-4 py-2.5 flex items-center justify-between"
                            onClick={() => toggleYear(year)}
                          >
                            <div className="flex items-center gap-2">
                              <ChevronRight
                                className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-150 ${
                                  isCollapsed ? "" : "rotate-90"
                                }`}
                              />
                              <span className="font-mono text-[10px] tracking-[3px] uppercase font-semibold">
                                {year}
                              </span>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                · {yearMonths.length} {yearMonths.length === 1 ? "mes" : "meses"}
                              </span>
                            </div>
                            <DeltaCell value={yearDelta.toFixed(2)} />
                          </div>
                          {!isCollapsed &&
                            yearMonths.map((m) => (
                              <MobileMonthCard
                                key={m.month}
                                m={m}
                                indent
                                selected={selectedMonth === m.month}
                                onSelect={setSelectedMonth}
                              />
                            ))}
                        </Fragment>
                      );
                    })
                  : tableData.map((m) => (
                      <MobileMonthCard
                        key={m.month}
                        m={m}
                        selected={selectedMonth === m.month}
                        onSelect={setSelectedMonth}
                      />
                    ))}
                {stats?.avg_monthly_delta != null && (
                  <div className="px-4 py-3 flex items-center justify-between bg-muted/20">
                    <span className="text-sm font-semibold">{t("savings.monthlyAvg")}</span>
                    <DeltaCell value={stats.avg_monthly_delta} />
                  </div>
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      <TableHead className="text-right">Efectivo fin</TableHead>
                      <TableHead className="text-right">Δ Efectivo</TableHead>
                      <TableHead className="text-right">Δ Coste inv.</TableHead>
                      <TableHead className="text-right">Ahorro real</TableHead>
                    </TableRow>
                  </TableHeader>

                  {groupByYear && yearGroups ? (
                    <TableBody>
                      {yearGroups.map(([year, yearMonths]) => {
                        const isCollapsed = collapsedYears.has(year);
                        const yearDelta = yearMonths
                          .filter((m) => m.real_savings !== null)
                          .reduce((sum, m) => sum + parseFloat(m.real_savings!), 0);
                        return (
                          <Fragment key={year}>
                            <TableRow
                              className="cursor-pointer bg-secondary/30 hover:bg-secondary/50 transition-colors select-none"
                              onClick={() => toggleYear(year)}
                            >
                              <TableCell colSpan={5} className="py-2 px-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <ChevronRight
                                      className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-150 ${
                                        isCollapsed ? "" : "rotate-90"
                                      }`}
                                    />
                                    <span className="font-mono text-[10px] tracking-[3px] uppercase font-semibold">
                                      {year}
                                    </span>
                                    <span className="font-mono text-[10px] text-muted-foreground">
                                      · {yearMonths.length} {yearMonths.length === 1 ? "mes" : "meses"}
                                    </span>
                                  </div>
                                  <DeltaCell value={yearDelta.toFixed(2)} />
                                </div>
                              </TableCell>
                            </TableRow>
                            {!isCollapsed &&
                              yearMonths.map((m) => (
                                <TableRow
                                  key={m.month}
                                  style={selectedMonth === m.month ? highlightStyle : undefined}
                                  className="transition-colors cursor-pointer hover:bg-secondary/30"
                                  onClick={() => setSelectedMonth(m.month)}
                                >
                                  <TableCell className="font-mono text-sm pl-9">
                                    {fmtMonth(m.month)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono tabular-nums text-sm">
                                    {formatMoney(m.cash_end)}
                                  </TableCell>
                                  <TableCell className="text-right text-sm">
                                    <DeltaCell value={m.cash_delta} />
                                  </TableCell>
                                  <TableCell className="text-right text-sm">
                                    <DeltaCell value={m.investment_cost_delta} />
                                  </TableCell>
                                  <TableCell className="text-right text-sm">
                                    <DeltaCell value={m.real_savings} />
                                  </TableCell>
                                </TableRow>
                              ))}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  ) : (
                    <TableBody>
                      {tableData.map((m) => (
                        <TableRow
                          key={m.month}
                          style={selectedMonth === m.month ? highlightStyle : undefined}
                          className="transition-colors cursor-pointer hover:bg-secondary/30"
                          onClick={() => setSelectedMonth(m.month)}
                        >
                          <TableCell className="font-mono text-sm">
                            {fmtMonth(m.month)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-sm">
                            {formatMoney(m.cash_end)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            <DeltaCell value={m.cash_delta} />
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            <DeltaCell value={m.investment_cost_delta} />
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            <DeltaCell value={m.real_savings} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  )}

                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold">{t("savings.monthlyAvg")}</TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right">
                        <DeltaCell value={stats?.avg_monthly_delta ?? null} />
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
