"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  Legend,
} from "recharts";
import { api } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartTheme, SERIES, POSITIVE } from "@/lib/chart-theme";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { Interest, PaginatedResponse } from "@/types";

// ── helpers ──────────────────────────────────────────────────────────

const MONTH_ABBR = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function fmtAxis(m: string): string {
  const [year, month] = m.split("-");
  return `${MONTH_ABBR[parseInt(month) - 1]} ${year.slice(2)}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

/** Compute TAE from a single interest record */
function recordTAE(gross: number, balance: number, days: number): number | null {
  if (balance <= 0 || gross <= 0 || days <= 0) return null;
  return Math.pow(1 + gross / balance, 365 / days) - 1;
}

interface MonthlyPoint {
  month: string;
  balance: number | null;
  interestGross: number;
}

interface ChartPoint {
  month: string;
  label: string;
  historical: number | null;
  projected: number | null;
}

// ── component ────────────────────────────────────────────────────────

export function InterestsProjectionTab() {
  const t = useTranslations();
  const theme = useChartTheme();

  // Fetch ALL interests (no pagination) for projection calculations
  const { data: allData, isLoading } = useQuery({
    queryKey: ["interests", "all"],
    queryFn: async () => {
      // Fetch all pages
      let page = 1;
      const all: Interest[] = [];
      let hasNext = true;
      while (hasNext) {
        const res = await api.get<PaginatedResponse<Interest>>(
          `/interests/?page=${page}&ordering=date_end`
        );
        all.push(...res.results);
        hasNext = !!res.next;
        page++;
      }
      return all;
    },
  });

  const interests = allData ?? [];

  // ── Aggregate monthly data ──
  const monthlyData = useMemo(() => {
    if (!interests.length) return [];
    const map = new Map<string, MonthlyPoint>();

    for (const i of interests) {
      const key = i.date_end.slice(0, 7); // YYYY-MM
      const existing = map.get(key);
      const gross = parseFloat(i.gross) || 0;
      const balance = i.balance ? parseFloat(i.balance) : null;

      if (existing) {
        existing.interestGross += gross;
        if (balance !== null && (existing.balance === null || balance > existing.balance)) {
          existing.balance = balance;
        }
      } else {
        map.set(key, { month: key, balance, interestGross: gross });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [interests]);

  // ── Compute average TAE from last 3 months with data ──
  const avgTAE = useMemo(() => {
    if (!interests.length) return 0;
    const sorted = [...interests].sort(
      (a, b) => b.date_end.localeCompare(a.date_end)
    );
    const taes: number[] = [];
    for (const i of sorted) {
      if (taes.length >= 3) break;
      const gross = parseFloat(i.gross) || 0;
      const balance = parseFloat(i.balance ?? "0") || 0;
      const days = i.days;
      const tae = recordTAE(gross, balance, days);
      if (tae !== null) taes.push(tae);
    }
    if (!taes.length) return 0;
    return taes.reduce((s, v) => s + v, 0) / taes.length;
  }, [interests]);

  // ── Compute average monthly contribution from last 3 months ──
  const defaultContribution = useMemo(() => {
    if (monthlyData.length < 2) return 0;
    const recent = monthlyData.slice(-4); // last 4 to compute 3 deltas
    const deltas: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].balance !== null && recent[i - 1].balance !== null) {
        const delta = recent[i].balance! - recent[i - 1].balance! - recent[i].interestGross;
        if (delta > 0) deltas.push(delta);
      }
    }
    if (!deltas.length) return 0;
    return Math.round(deltas.reduce((s, v) => s + v, 0) / deltas.length);
  }, [monthlyData]);

  // ── Controls state ──
  const [projectionYears, setProjectionYears] = useState(5);
  const [monthlyContribution, setMonthlyContribution] = useState<number | null>(null);

  const contribution = monthlyContribution ?? defaultContribution;

  // ── Current balance & totals ──
  const currentBalance = useMemo(() => {
    for (let i = monthlyData.length - 1; i >= 0; i--) {
      if (monthlyData[i].balance !== null) return monthlyData[i].balance!;
    }
    return 0;
  }, [monthlyData]);

  const totalHistoricalInterest = useMemo(() => {
    return interests.reduce((s, i) => s + (parseFloat(i.gross) || 0), 0);
  }, [interests]);

  // ── Build chart data ──
  const { chartData, projectedBalance, projectedInterest, junctionMonth } = useMemo(() => {
    // Historical points
    const historical: ChartPoint[] = monthlyData
      .filter((m) => m.balance !== null)
      .map((m) => ({
        month: m.month,
        label: fmtAxis(m.month),
        historical: m.balance!,
        projected: null,
      }));

    if (!historical.length) {
      return { chartData: [], projectedBalance: 0, projectedInterest: 0, junctionMonth: "" };
    }

    const lastHistorical = historical[historical.length - 1];
    const jMonth = lastHistorical.month;

    // Projection
    const projMonths = projectionYears * 12;
    const monthlyRate = Math.pow(1 + avgTAE, 1 / 12) - 1;
    let balance = lastHistorical.historical!;
    let totalFutureInterest = 0;

    const projected: ChartPoint[] = [];
    // Junction point: appears in both series
    projected.push({
      month: jMonth,
      label: fmtAxis(jMonth),
      historical: null,
      projected: balance,
    });

    const lastDate = new Date(jMonth + "-01");
    for (let i = 1; i <= projMonths; i++) {
      const interest = balance * monthlyRate;
      balance = balance + interest + contribution;
      totalFutureInterest += interest;
      const d = addMonths(lastDate, i);
      const key = monthKey(d);
      projected.push({
        month: key,
        label: fmtAxis(key),
        historical: null,
        projected: Math.round(balance * 100) / 100,
      });
    }

    // Merge: historical + projected (junction point shared)
    const merged = [...historical, ...projected];
    // Sort by month
    merged.sort((a, b) => a.month.localeCompare(b.month));

    // Deduplicate (junction month appears twice — merge them)
    const deduped: ChartPoint[] = [];
    for (const p of merged) {
      const last = deduped[deduped.length - 1];
      if (last && last.month === p.month) {
        if (p.historical !== null) last.historical = p.historical;
        if (p.projected !== null) last.projected = p.projected;
      } else {
        deduped.push({ ...p });
      }
    }

    return {
      chartData: deduped,
      projectedBalance: Math.round(balance * 100) / 100,
      projectedInterest: Math.round(totalFutureInterest * 100) / 100,
      junctionMonth: jMonth,
    };
  }, [monthlyData, projectionYears, avgTAE, contribution]);

  // ── Axis formatter ──
  const fmtK = (v: number) =>
    Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0);

  const interval = chartData.length <= 12 ? 0 : chartData.length <= 24 ? 1 : Math.floor(chartData.length / 12);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="py-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="py-4"><Skeleton className="h-[300px] w-full" /></CardContent></Card>
      </div>
    );
  }

  if (!interests.length) {
    return (
      <div className="text-center text-muted-foreground py-12">
        {t("interests.noInterests")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label={t("interests.projection.currentBalance")}
          value={formatMoney(currentBalance)}
        />
        <MetricCard
          label={t("interests.projection.totalHistorical")}
          value={formatMoney(totalHistoricalInterest)}
          valueClass="text-green-500"
        />
        <MetricCard
          label={t("interests.projection.projectedBalance")}
          value={formatMoney(projectedBalance)}
          valueClass="text-blue-500"
        />
        <MetricCard
          label={t("interests.projection.futureInterest")}
          value={formatMoney(projectedInterest)}
          valueClass="text-emerald-500"
        />
      </div>

      {/* ── Controls ── */}
      <Card>
        <CardContent className="py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Years slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t("interests.projection.years")}</Label>
                <span className="text-sm font-mono tabular-nums text-muted-foreground">
                  {projectionYears} {projectionYears === 1 ? t("interests.projection.year") : t("interests.projection.yearsUnit")}
                </span>
              </div>
              <Slider
                value={[projectionYears]}
                onValueChange={(v) => setProjectionYears(Array.isArray(v) ? v[0] : v)}
                min={1}
                max={20}
              />
            </div>
            {/* Monthly contribution */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t("interests.projection.monthlyContribution")}</Label>
                <span className="text-sm font-mono tabular-nums text-muted-foreground">
                  {formatMoney(contribution)}
                </span>
              </div>
              <Input
                type="number"
                step="50"
                min="0"
                value={monthlyContribution ?? defaultContribution}
                onChange={(e) => setMonthlyContribution(parseFloat(e.target.value) || 0)}
                className="font-mono tabular-nums"
              />
            </div>
          </div>
          {avgTAE > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("interests.projection.avgTAE")}: {(avgTAE * 100).toFixed(2)}%
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Chart ── */}
      <Card>
        <CardContent className="pt-4 pb-2 px-2 sm:px-4">
          <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground mb-3 px-2">
            {t("interests.projection.chartTitle")}
          </p>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradHistorical" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SERIES.interests} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={SERIES.interests} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={theme.axisTick}
                axisLine={false}
                tickLine={false}
                interval={interval}
              />
              <YAxis
                tick={theme.axisTick}
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtK}
                width={50}
              />
              <Tooltip
                contentStyle={theme.tooltipStyle}
                labelStyle={theme.tooltipLabelStyle}
                itemStyle={theme.tooltipItemStyle}
                cursor={theme.tooltipCursor}
                formatter={(value, name) => {
                  const v = Number(value);
                  const label =
                    name === "historical"
                      ? t("interests.projection.historical")
                      : t("interests.projection.projected");
                  return [formatMoney(String(v.toFixed(2))), label];
                }}
              />
              <Legend
                wrapperStyle={theme.legendStyle}
                formatter={(value: string) =>
                  value === "historical"
                    ? t("interests.projection.historical")
                    : t("interests.projection.projected")
                }
              />
              {/* Historical line (solid) */}
              <Line
                type="monotone"
                dataKey="historical"
                stroke={SERIES.interests}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              {/* Projected line (dashed) */}
              <Line
                type="monotone"
                dataKey="projected"
                stroke={POSITIVE}
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                connectNulls={false}
              />
              {/* Junction point marker */}
              {junctionMonth && (
                <ReferenceDot
                  x={fmtAxis(junctionMonth)}
                  y={currentBalance}
                  r={5}
                  fill={SERIES.interests}
                  stroke="white"
                  strokeWidth={2}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ── MetricCard ───────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className={`text-lg font-semibold font-mono tabular-nums mt-0.5 ${valueClass ?? ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
