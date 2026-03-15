"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { MoneyCell } from "@/components/app/money-cell";
import { AnnualSavingsChart } from "@/components/app/annual-savings-chart";
import { PatrimonyChart } from "@/components/app/patrimony-chart";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { AnnualSavingsPoint, PatrimonioPoint } from "@/types";

function DeltaCell({ value }: { value: string | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const num = parseFloat(value);
  const sign = num > 0 ? "+" : "";
  const cls =
    num > 0 ? "text-green-500" : num < 0 ? "text-red-500" : "text-muted-foreground";
  return (
    <span className={`font-mono tabular-nums ${cls}`}>
      {sign}
      {formatMoney(value)}
    </span>
  );
}

function PctCell({ value }: { value: string | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const num = parseFloat(value);
  const sign = num > 0 ? "+" : "";
  const cls =
    num > 0 ? "text-green-500" : num < 0 ? "text-red-500" : "text-muted-foreground";
  return (
    <span className={`font-mono tabular-nums text-xs ${cls}`}>
      {sign}{num.toFixed(1)}%
    </span>
  );
}

export function AnnualSavingsTab() {
  const t = useTranslations();

  const { data: annualData, isLoading: loadingAnnual } = useQuery({
    queryKey: ["annual-savings"],
    queryFn: () => api.get<AnnualSavingsPoint[]>("/reports/annual-savings/"),
    staleTime: 5 * 60_000,
  });

  const { data: patrimonioData, isLoading: loadingPatrimonio } = useQuery({
    queryKey: ["patrimonio-evolution"],
    queryFn: () => api.get<PatrimonioPoint[]>("/reports/patrimonio-evolution/"),
    staleTime: 5 * 60_000,
  });

  const years = annualData ?? [];
  const patrimonio = patrimonioData ?? [];

  const kpis = useMemo(() => {
    if (years.length === 0) return null;
    const latest = years[years.length - 1];
    const totalSavings = years.reduce(
      (sum, y) => sum + parseFloat(y.total_real_savings),
      0,
    );
    const avgAnnual = totalSavings / years.length;
    const best = years.reduce((a, b) =>
      parseFloat(b.total_real_savings) > parseFloat(a.total_real_savings) ? b : a,
    );
    return {
      patrimony: latest.patrimony,
      avgAnnual: avgAnnual.toFixed(2),
      bestYear: best,
    };
  }, [years]);

  const isLoading = loadingAnnual || loadingPatrimonio;

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground text-sm">
        {t("common.loading")}
      </div>
    );
  }

  if (years.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          {t("common.noData")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
                {t("savings.totalPatrimony")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="font-mono text-base sm:text-xl font-bold tabular-nums">
                {formatMoney(kpis.patrimony)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
                {t("savings.avgAnnualSavings")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <MoneyCell value={kpis.avgAnnual} colored className="text-base sm:text-xl font-bold" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
                {t("savings.bestYear")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <MoneyCell
                value={kpis.bestYear.total_real_savings}
                colored
                className="text-base sm:text-xl font-bold"
              />
              <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                {kpis.bestYear.year}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Annual Savings Bar Chart */}
      <AnnualSavingsChart data={years} />

      {/* Patrimony Evolution Chart */}
      {patrimonio.length > 0 && <PatrimonyChart data={patrimonio} />}

      {/* Year-over-Year Table */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 sm:px-6">
          <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
            {t("savings.yoyGrowth")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-border/40">
            {[...years].reverse().map((y) => (
              <div key={y.year} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <span className="font-mono text-sm font-semibold">{y.year}</span>
                  <DeltaCell value={y.total_real_savings} />
                </div>
                <div className="grid grid-cols-3 gap-x-2 text-[11px] font-mono">
                  <div>
                    <p className="text-muted-foreground/60 mb-0.5">{t("savings.patrimony")}</p>
                    <p className="tabular-nums">{formatMoney(y.patrimony)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground/60 mb-0.5">{t("savings.growth")}</p>
                    <p><PctCell value={y.patrimony_growth_pct} /></p>
                  </div>
                  <div>
                    <p className="text-muted-foreground/60 mb-0.5">{t("savings.months")}</p>
                    <p className="tabular-nums">{y.months_count}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("savings.year")}</TableHead>
                  <TableHead className="text-right">{t("savings.totalSavings")}</TableHead>
                  <TableHead className="text-right">{t("savings.patrimony")}</TableHead>
                  <TableHead className="text-right">{t("savings.growth")}</TableHead>
                  <TableHead className="text-right">{t("savings.growthPct")}</TableHead>
                  <TableHead className="text-right">{t("savings.months")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...years].reverse().map((y) => (
                  <TableRow key={y.year}>
                    <TableCell className="font-mono text-sm font-semibold">
                      {y.year}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <DeltaCell value={y.total_real_savings} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-sm">
                      {formatMoney(y.patrimony)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <DeltaCell value={y.patrimony_growth} />
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <PctCell value={y.patrimony_growth_pct} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-sm">
                      {y.months_count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
