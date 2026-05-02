"use client";

import { Copy, AlertTriangle, Info } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { useTaxDeclaration } from "@/hooks/use-tax-declaration";
import {
  copyRentaValue,
  copyRentaBlock,
  copyRentaSaleRow,
  formatForRenta,
} from "@/lib/clipboard";
import { useTranslations } from "@/i18n/use-translations";
import { formatMoney } from "@/lib/utils";
import type { TaxDeclaration } from "@/types";

interface Props {
  year: string;
}

export function RentaModeTab({ year }: Props) {
  const t = useTranslations();
  const { data, isLoading, isError } = useTaxDeclaration(year);

  if (isLoading) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        {t("common.loading")}
      </p>
    );
  }
  if (isError || !data) {
    return (
      <p className="py-6 text-sm text-red-500">
        {t("common.error")}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <Header t={t} year={year} />
      <InterestsBlock t={t} block={data.interests} />
      <DividendsBlock t={t} block={data.dividends} />
      <DoubleTaxationBlock t={t} block={data.double_taxation} />
      <CapitalGainsBlock t={t} block={data.capital_gains} />
      <SummaryBlock t={t} data={data} />
      <NoticesBlock t={t} warnings={data.warnings} infos={data.infos} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

type T = ReturnType<typeof useTranslations>;

function Header({ t, year }: { t: T; year: string }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
      <h2 className="text-base font-semibold">
        {t("fiscal.renta.header.title", { year })}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t("fiscal.renta.header.subtitle")}
      </p>
      <div className="flex flex-wrap gap-3 pt-1 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-sm bg-primary/80"
          />
          {t("fiscal.renta.header.legend.copy")}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-sm border border-muted-foreground/40"
          />
          {t("fiscal.renta.header.legend.info")}
        </span>
      </div>
    </div>
  );
}

function CopyableField({
  t,
  label,
  value,
}: {
  t: T;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-base font-semibold tabular-nums">
          {formatForRenta(value)} €
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            copyRentaValue(value, label, t("fiscal.renta.copy.copied"))
          }
          aria-label={t("fiscal.renta.copy.button")}
        >
          <Copy className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-dashed border-border/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-sm tabular-nums text-muted-foreground">
        {formatMoney(value)}
      </span>
    </div>
  );
}

function BlockHeader({ casilla, title }: { casilla: string; title: string }) {
  return (
    <div className="space-y-1 border-b border-border pb-2">
      <p className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
        {casilla}
      </p>
      <h3 className="text-base font-semibold">{title}</h3>
    </div>
  );
}

// ── Block: Interests ────────────────────────────────────────────────

function InterestsBlock({
  t,
  block,
}: {
  t: T;
  block: TaxDeclaration["interests"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <BlockHeader
            casilla={block.casilla}
            title={t("fiscal.renta.interests.title")}
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-2">
          <CopyableField
            t={t}
            label={t("fiscal.renta.interests.gross")}
            value={block.gross}
          />
          <CopyableField
            t={t}
            label={t("fiscal.renta.interests.withholding")}
            value={block.withholding}
          />
          <InfoField
            label={t("fiscal.renta.interests.commission")}
            value={block.commission}
          />
          <InfoField
            label={t("fiscal.renta.interests.net")}
            value={block.net}
          />
        </div>

        {block.by_entity.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fiscal.renta.interests.byEntity")}</TableHead>
                  <TableHead className="text-right">
                    {t("fiscal.renta.interests.gross")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("fiscal.renta.interests.withholding")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("fiscal.renta.interests.commission")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("fiscal.renta.interests.net")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {block.by_entity.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">
                      {formatMoney(row.gross)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(row.withholding)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(row.commission)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(row.net)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell>{t("fiscal.total")}</TableCell>
                  <TableCell className="text-right">
                    {formatMoney(block.gross)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(block.withholding)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(block.commission)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(block.net)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Block: Dividends ────────────────────────────────────────────────

function DividendsBlock({
  t,
  block,
}: {
  t: T;
  block: TaxDeclaration["dividends"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <BlockHeader
            casilla={block.casilla}
            title={t("fiscal.renta.dividends.title")}
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-2">
          <CopyableField
            t={t}
            label={t("fiscal.renta.dividends.grossTotal")}
            value={block.gross_total}
          />
          <CopyableField
            t={t}
            label={t("fiscal.renta.dividends.withholdingEs")}
            value={block.withholding_es}
          />
          <CopyableField
            t={t}
            label={t("fiscal.renta.dividends.custody")}
            value={block.commission}
          />
          <InfoField
            label={t("fiscal.renta.dividends.netInfo")}
            value={block.net_informative}
          />
        </div>

        {block.by_country_entity.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t("fiscal.renta.dividends.byCountryEntity")}
                  </TableHead>
                  <TableHead>{t("fiscal.country")}</TableHead>
                  <TableHead className="text-right">
                    {t("fiscal.renta.dividends.grossTotal")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("fiscal.renta.dividends.withholding")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("fiscal.renta.dividends.custody")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("fiscal.renta.dividends.netInfo")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {block.by_country_entity.map((row, idx) => (
                  <TableRow key={`${row.country}-${row.entity}-${idx}`}>
                    <TableCell className="font-medium">{row.entity}</TableCell>
                    <TableCell>
                      {row.country}
                      {row.is_es && (
                        <span className="ml-2 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                          ES
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(row.gross)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(row.withholding)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(row.commission)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(row.net)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell colSpan={2}>{t("fiscal.total")}</TableCell>
                  <TableCell className="text-right">
                    {formatMoney(block.gross_total)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(block.withholding_total)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(block.commission)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(block.net_informative)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Block: Double Taxation ──────────────────────────────────────────

function DoubleTaxationBlock({
  t,
  block,
}: {
  t: T;
  block: TaxDeclaration["double_taxation"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <BlockHeader
            casilla={block.casilla}
            title={t("fiscal.renta.doubleTaxation.title")}
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-2">
          <CopyableField
            t={t}
            label={t("fiscal.renta.doubleTaxation.foreignGross")}
            value={block.foreign_gross_total}
          />
          <CopyableField
            t={t}
            label={t("fiscal.renta.doubleTaxation.deductibleTotal")}
            value={block.deductible_total}
          />
        </div>

        {block.by_country.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fiscal.country")}</TableHead>
                  <TableHead className="text-right">
                    {t("fiscal.renta.doubleTaxation.gross")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("fiscal.renta.doubleTaxation.withholding")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("fiscal.renta.doubleTaxation.rate")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("fiscal.renta.doubleTaxation.limit")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("fiscal.renta.doubleTaxation.deductible")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {block.by_country.map((row) => {
                  const rateNum = parseFloat(row.rate_applied) * 100;
                  return (
                    <TableRow key={row.country}>
                      <TableCell className="font-medium">{row.country}</TableCell>
                      <TableCell className="text-right">
                        {formatMoney(row.gross)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(row.withholding)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {rateNum.toFixed(2)} %
                        {row.is_default_rate && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({t("fiscal.renta.doubleTaxation.defaultLabel")})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(row.limit)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.deductible)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell colSpan={5}>{t("fiscal.total")}</TableCell>
                  <TableCell className="text-right">
                    {formatMoney(block.deductible_total)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("fiscal.renta.doubleTaxation.empty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Block: Capital Gains ────────────────────────────────────────────

function CapitalGainsBlock({
  t,
  block,
}: {
  t: T;
  block: TaxDeclaration["capital_gains"];
}) {
  const copiedTpl = t("fiscal.renta.sales.rowCopied");

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <BlockHeader
            casilla={block.casilla}
            title={t("fiscal.renta.sales.title")}
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Declarable banner — sets the user's expectation: row-by-row, not totals */}
        <div className="rounded-md border-l-4 border-primary bg-primary/5 px-3 py-2.5">
          <p className="text-sm font-medium">
            {t("fiscal.renta.sales.declarableTitle")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("fiscal.renta.sales.declarableNote")}
          </p>
        </div>

        {block.rows.length > 0 ? (
          <>
            {/* Mobile: per-row cards */}
            <div className="space-y-2 sm:hidden">
              {block.rows.map((row, i) => (
                <div
                  key={`${row.date}-${row.asset_name}-${i}`}
                  className="rounded-lg border border-border p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {row.asset_name}
                      </p>
                      {row.asset_ticker && (
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {row.asset_ticker}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        copyRentaSaleRow(
                          row.asset_name,
                          row.transmission,
                          row.acquisition,
                          copiedTpl,
                        )
                      }
                    >
                      <Copy className="size-3.5" />
                      <span className="ml-1.5 text-xs">
                        {t("fiscal.renta.sales.copyRow")}
                      </span>
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-t border-border/40 pt-2">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[1px] text-muted-foreground">
                        {t("fiscal.renta.sales.transmission")}
                      </p>
                      <p className="font-mono text-xs tabular-nums">
                        {formatMoney(row.transmission)}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[1px] text-muted-foreground">
                        {t("fiscal.renta.sales.acquisition")}
                      </p>
                      <p className="font-mono text-xs tabular-nums">
                        {formatMoney(row.acquisition)}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[1px] text-muted-foreground">
                        {t("fiscal.renta.sales.pnl")}
                      </p>
                      <p
                        className={`font-mono text-xs tabular-nums ${parseFloat(row.pnl) >= 0 ? "text-green-500" : "text-red-500"}`}
                      >
                        {formatMoney(row.pnl)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: declarable table */}
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("fiscal.renta.sales.entity")}</TableHead>
                    <TableHead className="text-right">
                      {t("fiscal.renta.sales.transmission")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("fiscal.renta.sales.acquisition")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("fiscal.renta.sales.pnl")}
                    </TableHead>
                    <TableHead className="text-right w-[1%]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {block.rows.map((row, i) => (
                    <TableRow key={`${row.date}-${row.asset_name}-${i}`}>
                      <TableCell>
                        <div className="font-medium">{row.asset_name}</div>
                        {row.asset_ticker && (
                          <div className="text-[11px] text-muted-foreground">
                            {row.asset_ticker} · {row.date}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatMoney(row.transmission)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatMoney(row.acquisition)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        <span
                          className={
                            parseFloat(row.pnl) >= 0
                              ? "text-green-500"
                              : "text-red-500"
                          }
                        >
                          {formatMoney(row.pnl)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            copyRentaSaleRow(
                              row.asset_name,
                              row.transmission,
                              row.acquisition,
                              copiedTpl,
                            )
                          }
                        >
                          <Copy className="size-3.5" />
                          <span className="ml-1.5 hidden lg:inline">
                            {t("fiscal.renta.sales.copyRow")}
                          </span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totales agregados — secondary, collapsible, non-copyable */}
            <details className="group rounded-md border border-dashed border-border/60">
              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
                <span className="inline-block group-open:rotate-90 transition-transform mr-1.5">
                  ▸
                </span>
                {t("fiscal.renta.sales.totalsTitle")}
              </summary>
              <div className="space-y-2 border-t border-border/40 px-3 py-3">
                <p className="text-[11px] italic text-muted-foreground">
                  {t("fiscal.renta.sales.totalsHint")}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <InfoField
                    label={t("fiscal.renta.sales.transmissionTotal")}
                    value={block.transmission_total}
                  />
                  <InfoField
                    label={t("fiscal.renta.sales.acquisitionTotal")}
                    value={block.acquisition_total}
                  />
                  <InfoField
                    label={t("fiscal.renta.sales.totalGains")}
                    value={block.total_gains}
                  />
                  <InfoField
                    label={t("fiscal.renta.sales.totalLosses")}
                    value={block.total_losses}
                  />
                  <InfoField
                    label={t("fiscal.renta.sales.netResult")}
                    value={block.net_result}
                  />
                </div>
              </div>
            </details>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("fiscal.renta.sales.empty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Block: Final summary ────────────────────────────────────────────

function SummaryBlock({ t, data }: { t: T; data: TaxDeclaration }) {
  const summary = data.summary;

  function buildClipboardPayload(): string {
    const parts: string[] = [];
    parts.push(`RENTA WEB — ${data.year}`, "");
    parts.push("INTERESES");
    parts.push(`  ${t("fiscal.renta.interests.gross")}: ${formatForRenta(summary.interests_gross)}`);
    parts.push(`  ${t("fiscal.renta.interests.withholding")}: ${formatForRenta(summary.interests_withholding)}`);
    parts.push("");
    parts.push("DIVIDENDOS");
    parts.push(`  ${t("fiscal.renta.dividends.grossTotal")}: ${formatForRenta(summary.dividends_gross)}`);
    parts.push(`  ${t("fiscal.renta.dividends.withholdingEs")}: ${formatForRenta(summary.dividends_withholding_es)}`);
    parts.push(`  ${t("fiscal.renta.dividends.custody")}: ${formatForRenta(summary.dividends_commission)}`);
    parts.push("");
    parts.push("DOBLE IMPOSICIÓN INTERNACIONAL");
    parts.push(`  ${t("fiscal.renta.doubleTaxation.foreignGross")}: ${formatForRenta(summary.double_taxation_foreign_gross)}`);
    parts.push(`  ${t("fiscal.renta.doubleTaxation.deductibleTotal")}: ${formatForRenta(summary.double_taxation_deductible)}`);
    parts.push("");
    parts.push(t("fiscal.renta.summary.salesHeader"));
    parts.push(`  ${t("fiscal.renta.sales.transmissionTotal")}: ${formatForRenta(summary.sales_transmission)}`);
    parts.push(`  ${t("fiscal.renta.sales.acquisitionTotal")}: ${formatForRenta(summary.sales_acquisition)}`);
    parts.push(`  ${t("fiscal.renta.sales.netResult")}: ${formatForRenta(summary.sales_net)}`);
    return parts.join("\n");
  }

  return (
    <Card className="border-primary/30 dark:bg-primary/[0.03]">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">
            {t("fiscal.renta.summary.title")}
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              copyRentaBlock(
                buildClipboardPayload(),
                t("fiscal.renta.summary.copyAllSuccess"),
              )
            }
          >
            <Copy className="size-3.5" />
            <span className="ml-1.5">{t("fiscal.renta.summary.copyAll")}</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          <SummaryRow
            label={t("fiscal.renta.interests.gross")}
            value={summary.interests_gross}
          />
          <SummaryRow
            label={t("fiscal.renta.interests.withholding")}
            value={summary.interests_withholding}
          />
          <SummaryRow
            label={t("fiscal.renta.dividends.grossTotal")}
            value={summary.dividends_gross}
          />
          <SummaryRow
            label={t("fiscal.renta.dividends.withholdingEs")}
            value={summary.dividends_withholding_es}
          />
          <SummaryRow
            label={t("fiscal.renta.dividends.custody")}
            value={summary.dividends_commission}
          />
          <SummaryRow
            label={t("fiscal.renta.doubleTaxation.foreignGross")}
            value={summary.double_taxation_foreign_gross}
          />
          <SummaryRow
            label={t("fiscal.renta.doubleTaxation.deductibleTotal")}
            value={summary.double_taxation_deductible}
          />
        </dl>

        {/* Sales section is rendered apart so we can flag it as "control totals only".
            Each individual sale must be declared row-by-row in Renta Web. */}
        <div className="mt-4 rounded-md border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-2.5 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
            {t("fiscal.renta.summary.salesControlTitle")}
          </p>
          <p className="text-[11px] text-muted-foreground italic">
            {t("fiscal.renta.summary.salesControlNote")}
          </p>
          <dl className="grid gap-1.5 sm:grid-cols-2 pt-1">
            <SummaryRow
              label={t("fiscal.renta.sales.transmissionTotal")}
              value={summary.sales_transmission}
            />
            <SummaryRow
              label={t("fiscal.renta.sales.acquisitionTotal")}
              value={summary.sales_acquisition}
            />
            <SummaryRow
              label={t("fiscal.renta.sales.netResult")}
              value={summary.sales_net}
            />
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1.5">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="font-mono text-sm font-semibold tabular-nums">
        {formatForRenta(value)} €
      </dd>
    </div>
  );
}

// ── Block: Warnings + infos ─────────────────────────────────────────

function NoticesBlock({
  t,
  warnings,
  infos,
}: {
  t: T;
  warnings: TaxDeclaration["warnings"];
  infos: TaxDeclaration["infos"];
}) {
  if (warnings.length === 0 && infos.length === 0) return null;

  return (
    <div className="space-y-3">
      {warnings.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-500" />
              {t("fiscal.renta.warnings.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {warnings.map((w, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="mt-0.5 text-amber-500">
                    ⚠
                  </span>
                  <span>{w.message}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {infos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="size-4 text-muted-foreground" />
              {t("fiscal.renta.infos.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {infos.map((info, i) => (
                <li key={i}>{info.message}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
