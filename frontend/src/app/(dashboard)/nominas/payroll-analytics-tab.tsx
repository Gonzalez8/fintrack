"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";

import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { useChartTheme } from "@/lib/chart-theme";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { PaginatedResponse, Payroll, PayrollType } from "@/types";

// Same palette as the badges in the list view and the composition strip in
// the financial-analysis tab — keeps the type taxonomy visually consistent
// across the app.
const TYPE_COLOURS: Record<PayrollType, string> = {
  MONTHLY: "#06b6d4", // cyan-500
  BONUS: "#8b5cf6", // violet-500
  ATRASOS: "#f59e0b", // amber-500
  OTHER: "#94a3b8", // slate-400
};

interface YearRow {
  year: number;
  monthly: number;
  bonus: number;
  atrasos: number;
  other: number;
  grossTotal: number;
  net: number;
  irpfWithholding: number;
  grossSubject: number;
  /** Effective IRPF rate (irpf / gross_subject × 100). Null when no
   *  subject base. */
  irpfPct: number | null;
  /** Take-home (net / gross_total × 100). */
  takeHomePct: number | null;
  /** Bonus as a percentage of monthly base. Null when no monthly base or
   *  no bonus this year. */
  bonusOfMonthlyPct: number | null;
}

function aggregateByYear(payrolls: Payroll[]): YearRow[] {
  const byYear = new Map<number, YearRow>();
  for (const p of payrolls) {
    // period_end drives the fiscal year — same convention as the Spanish
    // adapter and the list filter, so the totals here match the Renta
    // and the year filter on the list view.
    const year = parseInt(p.period_end.slice(0, 4), 10);
    if (!Number.isFinite(year)) continue;

    let row = byYear.get(year);
    if (!row) {
      row = {
        year,
        monthly: 0,
        bonus: 0,
        atrasos: 0,
        other: 0,
        grossTotal: 0,
        net: 0,
        irpfWithholding: 0,
        grossSubject: 0,
        irpfPct: null,
        takeHomePct: null,
        bonusOfMonthlyPct: null,
      };
      byYear.set(year, row);
    }

    const gross = parseFloat(p.gross);
    const subject = p.base_irpf ? parseFloat(p.base_irpf) : gross;
    row.grossTotal += gross;
    row.grossSubject += subject;
    row.net += parseFloat(p.net);
    row.irpfWithholding += parseFloat(p.irpf_withholding);

    switch (p.payroll_type) {
      case "MONTHLY":
        row.monthly += gross;
        break;
      case "BONUS":
        row.bonus += gross;
        break;
      case "ATRASOS":
        row.atrasos += gross;
        break;
      case "OTHER":
        row.other += gross;
        break;
    }
  }

  // Compute ratios once all sums are in. Single pass — fast.
  const rows = [...byYear.values()];
  for (const row of rows) {
    if (row.grossSubject > 0) {
      row.irpfPct = (row.irpfWithholding / row.grossSubject) * 100;
    }
    if (row.grossTotal > 0) {
      row.takeHomePct = (row.net / row.grossTotal) * 100;
    }
    if (row.monthly > 0 && row.bonus > 0) {
      row.bonusOfMonthlyPct = (row.bonus / row.monthly) * 100;
    }
  }

  // Ascending year order — natural for evolution charts (left = older).
  return rows.sort((a, b) => a.year - b.year);
}

export function PayrollAnalyticsTab() {
  const t = useTranslations();
  const theme = useChartTheme();

  const { data, isLoading } = useQuery({
    queryKey: ["payrolls-analytics"],
    // 1000 = ~80 years × 12 payslips. Realistically anyone using Fintrack
    // has < 200 records; fetching them all in one request keeps the
    // analytics view trivially client-side.
    queryFn: () =>
      api.get<PaginatedResponse<Payroll>>("/payrolls/?page_size=1000"),
  });

  const rows = useMemo(
    () => aggregateByYear(data?.results ?? []),
    [data?.results],
  );

  if (isLoading) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        {t("common.loading")}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t("payroll.analyticsEmpty")}
        </CardContent>
      </Card>
    );
  }

  // Data for the stacked bar chart — Recharts groups by row.
  const stackedData = rows.map((r) => ({
    year: String(r.year),
    MONTHLY: r.monthly,
    BONUS: r.bonus,
    ATRASOS: r.atrasos,
    OTHER: r.other,
  }));

  // Data for the bonus % of monthly line chart. Hide null points so the
  // line doesn't drop to 0 in years without bonus.
  const bonusLineData = rows.map((r) => ({
    year: String(r.year),
    pct: r.bonusOfMonthlyPct,
  }));
  const hasBonusData = bonusLineData.some((d) => d.pct !== null);

  const fmtK = (v: number) =>
    Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0);
  const typeLabel = (type: PayrollType) =>
    t(`payroll.type.${type}` as const);

  return (
    <div className="space-y-6">
      {/* 1. Stacked bar chart — bruto anual by payroll_type */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
            {t("payroll.analyticsAnnualGross")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-2 px-2 sm:px-4">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={stackedData}
              margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis
                dataKey="year"
                tick={theme.axisTick}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={theme.axisTick}
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtK}
                width={48}
              />
              <Tooltip
                contentStyle={theme.tooltipStyle}
                labelStyle={theme.tooltipLabelStyle}
                itemStyle={theme.tooltipItemStyle}
                cursor={theme.barCursor}
                formatter={(value, name) => [
                  formatMoney(Number(value).toFixed(2)),
                  typeLabel(name as PayrollType),
                ]}
              />
              <Legend
                wrapperStyle={theme.legendStyle}
                formatter={(value: string) => typeLabel(value as PayrollType)}
              />
              <Bar
                dataKey="MONTHLY"
                stackId="a"
                fill={TYPE_COLOURS.MONTHLY}
              />
              <Bar dataKey="BONUS" stackId="a" fill={TYPE_COLOURS.BONUS} />
              <Bar
                dataKey="ATRASOS"
                stackId="a"
                fill={TYPE_COLOURS.ATRASOS}
              />
              <Bar
                dataKey="OTHER"
                stackId="a"
                fill={TYPE_COLOURS.OTHER}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 2. Bonus % of monthly — line chart. Only when there's data, so
              users without bonus history don't see an empty plot. */}
      {hasBonusData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
              {t("payroll.analyticsBonusRatio")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-2 px-2 sm:px-4">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={bonusLineData}
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis
                  dataKey="year"
                  tick={theme.axisTick}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={theme.axisTick}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v} %`}
                  width={48}
                />
                <Tooltip
                  contentStyle={theme.tooltipStyle}
                  labelStyle={theme.tooltipLabelStyle}
                  itemStyle={theme.tooltipItemStyle}
                  formatter={(value) => [
                    value == null ? "—" : `${Number(value).toFixed(1)} %`,
                    t("payroll.analyticsBonusRatioShort"),
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="pct"
                  stroke={TYPE_COLOURS.BONUS}
                  strokeWidth={2}
                  dot={{ r: 3, fill: TYPE_COLOURS.BONUS }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 3. Multi-year evolution table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
            {t("payroll.analyticsTable")}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-4 pb-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("payroll.year")}</TableHead>
                  <TableHead className="text-right">
                    {typeLabel("MONTHLY")}
                  </TableHead>
                  <TableHead className="text-right">
                    {typeLabel("BONUS")}
                  </TableHead>
                  <TableHead className="text-right">
                    {typeLabel("ATRASOS")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("payroll.analyticsColGross")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("payroll.analyticsColNet")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("payroll.analyticsColIrpfPct")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("payroll.analyticsColTakeHome")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("payroll.analyticsColBonusOfMonthly")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.year}>
                    <TableCell className="font-medium">{r.year}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(r.monthly.toFixed(2))}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {r.bonus > 0
                        ? formatMoney(r.bonus.toFixed(2))
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {r.atrasos > 0
                        ? formatMoney(r.atrasos.toFixed(2))
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums font-semibold">
                      {formatMoney(r.grossTotal.toFixed(2))}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(r.net.toFixed(2))}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {r.irpfPct !== null
                        ? `${r.irpfPct.toFixed(2)} %`
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {r.takeHomePct !== null
                        ? `${r.takeHomePct.toFixed(2)} %`
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {r.bonusOfMonthlyPct !== null
                        ? `${r.bonusOfMonthlyPct.toFixed(1)} %`
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
