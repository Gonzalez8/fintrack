"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { useChartTheme, POSITIVE, NEGATIVE } from "@/lib/chart-theme";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { MonthlySavingsPoint } from "@/types";

export type SavingsRange = "3M" | "6M" | "1A" | "2A" | "MAX";

export const SAVINGS_RANGES: { key: SavingsRange; label: string }[] = [
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "1A", label: "1A" },
  { key: "2A", label: "2A" },
  { key: "MAX", label: "MAX" },
];

export function filterByRange(
  months: MonthlySavingsPoint[],
  range: SavingsRange,
): MonthlySavingsPoint[] {
  if (!months.length || range === "MAX") return months;
  const n = { "3M": 3, "6M": 6, "1A": 12, "2A": 24 }[range];
  return months.slice(-n);
}

const MONTH_ABBR = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function fmtAxisMonth(v: string): string {
  const [year, month] = v.split("-");
  return `${MONTH_ABBR[parseInt(month) - 1]} '${year.slice(2)}`;
}

interface Props {
  months: MonthlySavingsPoint[];
  range: SavingsRange;
  onRangeChange: (r: SavingsRange) => void;
  normalize: boolean;
  onNormalizeChange: (n: boolean) => void;
  deltaCount: number;
  selectedMonth?: string | null;
  onMonthSelect?: (month: string | null) => void;
}

export function MonthlySavingsChart({
  months,
  range,
  onRangeChange,
  normalize,
  onNormalizeChange,
  deltaCount,
  selectedMonth,
  onMonthSelect,
}: Props) {
  const ct = useChartTheme();
  const t = useTranslations();

  const chartData = useMemo(
    () =>
      months
        .filter((m) => m.real_savings !== null)
        .map((m) => ({
          month: m.month,
          real_savings: parseFloat(m.real_savings!),
          cash_delta: parseFloat(m.cash_delta ?? "0"),
          investment_cost_delta: parseFloat(m.investment_cost_delta ?? "0"),
        })),
    [months],
  );

  const canNormalize = deltaCount >= 6;
  const hasSelection =
    selectedMonth != null && chartData.some((d) => d.month === selectedMonth);

  const renderTooltip = ({ active, payload, label }: Record<string, unknown>) => {
    if (!active || !Array.isArray(payload) || !payload.length) return null;
    const d = payload[0].payload as (typeof chartData)[0];
    return (
      <div style={ct.tooltipStyle as React.CSSProperties}>
        <p style={ct.tooltipLabelStyle as React.CSSProperties}>
          {fmtAxisMonth(label as string)}
        </p>
        <p
          style={{
            ...(ct.tooltipItemStyle as React.CSSProperties),
            color: d.real_savings >= 0 ? POSITIVE : NEGATIVE,
            fontWeight: 600,
          }}
        >
          {t("savings.realSavings")}: {d.real_savings >= 0 ? "+" : ""}
          {formatMoney(d.real_savings)}
        </p>
        <p style={ct.tooltipItemStyle as React.CSSProperties}>
          Δ {t("savings.cash")}: {d.cash_delta >= 0 ? "+" : ""}
          {formatMoney(d.cash_delta)}
        </p>
        <p style={ct.tooltipItemStyle as React.CSSProperties}>
          Δ {t("savings.investmentCost")}: {d.investment_cost_delta >= 0 ? "+" : ""}
          {formatMoney(d.investment_cost_delta)}
        </p>
      </div>
    );
  };

  if (chartData.length === 0) return null;

  const minWidth = Math.max(chartData.length * 30, 260);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBarClick = (data: any) => {
    if (!onMonthSelect) return;
    const month = data?.month;
    if (!month) return;
    onMonthSelect(selectedMonth === month ? null : month);
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("savings.realSavings")}
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onNormalizeChange(!normalize)}
                title={
                  canNormalize
                    ? t("savings.trimmedMeanHint")
                    : t("savings.needMoreMonths")
                }
                className={`shrink-0 px-2.5 py-1.5 font-mono text-[10px] tracking-wide rounded-md border transition-all duration-150 ${
                  normalize && canNormalize
                    ? "bg-background shadow-sm text-primary border-primary/20"
                    : normalize && !canNormalize
                      ? "border-border text-muted-foreground/40 cursor-not-allowed"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {t("savings.noOutliers")}
              </button>

              <div className="shrink-0 h-4 w-px bg-border/60" />

              <div className="flex flex-1 sm:flex-none gap-0.5 bg-secondary/50 border border-border rounded-lg p-1">
                {SAVINGS_RANGES.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => onRangeChange(key)}
                    className={`flex-1 sm:flex-none px-0 sm:px-3 py-1.5 font-mono text-[10px] tracking-wide rounded-md transition-all duration-150 ${
                      range === key
                        ? "bg-background shadow-sm text-primary border border-primary/20"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div style={{ minWidth }}>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                style={onMonthSelect ? { cursor: "pointer" } : undefined}
              >
                <XAxis
                  dataKey="month"
                  tickFormatter={fmtAxisMonth}
                  tick={ct.axisTick}
                  tickLine={false}
                  axisLine={false}
                  interval={
                    chartData.length > 24
                      ? Math.floor(chartData.length / 12)
                      : "preserveStartEnd"
                  }
                />
                <YAxis
                  tick={ct.axisTick}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => {
                    const abs = Math.abs(v);
                    if (abs >= 1000) return `${(v / 1000).toFixed(0)}k€`;
                    return `${v.toFixed(0)}€`;
                  }}
                  width={42}
                />
                <ReferenceLine
                  y={0}
                  stroke={ct.border as string}
                  strokeWidth={1}
                />
                <Tooltip
                  content={renderTooltip}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar
                  dataKey="real_savings"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={36}
                  onClick={onMonthSelect ? handleBarClick : undefined}
                >
                  {chartData.map((entry, index) => {
                    const isSelected = entry.month === selectedMonth;
                    const opacity =
                      hasSelection && !isSelected ? 0.35 : 0.85;
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.real_savings >= 0 ? POSITIVE : NEGATIVE}
                        fillOpacity={opacity}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
