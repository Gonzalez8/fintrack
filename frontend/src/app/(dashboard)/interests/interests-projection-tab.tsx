"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { api } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartTheme, SERIES } from "@/lib/chart-theme";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { Interest, PaginatedResponse } from "@/types";

// ── helpers ──────────────────────────────────────────────────────────

function recordTAE(gross: number, balance: number, days: number): number | null {
  if (balance <= 0 || gross <= 0 || days <= 0) return null;
  return Math.pow(1 + gross / balance, 365 / days) - 1;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface MonthlyPoint {
  month: string;
  balance: number | null;
  interestGross: number;
}

interface BarPoint {
  label: string;
  invested: number;
  compoundInterest: number;
  isProjected: boolean;
}

// ── component ────────────────────────────────────────────────────────

export function InterestsProjectionTab() {
  const t = useTranslations();
  const theme = useChartTheme();

  const { data: allData, isLoading } = useQuery({
    queryKey: ["interests", "all"],
    queryFn: async () => {
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
      const key = i.date_end.slice(0, 7);
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

  // ── Compute average TAE from last 3 records ──
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
      const tae = recordTAE(gross, balance, i.days);
      if (tae !== null) taes.push(tae);
    }
    if (!taes.length) return 0;
    return taes.reduce((s, v) => s + v, 0) / taes.length;
  }, [interests]);

  // ── Compute average monthly contribution from last 3 months ──
  const defaultContribution = useMemo(() => {
    if (monthlyData.length < 2) return 0;
    const recent = monthlyData.slice(-4);
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

  // ── Build chart: historical yearly bars + projected yearly bars ──
  const { chartData, projectedBalance, projectedInterest, todayLabel } = useMemo(() => {
    // --- 1) Build historical yearly bars from real data ---
    // Group interests by year, accumulate interest
    const yearlyInterest = new Map<number, number>();
    const yearlyBalance = new Map<number, number>(); // last known balance per year

    for (const m of monthlyData) {
      const year = parseInt(m.month.slice(0, 4));
      yearlyInterest.set(year, (yearlyInterest.get(year) ?? 0) + m.interestGross);
      if (m.balance !== null) {
        yearlyBalance.set(year, m.balance); // last month wins (data is sorted)
      }
    }

    const years = Array.from(yearlyBalance.keys()).sort();
    const historicalPoints: BarPoint[] = [];
    let cumulativeInterest = 0;

    for (const year of years) {
      cumulativeInterest += yearlyInterest.get(year) ?? 0;
      const balance = yearlyBalance.get(year)!;
      const invested = Math.max(0, balance - cumulativeInterest);
      historicalPoints.push({
        label: String(year),
        invested: round2(invested),
        compoundInterest: round2(cumulativeInterest),
        isProjected: false,
      });
    }

    // --- 2) "Hoy" bar (current state) ---
    const startInvested = Math.max(0, currentBalance - totalHistoricalInterest);
    const startInterest = totalHistoricalInterest;
    const todayLbl = t("interests.projection.today");

    // Only add "Hoy" if last historical year != current year or no historical
    const currentYear = new Date().getFullYear();
    const lastHistYear = years.length ? years[years.length - 1] : null;

    let points: BarPoint[] = [];

    if (lastHistYear !== null && lastHistYear < currentYear) {
      // Historical bars + separate "Hoy" bar
      points = [
        ...historicalPoints,
        {
          label: todayLbl,
          invested: round2(startInvested),
          compoundInterest: round2(startInterest),
          isProjected: false,
        },
      ];
    } else if (historicalPoints.length) {
      // Last historical year is current year — replace it with "Hoy" label
      points = [...historicalPoints];
      points[points.length - 1] = {
        ...points[points.length - 1],
        label: todayLbl,
      };
    } else {
      points = [
        {
          label: todayLbl,
          invested: round2(startInvested),
          compoundInterest: round2(startInterest),
          isProjected: false,
        },
      ];
    }

    // --- 3) Projected yearly bars ---
    const monthlyRate = avgTAE > 0 ? Math.pow(1 + avgTAE, 1 / 12) - 1 : 0;
    const totalMonths = projectionYears * 12;
    const baseYear = new Date().getFullYear();
    let balance = currentBalance;
    let cumInvested = startInvested;
    let cumInterest = startInterest;

    for (let m = 1; m <= totalMonths; m++) {
      const interest = balance * monthlyRate;
      balance += interest + contribution;
      cumInvested += contribution;
      cumInterest += interest;

      if (m % 12 === 0) {
        const yearNum = m / 12;
        points.push({
          label: String(baseYear + yearNum),
          invested: round2(cumInvested),
          compoundInterest: round2(cumInterest),
          isProjected: true,
        });
      }
    }

    return {
      chartData: points,
      projectedBalance: round2(balance),
      projectedInterest: round2(cumInterest - startInterest),
      todayLabel: todayLbl,
    };
  }, [monthlyData, currentBalance, totalHistoricalInterest, projectionYears, avgTAE, contribution, t]);

  const fmtK = (v: number) =>
    Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0);

  const renderTooltip = ({ active, payload }: Record<string, unknown>) => {
    if (!active || !Array.isArray(payload) || !payload.length) return null;
    const d = payload[0].payload as BarPoint;
    const total = d.invested + d.compoundInterest;
    return (
      <div style={theme.tooltipStyle as React.CSSProperties}>
        <p style={theme.tooltipLabelStyle as React.CSSProperties}>
          {d.label} {d.isProjected ? `(${t("interests.projection.projectedLabel")})` : ""}
        </p>
        <p style={{ ...(theme.tooltipItemStyle as React.CSSProperties), color: SERIES.investments }}>
          {t("interests.projection.invested")}: {formatMoney(d.invested)}
        </p>
        <p style={{ ...(theme.tooltipItemStyle as React.CSSProperties), color: SERIES.interests }}>
          {t("interests.projection.compoundInterest")}: {formatMoney(d.compoundInterest)}
        </p>
        <p style={{ ...(theme.tooltipItemStyle as React.CSSProperties), fontWeight: 600, marginTop: 2 }}>
          Total: {formatMoney(total)}
        </p>
      </div>
    );
  };

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

      {/* ── Legend (custom) ── */}
      <Card>
        <CardContent className="pt-4 pb-2 px-2 sm:px-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 px-2">
            <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
              {t("interests.projection.chartTitle")}
            </p>
            <div className="flex items-center gap-4 ml-auto text-xs text-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: SERIES.investments }} />
                {t("interests.projection.invested")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: SERIES.interests }} />
                {t("interests.projection.compoundInterest")}
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block w-3 h-3 rounded-sm opacity-40" style={{ backgroundColor: SERIES.investments }} />
                {t("interests.projection.projectedLabel")}
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={theme.axisTick}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={theme.axisTick}
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtK}
                width={55}
              />
              <Tooltip
                content={renderTooltip}
                cursor={theme.barCursor}
              />
              {/* ReferenceLine at "Hoy" to mark the boundary */}
              <ReferenceLine
                x={todayLabel}
                stroke={theme.textMuted}
                strokeDasharray="4 4"
                label={{
                  value: t("interests.projection.today"),
                  position: "top",
                  fill: theme.textMuted,
                  fontSize: 10,
                  fontFamily: theme.axisTick.fontFamily,
                }}
              />
              <Bar dataKey="invested" stackId="total" radius={[0, 0, 0, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell
                    key={`inv-${idx}`}
                    fill={SERIES.investments}
                    opacity={entry.isProjected ? 0.45 : 1}
                  />
                ))}
              </Bar>
              <Bar dataKey="compoundInterest" stackId="total" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell
                    key={`int-${idx}`}
                    fill={SERIES.interests}
                    opacity={entry.isProjected ? 0.45 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
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
