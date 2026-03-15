"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { SavingsProjection } from "@/types";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const MONTH_NAMES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [year, month] = d.split("-");
  return `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;
}

interface Props {
  projection: SavingsProjection;
}

const SCENARIOS = ["conservative", "average", "optimistic"] as const;

const SCENARIO_COLORS = {
  conservative: "text-amber-500",
  average: "text-blue-500",
  optimistic: "text-green-500",
} as const;

const SCENARIO_ICONS = {
  conservative: TrendingDown,
  average: Minus,
  optimistic: TrendingUp,
} as const;

export function ProjectionCard({ projection }: Props) {
  const t = useTranslations();

  const progress =
    parseFloat(projection.current_patrimony) /
    parseFloat(projection.goal.target_amount);
  const progressPct = Math.min(progress * 100, 100);

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <Card>
        <CardContent className="pt-4 pb-4 px-4 space-y-3">
          <div className="flex justify-between items-baseline text-sm">
            <span className="font-mono text-muted-foreground">
              {t("savings.progress")}
            </span>
            <span className="font-mono font-semibold tabular-nums">
              {progressPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs font-mono text-muted-foreground">
            <span>{formatMoney(projection.current_patrimony)}</span>
            <span>{formatMoney(projection.goal.target_amount)}</span>
          </div>
          <div className="flex justify-between text-xs font-mono">
            <span className="text-muted-foreground">{t("savings.remaining")}</span>
            <span className="font-semibold">{formatMoney(projection.remaining)}</span>
          </div>
          <div className="flex justify-between text-xs font-mono">
            <span className="text-muted-foreground">{t("savings.avgMonthlyRate")}</span>
            <span className="font-semibold">{formatMoney(projection.avg_monthly_savings)}/mes</span>
          </div>
        </CardContent>
      </Card>

      {/* Scenario cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {SCENARIOS.map((key) => {
          const scenario = projection.scenarios[key];
          const Icon = SCENARIO_ICONS[key];
          return (
            <Card key={key}>
              <CardContent className="pt-4 pb-4 px-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${SCENARIO_COLORS[key]}`} />
                  <span className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
                    {t(`savings.${key}`)}
                  </span>
                </div>
                <div className="font-mono text-lg font-bold tabular-nums">
                  {scenario.months_to_goal != null
                    ? t("savings.monthsRemaining", { months: scenario.months_to_goal })
                    : "—"}
                </div>
                <div className="space-y-1 text-xs font-mono text-muted-foreground">
                  <p>{t("savings.monthlyRate")}: {formatMoney(scenario.monthly_rate)}</p>
                  <p>{t("savings.estimatedDate", { date: fmtDate(scenario.target_date) })}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* On-track status */}
      {projection.on_track !== null && (
        <Card className={projection.on_track ? "border-green-500/30" : "border-red-500/30"}>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              <div
                className={`h-2 w-2 rounded-full ${
                  projection.on_track ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span
                className={`font-mono text-sm font-semibold ${
                  projection.on_track ? "text-green-500" : "text-red-500"
                }`}
              >
                {projection.on_track ? t("savings.onTrack") : t("savings.behindSchedule")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {projection.on_track
                ? t("savings.onTrackDetail")
                : projection.deadline_shortfall
                  ? t("savings.behindScheduleDetail", {
                      extra: formatMoney(projection.deadline_shortfall),
                    })
                  : t("savings.behindScheduleGeneric")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
