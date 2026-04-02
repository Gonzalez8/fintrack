"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { useChartTheme, POSITIVE } from "@/lib/chart-theme";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { AmortizationRow, AmortizationEvent } from "@/types";

const INTEREST_COLOR = "#f59e0b";
const EVENT_COLOR = "#a855f7";

interface Props {
  schedule: AmortizationRow[];
  originalSchedule: AmortizationRow[];
  currentMonth: number;
  events: AmortizationEvent[];
}

export function PaymentBreakdownChart({ schedule, originalSchedule, currentMonth, events }: Props) {
  const ct = useChartTheme();
  const t = useTranslations();

  const eventMonths = new Set(events.map((e) => e.month));

  // Use the original schedule's regular payment as the baseline for scale.
  // For months with amortization events, show only the regular payment portion
  // (interest + regular principal), not the extra lump sum.
  const step = Math.max(1, Math.floor(schedule.length / 60));
  const chartData = schedule
    .filter((r) => r.month > 0)
    .filter((_, i) => i % step === 0)
    .map((r) => {
      const isEvent = eventMonths.has(r.month);
      // Find the corresponding original row to get the regular payment
      const origRow = originalSchedule.find((o) => o.month === r.month);
      // Regular interest for this month (from the modified schedule)
      const interest = r.interest;
      // Regular principal = payment - interest (capped, not including extra)
      const regularPrincipal = Math.max(0, r.payment - interest);
      // If this is an event month, the principal includes the extra payment.
      // We want only the regular portion: use min of regular principal and the
      // original schedule's principal as a sanity bound.
      const principal = isEvent && origRow
        ? Math.min(regularPrincipal, origRow.principal + 50) // small buffer for rounding
        : regularPrincipal;

      return {
        month: r.month,
        date: r.date,
        principal: Math.round(principal * 100) / 100,
        interest: Math.round(interest * 100) / 100,
        isEvent,
      };
    });

  const formatAxisYear = (date: string) => {
    if (!date) return "";
    return date.split("-")[0];
  };

  const tickInterval = Math.max(1, Math.floor(chartData.length / 8));

  const renderTooltip = ({ active, payload }: Record<string, unknown>) => {
    if (!active || !Array.isArray(payload) || !payload.length) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = payload[0].payload as any;
    const event = events.find((e) => e.month === d.month);
    return (
      <div style={ct.tooltipStyle as React.CSSProperties}>
        <p style={ct.tooltipLabelStyle as React.CSSProperties}>
          {t("properties.monthLabel")} {d.month} · {d.date}
        </p>
        <p style={{ ...(ct.tooltipItemStyle as React.CSSProperties), color: POSITIVE }}>
          {t("properties.principalLabel")}: {formatMoney(d.principal)}
        </p>
        <p style={{ ...(ct.tooltipItemStyle as React.CSSProperties), color: INTEREST_COLOR }}>
          {t("properties.interestLabel")}: {formatMoney(d.interest)}
        </p>
        {event && (
          <p style={{ ...(ct.tooltipItemStyle as React.CSSProperties), color: EVENT_COLOR, fontWeight: 600 }}>
            {t("properties.extraPaymentShort")}: {formatMoney(event.amount)}
          </p>
        )}
      </div>
    );
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("properties.paymentBreakdown")}
          </p>
        </div>

        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={chartData}
            margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
          >
            <XAxis
              dataKey="date"
              tickFormatter={formatAxisYear}
              tick={ct.axisTick}
              tickLine={false}
              axisLine={false}
              interval={tickInterval}
            />
            <YAxis
              tick={ct.axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v.toFixed(0)}€`}
              width={48}
            />
            <Tooltip content={renderTooltip} cursor={ct.barCursor} />
            <Legend
              wrapperStyle={{
                ...ct.legendStyle,
                paddingLeft: "24px",
                paddingBottom: "8px",
              }}
            />

            {/* Mark event months with reference lines */}
            {events.map((e) => {
              const row = schedule.find((r) => r.month === e.month);
              if (!row) return null;
              return (
                <ReferenceLine
                  key={e.id}
                  x={row.date}
                  stroke={EVENT_COLOR}
                  strokeDasharray="4 2"
                  strokeWidth={1.5}
                />
              );
            })}

            <Bar
              dataKey="principal"
              name={t("properties.principalLabel")}
              stackId="payment"
              fillOpacity={0.85}
              radius={[0, 0, 0, 0]}
              maxBarSize={12}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.isEvent ? EVENT_COLOR : POSITIVE} />
              ))}
            </Bar>
            <Bar
              dataKey="interest"
              name={t("properties.interestLabel")}
              stackId="payment"
              fill={INTEREST_COLOR}
              fillOpacity={0.85}
              radius={[2, 2, 0, 0]}
              maxBarSize={12}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
