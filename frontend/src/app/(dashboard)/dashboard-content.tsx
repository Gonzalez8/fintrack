"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyCell } from "@/components/app/money-cell";
import { PatrimonioEvolutionChart } from "@/components/app/patrimonio-evolution-chart";
import { RVEvolutionChart } from "@/components/app/rv-evolution-chart";
import { formatMoney, formatPct } from "@/lib/utils";
import { useChartTheme, CHART_COLORS } from "@/lib/chart-theme";
import { useTranslations } from "@/i18n/use-translations";
import type { PortfolioData, YearSummary } from "@/types";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export function DashboardContent() {
  const t = useTranslations();
  const ct = useChartTheme();

  const { data: portfolio } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.get<PortfolioData>("/portfolio/"),
    staleTime: 5 * 60_000,
  });

  const { data: yearSummary } = useQuery({
    queryKey: ["year-summary"],
    queryFn: () => api.get<YearSummary[]>("/reports/year-summary/"),
    staleTime: 10 * 60_000,
  });

  const totals = portfolio?.totals;
  const currentYear = new Date().getFullYear();
  const currentYearData = yearSummary?.find((y) => y.year === currentYear);

  const totalPnlPct =
    totals && parseFloat(totals.total_cost) > 0
      ? (
          (parseFloat(totals.total_unrealized_pnl) /
            parseFloat(totals.total_cost)) *
          100
        ).toFixed(2)
      : "0";

  // Allocation pie: equities, fixed income, cash
  const ALLOC_COLORS: Record<string, string> = {
    [t("dashboard.equities")]: "#3b82f6",
    [t("dashboard.fixedIncome")]: "#22c55e",
    [t("dashboard.cash")]: "#f59e0b",
  };

  const allocationData = (() => {
    if (!portfolio) return [];
    let rv = 0,
      rf = 0;
    for (const p of portfolio.positions) {
      const mv = parseFloat(p.market_value);
      if (
        p.asset_type === "STOCK" ||
        p.asset_type === "ETF" ||
        p.asset_type === "CRYPTO"
      )
        rv += mv;
      else rf += mv;
    }
    const cash = parseFloat(totals?.total_cash ?? "0");
    return [
      { name: t("dashboard.equities"), value: rv },
      { name: t("dashboard.fixedIncome"), value: rf },
      { name: t("dashboard.cash"), value: cash },
    ].filter((d) => d.value > 0);
  })();

  // Income by year bar chart
  const barData =
    yearSummary
      ?.map((y) => ({
        year: y.year,
        [t("dashboard.dividends")]: parseFloat(y.dividends_net),
        [t("dashboard.interests")]: parseFloat(y.interests_net),
        [t("dashboard.sales")]: parseFloat(y.realized_pnl),
      }))
      .reverse() ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">{t("dashboard.title")}</h1>

      {/* 3 Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
              {t("dashboard.totalPatrimony")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold tabular-nums">
              {formatMoney(totals?.grand_total)}
            </div>
            {totals && parseFloat(totals.total_cash) > 0 && (
              <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 break-words">
                {t("dashboard.investments")}:{" "}
                {formatMoney(totals.total_market_value)} +{" "}
                {t("dashboard.cash")}: {formatMoney(totals.total_cash)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
              {t("dashboard.income", { year: currentYear })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold tabular-nums">
              {formatMoney(currentYearData?.total_income ?? "0")}
            </div>
            {currentYearData && (
              <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 space-y-0.5">
                <div className="break-words">
                  {t("dashboard.dividends")}:{" "}
                  {formatMoney(currentYearData.dividends_net)} ·{" "}
                  {t("dashboard.interests")}:{" "}
                  {formatMoney(currentYearData.interests_net)}
                </div>
                <div>
                  {t("dashboard.sales")}:{" "}
                  <MoneyCell value={currentYearData.realized_pnl} colored />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
              {t("dashboard.unrealizedPnl")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold tabular-nums">
              <MoneyCell
                value={totals?.total_unrealized_pnl}
                colored
                className="text-xl sm:text-2xl"
              />
              <span className={`ml-2 text-sm ${
                parseFloat(totals?.total_unrealized_pnl ?? "0") >= 0
                  ? "text-green-500"
                  : "text-red-500"
              }`}>
                {formatPct(totalPnlPct)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3 Chart cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        {/* Allocation pie */}
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">
              {t("dashboard.assetAllocation")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={allocationData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ percent }: { percent?: number }) =>
                    `${((percent ?? 0) * 100).toFixed(1)}%`
                  }
                >
                  {allocationData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        ALLOC_COLORS[d.name] ??
                        CHART_COLORS[i % CHART_COLORS.length]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => formatMoney(v as number)}
                  contentStyle={ct.tooltipStyle}
                  labelStyle={ct.tooltipLabelStyle}
                  itemStyle={ct.tooltipItemStyle}
                />
                <Legend wrapperStyle={ct.legendStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Asset distribution bars */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("dashboard.assetDistribution")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {portfolio?.positions.map((p, i) => {
                const pct = parseFloat(p.weight);
                return (
                  <div key={p.asset_id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-block h-3 w-3 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                        <span className="font-medium truncate">
                          {p.asset_name}
                        </span>
                        {p.asset_ticker && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {p.asset_ticker}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-muted-foreground">
                          {formatMoney(p.market_value)}
                        </span>
                        <span className="w-14 text-right font-medium">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor:
                            CHART_COLORS[i % CHART_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Income by year */}
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">
              {t("dashboard.incomeByYear")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div style={{ height: Math.max(300, barData.length * 50) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barData}
                    layout="vertical"
                    margin={{ left: 0, right: 8, top: 0, bottom: 0 }}
                  >
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) =>
                        v === 0 ? "0" : `${(v / 1000).toFixed(0)}k`
                      }
                      tick={ct.axisTick}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="year"
                      width={42}
                      tick={ct.axisTick}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(v) => formatMoney(v as number)}
                      labelFormatter={(label) =>
                        t("dashboard.yearLabel", { year: label })
                      }
                      contentStyle={ct.tooltipStyle}
                      labelStyle={ct.tooltipLabelStyle}
                      itemStyle={ct.tooltipItemStyle}
                      cursor={ct.barCursor}
                    />
                    <Legend wrapperStyle={ct.legendStyle} />
                    <Bar
                      dataKey={t("dashboard.dividends")}
                      stackId="income"
                      fill="#3b82f6"
                    />
                    <Bar
                      dataKey={t("dashboard.interests")}
                      stackId="income"
                      fill="#22c55e"
                    />
                    <Bar
                      dataKey={t("dashboard.sales")}
                      stackId="income"
                      fill="#f59e0b"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Evolution charts */}
      <PatrimonioEvolutionChart />
      <RVEvolutionChart />
    </div>
  );
}
