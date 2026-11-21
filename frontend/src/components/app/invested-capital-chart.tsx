"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Area,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api-client";
import { formatMoney, formatMonthYear, uiLocale } from "@/lib/utils";
import { useChartTheme } from "@/lib/chart-theme";
import { usePrivacy } from "@/lib/privacy";
import { useTranslations } from "@/i18n/use-translations";
import type { InvestmentCostPoint } from "@/types";

type Range = "1Y" | "3Y" | "MAX";

const RANGES: { key: Range; label: string; months: number | null }[] = [
  { key: "1Y", label: "1A", months: 12 },
  { key: "3Y", label: "3A", months: 36 },
  { key: "MAX", label: "MAX", months: null },
];

interface ChartPoint {
  month: string;
  cost: number;
  delta: number;
}

const COST_COLOR = "#3b82f6";

function formatAxisMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(uiLocale(), { month: "short", year: "2-digit" });
}

// Money invested over time (cost of open positions at each month end) with the monthly change as bars.
// The header follows the hovered month, like the equity evolution chart; at rest it shows the visible range.
export function InvestedCapitalChart() {
  const ct = useChartTheme();
  const t = useTranslations();
  const [range, setRange] = useState<Range>("MAX");
  const { privacyMode } = usePrivacy();
  const [hover, setHover] = useState<ChartPoint | null>(null);
  const hoverRef = useRef<ChartPoint | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["investment-cost-evolution"],
    queryFn: () => api.get<InvestmentCostPoint[]>("/reports/investment-cost-evolution/"),
    staleTime: 5 * 60 * 1000,
  });

  const chartData = useMemo<ChartPoint[]>(() => {
    const points = data.map((p) => ({
      month: p.month,
      cost: parseFloat(p.cost),
      delta: parseFloat(p.delta),
    }));
    const months = RANGES.find((r) => r.key === range)?.months;
    return months ? points.slice(-months) : points;
  }, [data, range]);

  const last = chartData[chartData.length - 1];
  const shown = hover ?? last;
  // Without hover the header sums the visible range: what was invested (net) in the last 12 months, 3 years…
  const rangeDelta = useMemo(() => chartData.reduce((sum, p) => sum + p.delta, 0), [chartData]);

  const tooltipContent = useCallback(
    (props: { active?: boolean; payload?: ReadonlyArray<{ payload?: ChartPoint }> }) => {
      const p = props.active ? props.payload?.[0]?.payload : undefined;
      if (p && hoverRef.current?.month !== p.month) {
        hoverRef.current = p;
        queueMicrotask(() => setHover(p));
      }
      return null; // the header shows the values
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    hoverRef.current = null;
    setHover(null);
  }, []);

  if (isLoading) return <div className="h-[300px] animate-pulse rounded-lg bg-muted" />;
  if (!shown) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t("common.noData")}</p>;
  }

  const delta = hover ? hover.delta : rangeDelta;
  const deltaClass = delta > 0 ? "text-green-500" : delta < 0 ? "text-red-500" : "text-muted-foreground";
  const period = hover
    ? formatMonthYear(hover.month)
    : range === "1Y"
      ? t("portfolio.investedLast12Months")
      : range === "3Y"
        ? t("portfolio.investedLast3Years")
        : t("portfolio.investedSince", { month: formatMonthYear(chartData[0].month) });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-y-3 pb-3">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("portfolio.investedCapital")}
          </p>
          <p className="text-2xl font-bold leading-none tabular-nums sm:text-3xl">
            {formatMoney(shown.cost)}
          </p>
          <p className="mt-1.5 text-sm tabular-nums">
            <span className={`font-semibold ${deltaClass}`}>
              {delta > 0 ? "+" : ""}
              {formatMoney(delta)}
            </span>{" "}
            <span className="text-xs text-muted-foreground">· {period}</span>
          </p>
        </div>

        <div className="flex shrink-0 gap-0.5 rounded-lg border border-border bg-secondary/50 p-1">
          {RANGES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setRange(key);
                handleMouseLeave();
              }}
              className={`rounded-md px-2 py-1 font-mono text-[10px] tracking-wide transition-all duration-150 sm:px-3 sm:py-1.5 ${
                range === key
                  ? "border border-primary/20 bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div onMouseLeave={handleMouseLeave}>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart key={range} data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="invested-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COST_COLOR} stopOpacity={0.25} />
                <stop offset="100%" stopColor={COST_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={ct.axisTick}
              tickFormatter={formatAxisMonth}
              minTickGap={40}
            />
            <YAxis
              yAxisId="cost"
              tick={ct.axisTick}
              tickLine={false}
              axisLine={false}
              width={60}
              tickFormatter={(v: number) =>
                privacyMode ? "•••" : v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`
              }
            />
            <YAxis yAxisId="delta" hide domain={["dataMin", (max: number) => max * 4]} />
            <Tooltip
              cursor={{ stroke: COST_COLOR, strokeWidth: 1, strokeDasharray: "3 3", opacity: 0.6 }}
              content={tooltipContent}
            />
            <Bar yAxisId="delta" dataKey="delta" radius={[2, 2, 0, 0]} maxBarSize={14}>
              {chartData.map((p) => (
                <Cell key={p.month} fill={p.delta >= 0 ? "#22c55e" : "#ef4444"} fillOpacity={0.55} />
              ))}
            </Bar>
            <Area
              yAxisId="cost"
              type="stepAfter"
              dataKey="cost"
              stroke={COST_COLOR}
              strokeWidth={2}
              fill="url(#invested-grad)"
              dot={false}
              activeDot={{ r: 4, fill: COST_COLOR, stroke: "white", strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
