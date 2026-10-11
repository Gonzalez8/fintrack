"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { api } from "@/lib/api-client";
import { formatMoney, formatMonthYear } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { useChartTheme, SERIES } from "@/lib/chart-theme";
import { useTranslations } from "@/i18n/use-translations";
import type { PatrimonioPoint } from "@/types";

type Range = "3M" | "6M" | "1A" | "2A" | "MAX";

const RANGES: { key: Range; label: string }[] = [
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "1A", label: "1A" },
  { key: "2A", label: "2A" },
  { key: "MAX", label: "MAX" },
];

function filterByRange(data: PatrimonioPoint[], range: Range): PatrimonioPoint[] {
  if (range === "MAX" || !data.length) return data;
  const now = new Date();
  const cutoff = new Date(now);
  if (range === "3M") cutoff.setMonth(now.getMonth() - 3);
  else if (range === "6M") cutoff.setMonth(now.getMonth() - 6);
  else if (range === "1A") cutoff.setFullYear(now.getFullYear() - 1);
  else if (range === "2A") cutoff.setFullYear(now.getFullYear() - 2);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
  return data.filter((p) => p.month >= cutoffKey);
}

interface ChartPoint {
  month: string;
  Efectivo: number;
  Inversiones: number;
  Total: number;
}

function periodChange(first: number, last: number) {
  const abs = last - first;
  const pct = first > 0 ? (abs / first) * 100 : 0;
  return { abs, pct, positive: abs >= 0 };
}

export function PatrimonioEvolutionChart() {
  const ct = useChartTheme();
  const t = useTranslations();
  const [range, setRange] = useState<Range>("MAX");
  const [hover, setHover] = useState<ChartPoint | null>(null);
  const hoverRef = useRef<ChartPoint | null>(null);

  const { data: allData = [], isLoading } = useQuery({
    queryKey: ["patrimonio-evolution"],
    queryFn: () => api.get<PatrimonioPoint[]>("/reports/patrimonio-evolution/"),
    staleTime: 5 * 60 * 1000,
  });

  const chartData = useMemo<ChartPoint[]>(() => {
    return filterByRange(allData, range).map((p) => ({
      month: p.month,
      Efectivo: parseFloat(p.cash),
      Inversiones: parseFloat(p.investments),
      Total: parseFloat(p.cash) + parseFloat(p.investments),
    }));
  }, [allData, range]);

  // Recharts v3: use Tooltip content prop to capture the hovered point
  const tooltipContent = useCallback(
    (props: { active?: boolean; payload?: ReadonlyArray<{ payload?: ChartPoint }> }) => {
      if (props.active && props.payload?.[0]?.payload) {
        const p = props.payload[0].payload;
        // Only update state if the hovered point changed (avoid re-render loop)
        if (hoverRef.current?.month !== p.month) {
          hoverRef.current = p;
          // Schedule state update outside render
          queueMicrotask(() => setHover(p));
        }
      }
      return null; // no visible tooltip, the header shows the values
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    hoverRef.current = null;
    setHover(null);
  }, []);

  if (isLoading || allData.length === 0) return null;

  // Display values: hovered point overrides the latest point
  const firstPoint = chartData[0];
  const displayPoint = hover ?? chartData[chartData.length - 1];
  const evoCash = displayPoint?.Efectivo ?? 0;
  const evoInvestments = displayPoint?.Inversiones ?? 0;
  const evoTotal = displayPoint?.Total ?? 0;

  const totalChg = periodChange(firstPoint?.Total ?? 0, evoTotal);
  const cashChg = periodChange(firstPoint?.Efectivo ?? 0, evoCash);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-y-3 px-4 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {t("dashboard.patrimonioEvolution")}
            </p>
            <p className="text-xl sm:text-3xl font-bold tabular-nums leading-none">{formatMoney(evoTotal)}</p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">
              {t("dashboard.investments")}: {formatMoney(evoInvestments)} · {t("dashboard.cash")}:{" "}
              {formatMoney(evoCash)}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
              <span className="text-muted-foreground">
                Total&nbsp;
                <span className={totalChg.positive ? "text-green-500" : "text-red-500"}>
                  {totalChg.positive ? "+" : ""}
                  {formatMoney(totalChg.abs)}&nbsp; ({totalChg.positive ? "+" : ""}
                  {totalChg.pct.toFixed(2)}%)
                </span>
              </span>
              <span className="text-muted-foreground">
                {t("dashboard.cash")}&nbsp;
                <span className={cashChg.positive ? "text-green-500" : "text-red-500"}>
                  {cashChg.positive ? "+" : ""}
                  {formatMoney(cashChg.abs)}&nbsp; ({cashChg.positive ? "+" : ""}
                  {cashChg.pct.toFixed(2)}%)
                </span>
              </span>
            </div>
            <div className="mt-1 h-4">
              {hover && <p className="text-xs text-muted-foreground">{formatMonthYear(hover.month)}</p>}
            </div>
          </div>

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
            <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="month"
                tick={ct.axisTick}
                tickLine={false}
                axisLine={false}
                padding={{ left: 16, right: 16 }}
              />
              <YAxis hide />
              <Tooltip cursor={ct.tooltipCursor} content={tooltipContent} />
              <Legend
                wrapperStyle={{
                  ...ct.legendStyle,
                  paddingLeft: "24px",
                  paddingBottom: "8px",
                }}
              />
              <Area
                type="monotone"
                dataKey="Efectivo"
                stackId="1"
                fill={SERIES.cash}
                stroke={SERIES.cash}
                fillOpacity={0.5}
              />
              <Area
                type="monotone"
                dataKey="Inversiones"
                stackId="1"
                fill={SERIES.investments}
                stroke={SERIES.investments}
                fillOpacity={0.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
