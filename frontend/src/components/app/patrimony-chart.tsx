"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { useChartTheme, SERIES } from "@/lib/chart-theme";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { PatrimonioPoint } from "@/types";

const MONTH_ABBR = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function fmtAxis(m: string): string {
  const [year, month] = m.split("-");
  return `${MONTH_ABBR[parseInt(month) - 1]} ${year.slice(2)}`;
}

interface Props {
  data: PatrimonioPoint[];
}

export function PatrimonyChart({ data }: Props) {
  const theme = useChartTheme();
  const t = useTranslations();

  const chartData = data.map((d) => ({
    month: d.month,
    label: fmtAxis(d.month),
    cash: parseFloat(d.cash),
    investments: parseFloat(d.investments),
    total: parseFloat(d.cash) + parseFloat(d.investments),
  }));

  const fmtK = (v: number) =>
    Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0);

  const interval = chartData.length <= 12 ? 0 : chartData.length <= 24 ? 1 : Math.floor(chartData.length / 12);

  return (
    <Card>
      <CardContent className="pt-4 pb-2 px-2 sm:px-4">
        <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground mb-3 px-2">
          {t("savings.patrimonyEvolution")}
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradCash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SERIES.cash} stopOpacity={0.3} />
                <stop offset="95%" stopColor={SERIES.cash} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gradInv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SERIES.investments} stopOpacity={0.3} />
                <stop offset="95%" stopColor={SERIES.investments} stopOpacity={0.05} />
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
                  name === "cash"
                    ? t("savings.cash")
                    : name === "investments"
                      ? t("savings.investments")
                      : t("savings.totalPatrimony");
                return [formatMoney(String(v.toFixed(2))), label];
              }}
            />
            <Legend
              wrapperStyle={theme.legendStyle}
              formatter={(value: string) =>
                value === "cash"
                  ? t("savings.cash")
                  : value === "investments"
                    ? t("savings.investments")
                    : t("savings.totalPatrimony")
              }
            />
            <Area
              type="monotone"
              dataKey="cash"
              stackId="1"
              stroke={SERIES.cash}
              fill="url(#gradCash)"
              strokeWidth={1.5}
            />
            <Area
              type="monotone"
              dataKey="investments"
              stackId="1"
              stroke={SERIES.investments}
              fill="url(#gradInv)"
              strokeWidth={1.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
