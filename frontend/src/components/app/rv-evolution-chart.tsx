"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api-client";
import { formatMoney, formatMonthYear, uiLocale } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { useChartTheme } from "@/lib/chart-theme";
import { useTranslations } from "@/i18n/use-translations";
import type { RVEvolutionPoint, PortfolioData } from "@/types";

type Range = "1D" | "1W" | "1M" | "3M" | "1Y" | "MAX";

const RANGES: { key: Range; label: string }[] = [
  { key: "1D", label: "1D" },
  { key: "1W", label: "1S" },
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "1Y", label: "1A" },
  { key: "MAX", label: "MAX" },
];

/** Pre-parsed numeric point for Recharts */
interface ChartPoint {
  captured_at: string;
  mv: number;
  cost: number;
  pnl: number;
  pnlPct: number;
}

function toChartPoint(p: RVEvolutionPoint): ChartPoint {
  const mv = parseFloat(p.value);
  const cost = parseFloat(p.cost);
  const pnl = parseFloat(p.pnl);
  return {
    captured_at: p.captured_at,
    mv,
    cost,
    pnl,
    pnlPct: cost > 0 ? (pnl / cost) * 100 : 0,
  };
}

function filterByRange(data: ChartPoint[], range: Range): ChartPoint[] {
  if (range === "MAX" || !data.length) return data;
  const now = new Date();
  const cutoff = new Date(now);
  if (range === "1D") cutoff.setDate(now.getDate() - 1);
  else if (range === "1W") cutoff.setDate(now.getDate() - 7);
  else if (range === "1M") cutoff.setMonth(now.getMonth() - 1);
  else if (range === "3M") cutoff.setMonth(now.getMonth() - 3);
  else cutoff.setFullYear(now.getFullYear() - 1);
  return data.filter((p) => new Date(p.captured_at) >= cutoff);
}

function formatTooltipDate(dateStr: string): string {
  if (dateStr.length === 7) return formatMonthYear(dateStr);
  const d = new Date(dateStr);
  return d.toLocaleDateString(uiLocale(), {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAxisDate(dateStr: string, range: Range): string {
  if (dateStr.length === 7) return dateStr;
  const d = new Date(dateStr);
  if (range === "1D")
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (range === "1W")
    return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" });
  if (range === "1M")
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  if (range === "3M")
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
}

interface HoverState {
  mv: number;
  pnl: number;
  cost: number;
  timestamp: string;
}

export function RVEvolutionChart() {
  const ct = useChartTheme();
  const t = useTranslations();
  const [range, setRange] = useState<Range>("1Y");
  const [hover, setHover] = useState<HoverState | null>(null);
  const hoverRef = useRef<HoverState | null>(null);

  const { data: allData = [], isLoading } = useQuery({
    queryKey: ["rv-evolution"],
    queryFn: () => api.get<RVEvolutionPoint[]>("/reports/rv-evolution/"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: portfolioData } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.get<PortfolioData>("/portfolio/"),
    staleTime: 30 * 1000,
  });

  // Pre-parse all data to numeric ChartPoints
  const allNumeric = useMemo(() => allData.map(toChartPoint), [allData]);

  const snapshotData = useMemo(
    () => filterByRange(allNumeric, range),
    [allNumeric, range],
  );
  const hasEnoughData = snapshotData.length >= 2;

  const lastSnapshotMV = hasEnoughData
    ? snapshotData[snapshotData.length - 1].mv
    : 0;

  // Live values from portfolio
  const liveMV = portfolioData
    ? parseFloat(portfolioData.totals.total_market_value)
    : lastSnapshotMV;
  const livePnl = portfolioData
    ? parseFloat(portfolioData.totals.total_unrealized_pnl)
    : 0;
  const liveCost = portfolioData
    ? parseFloat(portfolioData.totals.total_cost)
    : 0;

  // Append live point to chart data
  const chartData = useMemo<ChartPoint[]>(() => {
    if (!portfolioData || snapshotData.length === 0) return snapshotData;
    return [
      ...snapshotData,
      {
        captured_at: new Date().toISOString(),
        mv: liveMV,
        cost: liveCost,
        pnl: livePnl,
        pnlPct: liveCost > 0 ? (livePnl / liveCost) * 100 : 0,
      },
    ];
  }, [snapshotData, portfolioData, liveMV, liveCost, livePnl]);

  // Display values: hover overrides live
  const displayMV = hover ? hover.mv : liveMV;
  const displayPnl = hover ? hover.pnl : livePnl;
  const displayCost = hover ? hover.cost : liveCost;
  const displayPnlPct = displayCost > 0 ? (displayPnl / displayCost) * 100 : 0;
  const displayTimestamp = hover ? hover.timestamp : null;

  const isPositive = displayPnl >= 0;
  const color = isPositive ? "#22c55e" : "#ef4444";
  const gradientId = `rv-grad-${isPositive ? "green" : "red"}`;

  const isLiveUpdated =
    !hover &&
    hasEnoughData &&
    Math.abs(liveMV - lastSnapshotMV) > 0.01;

  const xTicks = useMemo(() => {
    if (chartData.length <= 4) return chartData.map((p) => p.captured_at);
    const indices = [
      0,
      Math.floor(chartData.length / 3),
      Math.floor((2 * chartData.length) / 3),
      chartData.length - 1,
    ];
    return [...new Set(indices.map((i) => chartData[i].captured_at))];
  }, [chartData]);

  const tickFormatter = useCallback(
    (v: string) => formatAxisDate(v, range),
    [range],
  );

  // Recharts v3: use Tooltip content prop to capture active data
  const tooltipContent = useCallback(
    (props: { active?: boolean; payload?: ReadonlyArray<{ payload?: ChartPoint }> }) => {
      if (props.active && props.payload?.[0]?.payload) {
        const p = props.payload[0].payload;
        const next: HoverState = {
          mv: p.mv,
          pnl: p.pnl,
          cost: p.cost,
          timestamp: p.captured_at,
        };
        // Only update state if the hovered point changed (avoid re-render loop)
        if (
          !hoverRef.current ||
          hoverRef.current.timestamp !== next.timestamp
        ) {
          hoverRef.current = next;
          // Schedule state update outside render
          queueMicrotask(() => setHover(next));
        }
      }
      return null; // no visible tooltip
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    hoverRef.current = null;
    setHover(null);
  }, []);

  if (isLoading || allData.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-y-3 px-4 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
          <div className="min-w-0">
            {/* Label + LIVE badge */}
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("dashboard.rvEvolution")}
              </p>
              {isLiveUpdated && (
                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono tracking-[2px] text-green-500 border-green-500/30 bg-green-500/10">
                  LIVE
                </span>
              )}
            </div>

            {/* Market value — big number */}
            <p className="text-2xl sm:text-3xl font-bold tabular-nums leading-none">
              {formatMoney(displayMV)}
            </p>

            {/* P&L + percentage */}
            <div className="mt-1.5 flex items-baseline gap-1.5">
              {hasEnoughData ? (
                <>
                  <span
                    className={`text-sm font-semibold tabular-nums ${isPositive ? "text-green-500" : "text-red-500"}`}
                  >
                    {displayPnl >= 0 ? "+" : ""}
                    {formatMoney(displayPnl)}
                  </span>
                  <span
                    className={`text-xs font-medium tabular-nums ${isPositive ? "text-green-500" : "text-red-500"}`}
                  >
                    ({displayPnlPct >= 0 ? "+" : ""}
                    {displayPnlPct.toFixed(2)}%)
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {t("dashboard.insufficientData")}
                </span>
              )}
            </div>

            {/* Timestamp on hover */}
            <div className="mt-1 h-4">
              {displayTimestamp && (
                <p className="text-xs text-muted-foreground">
                  {formatTooltipDate(displayTimestamp)}
                </p>
              )}
            </div>
          </div>

          {/* Range selector */}
          <div className="flex shrink-0 gap-0.5 bg-secondary/50 border border-border rounded-lg p-1">
            {RANGES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => {
                  setRange(key);
                  setHover(null);
                  hoverRef.current = null;
                }}
                className={`px-2 py-1 sm:px-3 sm:py-1.5 font-mono text-[10px] tracking-wide rounded-md transition-all duration-150 ${
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

        <div onMouseLeave={handleMouseLeave}>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              key={range}
              data={chartData}
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>

              <XAxis
                dataKey="captured_at"
                ticks={xTicks}
                tickLine={false}
                axisLine={false}
                tick={ct.axisTick}
                tickFormatter={tickFormatter}
                padding={{ left: 16, right: 16 }}
              />
              <YAxis
                tick={ct.axisTick}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                width={60}
                domain={["auto", "auto"]}
              />

              <Tooltip
                cursor={{
                  stroke: color,
                  strokeWidth: 1,
                  strokeDasharray: "3 3",
                  opacity: 0.6,
                }}
                content={tooltipContent}
              />

              <Area
                type="monotone"
                dataKey="pnlPct"
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: color,
                  stroke: "white",
                  strokeWidth: 2,
                }}
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
