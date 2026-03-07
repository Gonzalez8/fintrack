"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createChart,
  AreaSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import { api } from "@/lib/api-client";
import { useTranslations } from "@/i18n/use-translations";
import type { OHLCBar } from "@/types";

const PERIODS = [
  { key: "1mo", label: "1M" },
  { key: "3mo", label: "3M" },
  { key: "6mo", label: "6M" },
  { key: "1y", label: "1A" },
  { key: "2y", label: "2A" },
  { key: "5y", label: "5A" },
  { key: "max", label: "MAX" },
];

function isMobile() {
  return typeof window !== "undefined" && window.innerWidth < 640;
}

function buildChartOptions(isDark: boolean) {
  const bg = isDark ? "#111827" : "#ffffff";
  const text = isDark ? "#94a3b8" : "#6b7280";
  const grid = isDark ? "rgba(30,45,69,0.35)" : "rgba(229,231,235,0.5)";
  const border = isDark ? "#1e2d45" : "#e5e7eb";
  const mobile = isMobile();

  return {
    layout: {
      background: { type: ColorType.Solid, color: bg },
      textColor: text,
      fontFamily:
        "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
      fontSize: mobile ? 10 : 11,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: grid },
      horzLines: { color: grid },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: {
      borderColor: border,
      minimumWidth: mobile ? 52 : 64,
    },
    timeScale: {
      borderColor: border,
      timeVisible: false,
      secondsVisible: false,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: true,
  };
}

function getAreaColors(isPositive: boolean) {
  return isPositive
    ? {
        lineColor: "#22c55e",
        topColor: "rgba(34,197,94,0.35)",
        bottomColor: "rgba(34,197,94,0.02)",
      }
    : {
        lineColor: "#ef4444",
        topColor: "rgba(239,68,68,0.35)",
        bottomColor: "rgba(239,68,68,0.02)",
      };
}

interface PriceChartProps {
  assetId: string;
  ticker: string | null;
}

export function PriceChart({ assetId, ticker }: PriceChartProps) {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [period, setPeriod] = useState("1y");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["price-history", assetId, period],
    queryFn: () =>
      api.get<OHLCBar[]>(`/assets/${assetId}/price-history/?period=${period}`),
    staleTime: 5 * 60 * 1000,
    enabled: !!ticker,
  });

  const perf = useMemo(() => {
    if (!data || data.length < 2) return null;
    const first = data[0].close;
    const last = data[data.length - 1].close;
    const pct = (last / first - 1) * 100;
    return { pct, isPositive: last >= first };
  }, [data]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isDark = document.documentElement.classList.contains("dark");
    const chart = createChart(container, buildChartOptions(isDark));
    const series = chart.addSeries(AreaSeries, {
      lineWidth: 2 as const,
      priceLineVisible: true,
      lastValueVisible: true,
      lineColor: "#3b82f6",
      topColor: "rgba(59,130,246,0.3)",
      bottomColor: "rgba(59,130,246,0.02)",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      chartRef.current?.applyOptions({ width, height });
    });
    resizeObserver.observe(container);

    const themeObserver = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains("dark");
      chartRef.current?.applyOptions(buildChartOptions(dark));
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !data || data.length === 0) return;

    if (data.length >= 2) {
      const isPositive = data[data.length - 1].close >= data[0].close;
      seriesRef.current.applyOptions(getAreaColors(isPositive));
    }

    seriesRef.current.setData(
      data.map((bar) => ({ time: bar.time, value: bar.close })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  if (!ticker) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        {t("dashboard.insufficientData")}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-border sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {perf ? (
            <>
              <span
                className={`font-mono text-base font-bold tabular-nums ${
                  perf.isPositive ? "text-green-500" : "text-red-500"
                }`}
              >
                {perf.isPositive ? "+" : ""}
                {perf.pct.toFixed(2)}%
              </span>
              <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground">
                {ticker}
              </span>
            </>
          ) : (
            <span className="font-mono text-[10px] tracking-[2px] uppercase text-muted-foreground">
              {ticker}
            </span>
          )}
        </div>

        <div className="flex gap-0.5 bg-secondary/50 border border-border rounded-md p-0.5 self-start sm:self-auto">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-2 py-1 sm:px-2.5 font-mono text-[10px] tracking-wide rounded transition-all duration-150 ${
                period === p.key
                  ? "bg-background text-primary border border-primary/20 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-[260px] sm:h-[clamp(320px,50vh,640px)]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className="font-mono text-xs text-muted-foreground animate-pulse">
              {t("common.loading")}
            </span>
          </div>
        )}
        {isError && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className="text-sm text-destructive">
              Error loading price data
            </span>
          </div>
        )}
        {!isLoading && !isError && data?.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className="text-sm text-muted-foreground">
              {t("dashboard.insufficientData")}
            </span>
          </div>
        )}
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}
