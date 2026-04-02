"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { useChartTheme, SERIES, POSITIVE, NEGATIVE } from "@/lib/chart-theme";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { AnnualSavingsPoint } from "@/types";

interface Props {
  data: AnnualSavingsPoint[];
}

export function AnnualSavingsChart({ data }: Props) {
  const theme = useChartTheme();
  const t = useTranslations();

  const chartData = data.map((d) => ({
    year: String(d.year),
    cash: parseFloat(d.total_cash_delta),
    investment: parseFloat(d.total_investment_cost_delta),
    total: parseFloat(d.total_real_savings),
  }));

  const fmtK = (v: number) =>
    Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0);

  return (
    <Card>
      <CardContent className="pt-4 pb-2 px-2 sm:px-4">
        <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground mb-3 px-2">
          {t("savings.annualSavings")}
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="year"
              tick={theme.axisTick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={theme.axisTick}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmtK}
              width={45}
            />
            <Tooltip
              contentStyle={theme.tooltipStyle}
              labelStyle={theme.tooltipLabelStyle}
              itemStyle={theme.tooltipItemStyle}
              cursor={theme.barCursor}
              formatter={(value, name) => {
                const v = Number(value);
                const label =
                  name === "cash"
                    ? t("savings.cash")
                    : name === "investment"
                      ? t("savings.investmentCost")
                      : t("savings.realSavings");
                return [formatMoney(String(v.toFixed(2))), label];
              }}
            />
            <Legend
              wrapperStyle={theme.legendStyle}
              formatter={(value: string) =>
                value === "cash"
                  ? t("savings.cash")
                  : value === "investment"
                    ? t("savings.investmentCost")
                    : t("savings.realSavings")
              }
            />
            <ReferenceLine y={0} stroke={theme.grid} />
            <Bar dataKey="cash" stackId="a" fill={SERIES.cash} radius={[0, 0, 0, 0]} />
            <Bar
              dataKey="investment"
              stackId="a"
              fill={SERIES.investments}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
