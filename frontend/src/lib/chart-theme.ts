"use client";

import { useState, useEffect } from "react";

type CSSProperties = Record<string, string | number | undefined>;

export const CHART_FONT =
  "'JetBrains Mono', 'Fira Code', ui-monospace, monospace";

export const CHART_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#06b6d4",
  "#ef4444",
  "#f97316",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
] as const;

export const SERIES = {
  investments: "#3b82f6",
  cash: "#f59e0b",
  rf: "#22c55e",
  dividends: "#3b82f6",
  interests: "#22c55e",
  sales: "#f59e0b",
} as const;

/**
 * Round axis ticks covering [min, max] and 0: steps of 1, 2, 2.5 or 5 × a power of ten, about four of them.
 */
export function niceTicks(min: number, max: number): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (hi === lo) return [0];
  const raw = (hi - lo) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((st) => st >= raw) ?? 10 * pow;
  const first = Math.floor(lo / step);
  const count = Math.ceil(hi / step) - first + 1;
  // Rounded so 0.1 + 0.2 style errors do not reach the labels
  return Array.from({ length: count }, (_, i) => Number(((first + i) * step).toPrecision(12)));
}

export const POSITIVE = "#22c55e";
export const NEGATIVE = "#ef4444";

export interface ChartTokens {
  bg: string;
  text: string;
  textMuted: string;
  grid: string;
  border: string;
  tooltipStyle: CSSProperties;
  tooltipLabelStyle: CSSProperties;
  tooltipItemStyle: CSSProperties;
  tooltipCursor: CSSProperties;
  barCursor: CSSProperties;
  axisTick: { fontSize: number; fill: string; fontFamily: string };
  legendStyle: CSSProperties;
}

const DARK_TOKENS: ChartTokens = {
  bg: "#111827",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  grid: "rgba(30,45,69,0.4)",
  border: "#1e2d45",
  tooltipStyle: {
    backgroundColor: "#131f35",
    border: "1px solid #1e2d45",
    borderRadius: "8px",
    fontFamily: CHART_FONT,
    fontSize: "11px",
    color: "#e2e8f0",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    padding: "8px 12px",
  },
  tooltipLabelStyle: {
    color: "#94a3b8",
    fontFamily: CHART_FONT,
    marginBottom: "4px",
    fontSize: "10px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  tooltipItemStyle: {
    fontFamily: CHART_FONT,
    padding: "2px 0",
    fontSize: "12px",
  },
  tooltipCursor: {
    stroke: "#1e2d45",
    strokeWidth: 1,
    strokeDasharray: "4 4",
  },
  barCursor: {
    fill: "rgba(255,255,255,0.04)",
  },
  axisTick: { fontSize: 10, fill: "#94a3b8", fontFamily: CHART_FONT },
  legendStyle: {
    fontSize: "11px",
    fontFamily: CHART_FONT,
    color: "#94a3b8",
    width: "100%",
    boxSizing: "border-box",
    paddingBottom: "4px",
  },
};

const LIGHT_TOKENS: ChartTokens = {
  bg: "#ffffff",
  text: "#0f1728",
  textMuted: "#6b7280",
  grid: "rgba(229,231,235,0.7)",
  border: "#e5e7eb",
  tooltipStyle: {
    backgroundColor: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    fontFamily: CHART_FONT,
    fontSize: "11px",
    color: "#0f1728",
    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    padding: "8px 12px",
  },
  tooltipLabelStyle: {
    color: "#6b7280",
    fontFamily: CHART_FONT,
    marginBottom: "4px",
    fontSize: "10px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  tooltipItemStyle: {
    fontFamily: CHART_FONT,
    padding: "2px 0",
    fontSize: "12px",
  },
  tooltipCursor: {
    stroke: "#e5e7eb",
    strokeWidth: 1,
    strokeDasharray: "4 4",
  },
  barCursor: {
    fill: "rgba(0,0,0,0.04)",
  },
  axisTick: { fontSize: 10, fill: "#6b7280", fontFamily: CHART_FONT },
  legendStyle: {
    fontSize: "11px",
    fontFamily: CHART_FONT,
    color: "#6b7280",
    width: "100%",
    boxSizing: "border-box",
    paddingBottom: "4px",
  },
};

export function useChartTheme(): ChartTokens {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  return isDark ? DARK_TOKENS : LIGHT_TOKENS;
}
