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

  // ── Compute default TAE from last 3 records ──
  const defaultTAE = useMemo(() => {
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

  // ── Compute default monthly contribution from last 3 months ──
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

  // ── Controls state ──
  const [projectionYears, setProjectionYears] = useState(5);
  const [monthlyContribution, setMonthlyContribution] = useState<number | null>(null);
  const [userTAE, setUserTAE] = useState<number | null>(null);

  const contribution = monthlyContribution ?? defaultContribution;
  const activeTAE = userTAE !== null ? userTAE / 100 : defaultTAE; // userTAE is in %, convert to decimal

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
  const { chartData, projectedBalance, projectedInterest, lastRealLabel } = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const remainingMonthsThisYear = 12 - currentMonth;

    // --- 1) Historical yearly bars (completed past years, pure real data) ---
    const yearlyInterest = new Map<number, number>();
    const yearlyBalance = new Map<number, number>();

    for (const m of monthlyData) {
      const year = parseInt(m.month.slice(0, 4));
      yearlyInterest.set(year, (yearlyInterest.get(year) ?? 0) + m.interestGross);
      if (m.balance !== null) {
        yearlyBalance.set(year, m.balance);
      }
    }

    const years = Array.from(yearlyBalance.keys()).sort();
    const pastYears = years.filter((y) => y < currentYear);

    const points: BarPoint[] = [];
    let cumulativeInterest = 0;

    for (const year of pastYears) {
      cumulativeInterest += yearlyInterest.get(year) ?? 0;
      const balance = yearlyBalance.get(year)!;
      const invested = Math.max(0, balance - cumulativeInterest);
      points.push({
        label: String(year),
        invested: round2(invested),
        compoundInterest: round2(cumulativeInterest),
        isProjected: false,
      });
    }

    // --- 2) Current year bar: real data + project remaining months ---
    const realInterestThisYear = yearlyInterest.get(currentYear) ?? 0;
    const startInvested = Math.max(0, currentBalance - totalHistoricalInterest);
    const startInterest = totalHistoricalInterest;

    const monthlyRate = activeTAE > 0 ? Math.pow(1 + activeTAE, 1 / 12) - 1 : 0;

    // Project remaining months of the current year
    let balance = currentBalance;
    let projInterestThisYear = 0;
    for (let m = 0; m < remainingMonthsThisYear; m++) {
      const interest = balance * monthlyRate;
      balance += interest + contribution;
      projInterestThisYear += interest;
    }

    const totalInterestThisYear = realInterestThisYear + projInterestThisYear;
    const cumInterestAtYearEnd = cumulativeInterest + totalInterestThisYear;
    const investedAtYearEnd = Math.max(0, balance - cumInterestAtYearEnd);

    const realLabel = String(currentYear);
    points.push({
      label: realLabel,
      invested: round2(investedAtYearEnd),
      compoundInterest: round2(cumInterestAtYearEnd),
      isProjected: false, // hybrid: real + projected to close the year
    });

    // --- 3) Future full years (pure projection) ---
    let cumInvested = investedAtYearEnd;
    let cumInterest = cumInterestAtYearEnd;

    for (let y = 1; y <= projectionYears; y++) {
      for (let m = 0; m < 12; m++) {
        const interest = balance * monthlyRate;
        balance += interest + contribution;
        cumInvested += contribution;
        cumInterest += interest;
      }

      points.push({
        label: String(currentYear + y),
        invested: round2(cumInvested),
        compoundInterest: round2(cumInterest),
        isProjected: true,
      });
    }

    return {
      chartData: points,
      projectedBalance: round2(balance),
      projectedInterest: round2(cumInterest - startInterest),
      lastRealLabel: realLabel,
    };
  }, [monthlyData, currentBalance, totalHistoricalInterest, projectionYears, activeTAE, contribution]);

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
          {/* Row 1: Slider */}
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
          {/* Row 2: TAE + Contribution */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm">TAE</Label>
                <span className="text-xs text-muted-foreground">
                  {t("interests.projection.avgTAEDefault")}: {(defaultTAE * 100).toFixed(2)}%
                </span>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={userTAE ?? round2(defaultTAE * 100)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setUserTAE(v === "" ? null : parseFloat(v) || 0);
                  }}
                  className="font-mono tabular-nums pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t("interests.projection.monthlyContribution")}</Label>
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
        </CardContent>
      </Card>

      {/* ── Chart ── */}
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
              <ReferenceLine
                x={lastRealLabel}
                stroke={theme.textMuted}
                strokeDasharray="4 4"
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
