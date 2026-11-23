"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useChartTheme } from "@/lib/chart-theme";
import { usePrivacy } from "@/lib/privacy";
import { useTranslations } from "@/i18n/use-translations";
import { cn, formatDate, formatMoney, moneyColor, uiLocale } from "@/lib/utils";
import type { BenchmarkPoint } from "@/types";

const MINE = "#3b82f6";
const INDEX = "#f59e0b";

interface ChartPoint {
  date: string;
  contributed: number;
  portfolio: number | null;
  benchmark: number;
}

/** Round axis ticks from 0: steps of 1, 2, 2.5 or 5 × a power of ten, about four of them. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

function formatAxisDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(uiLocale(), { month: "short", year: "2-digit" });
}

/**
 * Your portfolio and the same money in the index over time, with the net money put in as a dashed line.
 * The header follows the hovered point, like the other charts; at rest it shows today.
 */
export function BenchmarkChart({ series, name }: { series: BenchmarkPoint[]; name: string }) {
  const t = useTranslations();
  const ct = useChartTheme();
  const { privacyMode } = usePrivacy();
  const [hover, setHover] = useState<ChartPoint | null>(null);
  const hoverRef = useRef<string | null>(null);

  const data = useMemo<ChartPoint[]>(
    () =>
      series.map((p) => ({
        date: p.date,
        contributed: parseFloat(p.contributed),
        portfolio: p.portfolio == null ? null : parseFloat(p.portfolio),
        benchmark: parseFloat(p.benchmark),
      })),
    [series],
  );

  const tooltipContent = useCallback(
    (props: { active?: boolean; payload?: ReadonlyArray<{ payload?: ChartPoint }> }) => {
      const p = props.active ? props.payload?.[0]?.payload : undefined;
      if (p && hoverRef.current !== p.date) {
        hoverRef.current = p.date;
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

  const ticks = useMemo(
    () => niceTicks(Math.max(0, ...data.flatMap((p) => [p.contributed, p.benchmark, p.portfolio ?? 0]))),
    [data],
  );

  const shown = hover ?? data[data.length - 1];
  if (!shown) return null;
  const diff = shown.portfolio == null ? null : shown.portfolio - shown.benchmark;

  const legend: [string, string, string, number | null][] = [
    [t("returns.chartMine"), MINE, "", shown.portfolio],
    [name, INDEX, "", shown.benchmark],
    [t("returns.chartContributed"), "currentColor", "border-dashed", shown.contributed],
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xs text-muted-foreground">
          {hover ? formatDate(hover.date) : t("returns.chartToday")}
        </p>
        {diff != null && (
          <p className={cn("text-sm font-semibold tabular-nums", moneyColor(diff))}>
            {diff > 0 ? "+" : ""}
            {formatMoney(diff)}{" "}
            <span className="text-xs font-normal text-muted-foreground">{t("returns.chartVsIndex", { name })}</span>
          </p>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        {legend.map(([label, color, dash, value]) => (
          <div key={label} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <span
                aria-hidden
                className={cn("inline-block w-3 shrink-0 border-t-2 text-muted-foreground", dash)}
                style={color === "currentColor" ? undefined : { borderColor: color }}
              />
              <span className="truncate">{label}</span>
            </dt>
            <dd className="font-mono text-sm tabular-nums">{value == null ? "—" : formatMoney(value)}</dd>
          </div>
        ))}
      </dl>

      <div onMouseLeave={handleMouseLeave} onTouchEnd={handleMouseLeave}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={ct.axisTick}
              tickFormatter={formatAxisDate}
              minTickGap={40}
            />
            <YAxis
              tick={ct.axisTick}
              tickLine={false}
              axisLine={false}
              width={44}
              ticks={ticks}
              domain={[0, ticks[ticks.length - 1]]}
              tickFormatter={(v: number) =>
                privacyMode ? "•••" : v >= 1000 ? `${(v / 1000).toLocaleString(uiLocale())}k` : `${v}`
              }
            />
            <Tooltip cursor={{ stroke: ct.textMuted, strokeWidth: 1, strokeDasharray: "3 3" }} content={tooltipContent} />
            <Line
              type="stepAfter"
              dataKey="contributed"
              stroke={ct.textMuted}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="benchmark"
              stroke={INDEX}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="portfolio"
              stroke={MINE}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">{t("returns.chartNote")}</p>
    </div>
  );
}
