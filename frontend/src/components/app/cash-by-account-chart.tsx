"use client";

import Link from "next/link";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatMoney } from "@/lib/utils";
import { useChartTheme, CHART_COLORS } from "@/lib/chart-theme";
import { ACCOUNT_TYPE_KEYS } from "@/lib/constants";
import { useTranslations } from "@/i18n/use-translations";
import type { PortfolioAccount } from "@/types";

// Donut + list of where the cash is, one slice per account with a positive balance.
export function CashByAccountChart({ accounts }: { accounts: PortfolioAccount[] }) {
  const ct = useChartTheme();
  const t = useTranslations();

  const data = accounts
    .map((a) => ({
      id: a.account_id,
      name: a.account_name,
      type: a.account_type,
      value: parseFloat(a.balance),
    }))
    .filter((a) => a.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = data.reduce((sum, a) => sum + a.value, 0);

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t("common.noData")}</p>;
  }

  return (
    <div className="@container">
      <div className="grid items-center gap-4 @md:grid-cols-[200px_1fr]">
        <div className="relative">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={95}
                paddingAngle={data.length > 1 ? 2 : 0}
                stroke="none"
              >
                {data.map((d, i) => (
                  <Cell key={d.id} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => formatMoney(v as number)}
                contentStyle={ct.tooltipStyle}
                labelStyle={ct.tooltipLabelStyle}
                itemStyle={ct.tooltipItemStyle}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-muted-foreground">{t("dashboard.cash")}</span>
            <span className="text-base font-bold tabular-nums">{formatMoney(total)}</span>
          </div>
        </div>

        <ul className="space-y-2">
          {data.map((d, i) => (
            <li key={d.id}>
              <Link
                href="/accounts"
                className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {ACCOUNT_TYPE_KEYS[d.type] ? t(ACCOUNT_TYPE_KEYS[d.type]) : d.type}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular-nums">{formatMoney(d.value)}</span>
                  <span className="block text-xs tabular-nums text-muted-foreground">
                    {((d.value / total) * 100).toFixed(1)}%
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
