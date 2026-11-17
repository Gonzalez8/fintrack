"use client";

import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { AmortizationRow, MultiAmortizationResult, Property } from "@/types";

interface Props {
  property: Property;
  schedule: AmortizationRow[];
  multiResult: MultiAmortizationResult | null;
}

function fmtYearsMonths(months: number): string {
  if (months <= 0) return "0";
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y > 0) parts.push(`${y}a`);
  if (m > 0) parts.push(`${m}m`);
  return parts.length ? parts.join(" ") : "0";
}

function SummaryRow({
  label,
  original,
  modified,
  saved,
  strikeOriginal,
}: {
  label: string;
  original: string;
  modified?: string;
  saved?: string;
  strikeOriginal?: boolean;
}) {
  const hasModified = modified !== undefined;
  return (
    <div className="flex flex-col gap-1 py-2.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`font-mono text-sm tabular-nums ${
            hasModified && strikeOriginal ? "text-muted-foreground/60 line-through" : "font-semibold"
          }`}
        >
          {original}
        </span>
        {hasModified && (
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm tabular-nums font-semibold">{modified}</span>
            {saved && (
              <span className="font-mono text-xs tabular-nums font-bold text-emerald-500">
                {saved}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function MortgageSummaryHeader({ property, schedule, multiResult }: Props) {
  const t = useTranslations();

  const balance = parseFloat(property.original_loan_amount!);
  const rate = parseFloat(property.annual_interest_rate!);
  // Position in the schedule = calendar months since the start (months_paid stops when it's paid off)
  const monthsPaid = property.months_elapsed ?? property.months_paid ?? 0;
  const payment = parseFloat(property.monthly_payment!);

  const origLast = schedule[schedule.length - 1];
  const origTotalInterest = origLast?.totalInterestPaid ?? 0;
  const origTotalToPay = balance + origTotalInterest;
  const origEndDate = origLast?.date ?? "—";
  const origTotalMonths = schedule.length - 1;
  const origRemainingMonths = Math.max(0, origTotalMonths - monthsPaid);

  const hasEvents = !!multiResult;
  const modLast = multiResult?.modified[multiResult.modified.length - 1];
  const modTotalInterest = modLast?.totalInterestPaid ?? origTotalInterest;
  const modTotalToPay = balance + modTotalInterest;
  const modEndDate = multiResult?.savings.newEndDate ?? origEndDate;
  const modTotalMonths = multiResult ? multiResult.modified.length - 1 : origTotalMonths;
  const modRemainingMonths = Math.max(0, modTotalMonths - monthsPaid);

  const modPayment = hasEvents
    ? multiResult!.modified.find((r) => r.month > monthsPaid)?.payment ?? payment
    : payment;

  const savedInterest = origTotalInterest - modTotalInterest;
  const savedMonths = origRemainingMonths - modRemainingMonths;

  const isOrigFinished = monthsPaid >= origTotalMonths;
  const isModFinished = hasEvents && monthsPaid >= modTotalMonths;
  const isFinished = hasEvents ? isModFinished : isOrigFinished;

  return (
    <Card>
      <CardContent className="pt-4 pb-4 px-4 space-y-3">
        {/* Mortgage identity */}
        <div>
          <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground mb-2">
            {t("properties.mortgageDetail")}
          </p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-xl font-bold tabular-nums">{formatMoney(balance)}</span>
            <span className="text-xs text-muted-foreground">
              {rate}% {t("properties.mortgageFixed")} · {fmtYearsMonths(origTotalMonths)}
            </span>
          </div>
        </div>

        {/* Mortgage finished banner */}
        {isFinished && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {t("properties.mortgageFinished")}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasEvents
                  ? `${t("properties.resultTotalInterest")}: ${formatMoney(modTotalInterest)} · ${t("properties.savedLabel")}: ${formatMoney(savedInterest)}`
                  : `${t("properties.resultTotalInterest")}: ${formatMoney(origTotalInterest)}`}
              </p>
            </div>
          </div>
        )}

        {/* Detail rows — mobile-first stacked layout */}
        <div>
          <SummaryRow
            label={t("properties.monthlyPayment")}
            original={formatMoney(payment)}
            modified={hasEvents && modPayment !== payment ? formatMoney(modPayment) : undefined}
            saved={hasEvents && modPayment < payment ? formatMoney(payment - modPayment) : undefined}
            strikeOriginal={hasEvents && modPayment !== payment}
          />
          <SummaryRow
            label={t("properties.resultInstallments")}
            original={`${origTotalMonths}`}
            modified={hasEvents && modTotalMonths !== origTotalMonths ? `${modTotalMonths}` : undefined}
            saved={origTotalMonths - modTotalMonths > 0 ? `−${origTotalMonths - modTotalMonths}` : undefined}
            strikeOriginal={hasEvents && modTotalMonths !== origTotalMonths}
          />
          <SummaryRow
            label={t("properties.totalTermLabel")}
            original={fmtYearsMonths(origTotalMonths)}
            modified={hasEvents && modTotalMonths !== origTotalMonths ? fmtYearsMonths(modTotalMonths) : undefined}
            saved={savedMonths > 0 ? fmtYearsMonths(savedMonths) : undefined}
            strikeOriginal={hasEvents && modTotalMonths !== origTotalMonths}
          />
          <SummaryRow
            label={t("properties.resultRemainingTime")}
            original={isOrigFinished ? t("properties.finished") : fmtYearsMonths(origRemainingMonths)}
            modified={hasEvents ? (isModFinished ? t("properties.finished") : fmtYearsMonths(modRemainingMonths)) : undefined}
            saved={savedMonths > 0 ? fmtYearsMonths(savedMonths) : undefined}
            strikeOriginal={hasEvents}
          />
          <SummaryRow
            label={t("properties.endDate")}
            original={origEndDate}
            modified={hasEvents ? modEndDate : undefined}
            strikeOriginal={hasEvents}
          />
          <SummaryRow
            label={t("properties.resultTotalToPay")}
            original={formatMoney(origTotalToPay)}
            modified={hasEvents ? formatMoney(modTotalToPay) : undefined}
            saved={hasEvents ? formatMoney(origTotalToPay - modTotalToPay) : undefined}
            strikeOriginal={hasEvents}
          />
          <SummaryRow
            label={t("properties.resultTotalInterest")}
            original={formatMoney(origTotalInterest)}
            modified={hasEvents ? formatMoney(modTotalInterest) : undefined}
            saved={hasEvents ? formatMoney(savedInterest) : undefined}
            strikeOriginal={hasEvents}
          />
        </div>

        {/* Total extra payments badge */}
        {hasEvents && multiResult && (
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-xs text-muted-foreground">
              {t("properties.totalExtraPayments")} ({multiResult.events.length} {t("properties.eventsCount")})
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-purple-500">
              {formatMoney(multiResult.savings.totalExtraPayments)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
