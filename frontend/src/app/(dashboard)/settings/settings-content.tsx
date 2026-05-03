"use client";

import { useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { useTranslations } from "@/i18n/use-translations";
import type { Settings, SnapshotStatus, StorageInfo } from "@/types";
import {
  TAX_COUNTRY_OPTIONS,
  isSupportedTaxCountry,
  localizedCountryName,
} from "@/lib/tax-countries";

const TABLE_TOOLTIP_KEYS: Record<string, string> = {
  assets_asset: "settings.tableTooltipAssetsAsset",
  assets_account: "settings.tableTooltipAssetsAccount",
  assets_accountsnapshot: "settings.tableTooltipAssetsAccountsnapshot",
  assets_settings: "settings.tableTooltipAssetsSettings",
  assets_portfoliosnapshot: "settings.tableTooltipAssetsPortfoliosnapshot",
  assets_positionsnapshot: "settings.tableTooltipAssetsPositionsnapshot",
  transactions_transaction: "settings.tableTooltipTransactionsTransaction",
  transactions_dividend: "settings.tableTooltipTransactionsDividend",
  transactions_interest: "settings.tableTooltipTransactionsInterest",
};

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatRelative(date: Date, now: Date): string {
  const diffMs = date.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin === 0) return "ahora mismo";
  if (diffMin > 0) return `en ${diffMin} min`;
  return `hace ${Math.abs(diffMin)} min`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Helper: renders a custom label span for Base UI Select (Portal unmounts items) ──

function SelectLabel({ label, placeholder }: { label: string; placeholder?: string }) {
  return (
    <span className="flex flex-1 text-left truncate" data-slot="select-value">
      {label || <span className="text-muted-foreground">{placeholder ?? "—"}</span>}
    </span>
  );
}

// ── Field wrapper: label + control, consistent with asset detail page ──

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

export function SettingsContent() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const now = useNow();

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<Settings>("/settings/"),
    staleTime: 10 * 60_000,
  });

  const { data: snapshotStatus } = useQuery({
    queryKey: ["snapshot-status"],
    queryFn: () => api.get<SnapshotStatus>("/reports/snapshot-status/"),
    refetchInterval: 60_000,
  });

  const { data: storageInfo, isLoading: storageLoading } = useQuery({
    queryKey: ["storage-info"],
    queryFn: () => api.get<StorageInfo>("/storage-info/"),
    staleTime: 60_000,
  });

  const [form, setForm] = useState<Partial<Settings>>({});
  const [settingsSaved, setSettingsSaved] = useState(false);

  const settingsMut = useMutation({
    mutationFn: (data: Partial<Settings>) => api.put("/settings/", { ...settings, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setForm({});
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    },
    onError: () => toast.error(t("common.errorSaving")),
  });

  const current = { ...settings, ...form } as Settings;

  // ── Option maps for Select labels ──
  const COST_METHOD_LABELS: Record<string, string> = {
    FIFO: t("settings.fifo"),
    LIFO: t("settings.lifo"),
    WAC: t("settings.wac"),
  };

  const GIFT_COST_LABELS: Record<string, string> = {
    ZERO: t("settings.zeroCost"),
    MARKET: t("settings.marketPrice"),
  };

  const PRICE_UPDATE_LABELS: Record<string, string> = {
    "0": t("settings.manual"),
    "5": t("settings.min5"),
    "15": t("settings.min15"),
    "30": t("settings.min30"),
    "60": t("settings.hour1"),
    "360": t("settings.hours6"),
    "1440": t("settings.hours24"),
  };

  const PRICE_SOURCE_LABELS: Record<string, string> = {
    YAHOO: "Yahoo Finance",
  };

  const SNAPSHOT_FREQ_LABELS: Record<string, string> = {
    "0": t("settings.snapshotDisabled"),
    "15": t("settings.every15min"),
    "30": t("settings.every30min"),
    "60": t("settings.every1h"),
    "180": t("settings.every3h"),
    "360": t("settings.every6h"),
    "720": t("settings.every12h"),
    "1440": t("settings.every24h"),
  };

  const RETENTION_LABELS: Record<string, string> = {
    never: t("settings.neverDelete"),
    "365": t("settings.olderThan1y"),
    "1825": t("settings.olderThan5y"),
    "3650": t("settings.olderThan10y"),
  };

  // Cost method change warning
  const [methodWarning, setMethodWarning] = useState<{ field: "cost_basis_method" | "fiscal_cost_method"; value: string } | null>(null);

  function handleCostMethodChange(field: "cost_basis_method" | "fiscal_cost_method", value: string) {
    const currentValue = field === "cost_basis_method" ? settings?.cost_basis_method : settings?.fiscal_cost_method;
    if (currentValue && currentValue !== value) {
      setMethodWarning({ field, value });
    } else {
      setForm((f) => ({ ...f, [field]: value }));
    }
  }

  function confirmMethodChange() {
    if (methodWarning) {
      setForm((f) => ({ ...f, [methodWarning.field]: methodWarning.value }));
      setMethodWarning(null);
    }
  }

  // Data retention
  const [retentionDays, setRetentionDays] = useState<number | null | undefined>(undefined);
  const currentRetention = retentionDays !== undefined ? retentionDays : (settings?.data_retention_days ?? null);
  const [purgePortfolio, setPurgePortfolio] = useState<boolean | undefined>(undefined);
  const currentPurgePortfolio = purgePortfolio !== undefined ? purgePortfolio : (settings?.purge_portfolio_snapshots ?? true);
  // Backup
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<Record<string, number | boolean> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleExport = async () => {
    try {
      const res = await fetch("/api/proxy/backup/export/", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fintrack-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error(t("common.error"));
    }
  };

  const [importing, setImporting] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImportError(null);
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api.upload<{ counts: Record<string, number | boolean> }>("/backup/import/", formData);
      setImportResult(result.counts);
      queryClient.invalidateQueries();
      toast.success(t("settings.backupImported"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al importar el backup";
      setImportError(msg);
      toast.error("Error al importar");
    } finally {
      setImporting(false);
    }
    e.target.value = "";
  };

  if (!settings) return null;

  const hasPendingChanges = Object.keys(form).length > 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("settings.title")}</h1>
        <div className="flex items-center gap-2">
          {settingsSaved && <span className="text-xs text-green-500">{t("settings.settingsSaved")}</span>}
          <Button
            size="sm"
            onClick={() => settingsMut.mutate(form)}
            disabled={!hasPendingChanges || settingsMut.isPending}
          >
            {settingsMut.isPending ? t("common.saving") : t("settings.saveSettings")}
          </Button>
        </div>
      </div>

      {/* Cost method change warning dialog */}
      <Dialog open={methodWarning !== null} onOpenChange={(open) => { if (!open) setMethodWarning(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.costMethodWarningTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {methodWarning?.field === "cost_basis_method"
              ? t("settings.costMethodWarningPortfolio")
              : t("settings.costMethodWarningFiscal")}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setMethodWarning(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={confirmMethodChange}>
              {t("common.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Two-column card layout (like asset detail) ── */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">

        {/* Portfolio Calculation */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
              {t("settings.generalSettings")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 sm:gap-x-6">
              <Field label={t("settings.baseCurrency")}>
                <Input value={current.base_currency ?? "EUR"} onChange={(e) => setForm((f) => ({ ...f, base_currency: e.target.value }))} />
              </Field>
              <Field label={t("settings.costMethod")}>
                <Select value={current.cost_basis_method} onValueChange={(v) => v && handleCostMethodChange("cost_basis_method", v)}>
                  <SelectTrigger>
                    <SelectLabel label={COST_METHOD_LABELS[current.cost_basis_method] ?? ""} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIFO">{t("settings.fifo")}</SelectItem>
                    <SelectItem value="LIFO">{t("settings.lifo")}</SelectItem>
                    <SelectItem value="WAC">{t("settings.wac")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("settings.fiscalMethod")}>
                <Select value={current.fiscal_cost_method} onValueChange={(v) => v && handleCostMethodChange("fiscal_cost_method", v)}>
                  <SelectTrigger>
                    <SelectLabel label={COST_METHOD_LABELS[current.fiscal_cost_method] ?? ""} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIFO">{t("settings.fifo")}</SelectItem>
                    <SelectItem value="LIFO">{t("settings.lifo")}</SelectItem>
                    <SelectItem value="WAC">{t("settings.wac")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("settings.giftCost")}>
                <Select value={current.gift_cost_mode} onValueChange={(v) => v && setForm((f) => ({ ...f, gift_cost_mode: v as Settings["gift_cost_mode"] }))}>
                  <SelectTrigger>
                    <SelectLabel label={GIFT_COST_LABELS[current.gift_cost_mode] ?? ""} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ZERO">{t("settings.zeroCost")}</SelectItem>
                    <SelectItem value="MARKET">{t("settings.marketPrice")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("settings.moneyDecimals")}>
                <Input type="number" value={current.rounding_money ?? 2} onChange={(e) => setForm((f) => ({ ...f, rounding_money: parseInt(e.target.value) }))} />
              </Field>
              <Field label={t("settings.quantityDecimals")}>
                <Input type="number" value={current.rounding_qty ?? 6} onChange={(e) => setForm((f) => ({ ...f, rounding_qty: parseInt(e.target.value) }))} />
              </Field>
              <Field label={t("settings.taxCountry")}>
                <Select
                  value={current.tax_country ?? "ES"}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, tax_country: v }))}
                >
                  <SelectTrigger>
                    <SelectLabel
                      label={
                        current.tax_country
                          ? `${current.tax_country} · ${localizedCountryName(
                              current.tax_country,
                              typeof document !== "undefined" ? document.documentElement.lang || "es" : "es",
                            )}`
                          : ""
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_COUNTRY_OPTIONS.map((code) => {
                      const name = localizedCountryName(
                        code,
                        typeof document !== "undefined" ? document.documentElement.lang || "es" : "es",
                      );
                      const supported = isSupportedTaxCountry(code);
                      return (
                        <SelectItem key={code} value={code}>
                          {code} · {name}
                          {supported ? " ✓" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t("settings.taxCountryHelp")}
                </p>
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* Prices & Snapshots */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
              {t("settings.priceUpdateFreq")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 sm:gap-x-6">
              <Field label={t("settings.priceUpdateFreq")}>
                <Select value={String(current.price_update_interval ?? 0)} onValueChange={(v) => v && setForm((f) => ({ ...f, price_update_interval: parseInt(v) }))}>
                  <SelectTrigger>
                    <SelectLabel label={PRICE_UPDATE_LABELS[String(current.price_update_interval ?? 0)] ?? ""} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("settings.manual")}</SelectItem>
                    <SelectItem value="5">{t("settings.min5")}</SelectItem>
                    <SelectItem value="15">{t("settings.min15")}</SelectItem>
                    <SelectItem value="30">{t("settings.min30")}</SelectItem>
                    <SelectItem value="60">{t("settings.hour1")}</SelectItem>
                    <SelectItem value="360">{t("settings.hours6")}</SelectItem>
                    <SelectItem value="1440">{t("settings.hours24")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("settings.priceSource")}>
                <Select value={current.default_price_source ?? "YAHOO"} onValueChange={(v) => v && setForm((f) => ({ ...f, default_price_source: v as Settings["default_price_source"] }))}>
                  <SelectTrigger>
                    <SelectLabel label={PRICE_SOURCE_LABELS[current.default_price_source ?? "YAHOO"] ?? ""} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YAHOO">Yahoo Finance</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label={t("settings.snapshotFreq")}>
                  <Select value={String(current.snapshot_frequency ?? 1440)} onValueChange={(v) => v && setForm((f) => ({ ...f, snapshot_frequency: parseInt(v) }))}>
                    <SelectTrigger>
                      <SelectLabel label={SNAPSHOT_FREQ_LABELS[String(current.snapshot_frequency ?? 1440)] ?? ""} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{t("settings.snapshotDisabled")}</SelectItem>
                      <SelectItem value="15">{t("settings.every15min")}</SelectItem>
                      <SelectItem value="30">{t("settings.every30min")}</SelectItem>
                      <SelectItem value="60">{t("settings.every1h")}</SelectItem>
                      <SelectItem value="180">{t("settings.every3h")}</SelectItem>
                      <SelectItem value="360">{t("settings.every6h")}</SelectItem>
                      <SelectItem value="720">{t("settings.every12h")}</SelectItem>
                      <SelectItem value="1440">{t("settings.every24h")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                {snapshotStatus && snapshotStatus.frequency_minutes > 0 && (
                  <div className="mt-2 space-y-1">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                      {snapshotStatus.last_snapshot
                        ? <>{t("settings.lastSnapshot")}: <span className="font-medium text-foreground">{formatRelative(new Date(snapshotStatus.last_snapshot), now)}</span> · {formatDateTime(snapshotStatus.last_snapshot)}</>
                        : t("settings.noSnapshots")}
                    </span>
                    {snapshotStatus.next_snapshot && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                        {t("settings.nextSnapshot")}: <span className="font-medium text-foreground">{formatRelative(new Date(snapshotStatus.next_snapshot), now)}</span> · {formatDateTime(snapshotStatus.next_snapshot)}
                      </span>
                    )}
                  </div>
                )}
                {snapshotStatus && snapshotStatus.frequency_minutes === 0 && (
                  <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                    {t("settings.snapshotsDisabled")}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Storage & Retention ── */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
              {t("settings.storage")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">{t("settings.storageDesc")}</p>
            <div className="flex items-baseline gap-1.5 mb-3">
              {storageLoading ? (
                <span className="text-sm text-muted-foreground">{t("settings.calculating")}</span>
              ) : (
                <>
                  <span className="text-xl sm:text-2xl font-bold tabular-nums">
                    {storageInfo ? storageInfo.total_mb.toFixed(2) : "—"}
                  </span>
                  <span className="text-sm text-muted-foreground">{t("settings.mb")}</span>
                </>
              )}
            </div>
            {storageInfo && storageInfo.tables.length > 0 && (
              <TooltipProvider delay={200}>
                <div className="space-y-1">
                  {storageInfo.tables.map((tbl) => {
                    const tooltipKey = TABLE_TOOLTIP_KEYS[tbl.table];
                    return (
                      <div key={tbl.table} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 font-mono truncate min-w-0">
                          {tbl.table}
                          {tooltipKey && (
                            <Tooltip>
                              <TooltipTrigger className="inline-flex">
                                <Info className="h-3 w-3 shrink-0 cursor-help text-muted-foreground/60" />
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs">
                                {t(tooltipKey)}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </span>
                        <span className="tabular-nums shrink-0 ml-2">{tbl.size_mb.toFixed(3)} {t("settings.mb")}</span>
                      </div>
                    );
                  })}
                </div>
              </TooltipProvider>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
              {t("settings.dataRetention")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              {t("settings.dataRetentionDesc")}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Select
                value={currentRetention === null || currentRetention === undefined ? "never" : String(currentRetention)}
                onValueChange={(v) => v && setRetentionDays(v === "never" ? null : parseInt(v))}
              >
                <SelectTrigger className="w-full sm:w-56">
                  <SelectLabel label={RETENTION_LABELS[currentRetention === null || currentRetention === undefined ? "never" : String(currentRetention)] ?? ""} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">{t("settings.neverDelete")}</SelectItem>
                  <SelectItem value="365">{t("settings.olderThan1y")}</SelectItem>
                  <SelectItem value="1825">{t("settings.olderThan5y")}</SelectItem>
                  <SelectItem value="3650">{t("settings.olderThan10y")}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const payload: Partial<Settings> = { data_retention_days: currentRetention };
                  if (purgePortfolio !== undefined) payload.purge_portfolio_snapshots = purgePortfolio;
                  settingsMut.mutate(payload);
                  setRetentionDays(undefined);
                  setPurgePortfolio(undefined);
                }}
                disabled={(retentionDays === undefined && purgePortfolio === undefined) || settingsMut.isPending}
              >
                {t("common.save")}
              </Button>
            </div>

            {currentRetention !== null && currentRetention !== undefined && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{t("settings.purgeTargets")}</p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                    checked={currentPurgePortfolio}
                    onChange={(e) => setPurgePortfolio(e.target.checked)}
                  />
                  <span className="text-xs">
                    <span className="font-medium">{t("settings.purgePortfolioSnapshots")}</span>
                    <span className="text-muted-foreground"> — {t("settings.purgePortfolioSnapshotsDesc")}</span>
                  </span>
                </label>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Backup ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
            {t("settings.backup")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            {t("settings.backupDesc")}
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <Button variant="outline" size="sm" onClick={handleExport}>
              {t("settings.downloadBackup")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? `${t("common.loading")}...` : t("settings.importBackup")}
            </Button>
          </div>

          {importResult && (
            <div className="mt-4 rounded-md bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-700 dark:text-green-400">
              <p className="font-medium mb-1">{t("settings.backupImported")}</p>
              <ul className="space-y-0.5 text-xs">
                <li>{t("settings.backupAssets")}: {importResult.assets}</li>
                <li>{t("settings.backupAccounts")}: {importResult.accounts}</li>
                <li>{t("settings.backupAccountHistory")}: {importResult.account_snapshots}</li>
                <li>{t("settings.backupPortfolioHistory")}: {importResult.portfolio_snapshots}</li>
                <li>{t("settings.backupPositionHistory")}: {importResult.position_snapshots}</li>
                <li>{t("settings.backupTransactions")}: {importResult.transactions}</li>
                <li>{t("settings.backupDividends")}: {importResult.dividends}</li>
                <li>{t("settings.backupInterests")}: {importResult.interests}</li>
              </ul>
            </div>
          )}

          {importError && (
            <div className="mt-4 rounded-md bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-700 dark:text-red-400">
              {importError}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
