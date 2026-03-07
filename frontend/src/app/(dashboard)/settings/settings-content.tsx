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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { useTranslations } from "@/i18n/use-translations";
import type { Settings, SnapshotStatus, StorageInfo } from "@/types";

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

export function SettingsContent() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const now = useNow();

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<Settings>("/settings/"),
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
  const [purgePosition, setPurgePosition] = useState<boolean | undefined>(undefined);
  const currentPurgePosition = purgePosition !== undefined ? purgePosition : (settings?.purge_position_snapshots ?? true);

  // Backup
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<Record<string, number | boolean> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleExport = async () => {
    try {
      const res = await fetch("/api/proxy/backup/export/", { credentials: "include" });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fintrack-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImportError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api.upload<{ counts: Record<string, number | boolean> }>("/backup/import/", formData);
      setImportResult(result.counts);
      queryClient.invalidateQueries();
    } catch {
      setImportError("Error al importar el backup");
    }
    e.target.value = "";
  };

  if (!settings) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">{t("settings.title")}</h1>

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

      {/* General settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.generalSettings")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 max-w-xl">
            <div>
              <label className="text-sm font-medium">{t("settings.baseCurrency")}</label>
              <Input value={current.base_currency ?? "EUR"} onChange={(e) => setForm((f) => ({ ...f, base_currency: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("settings.costMethod")}</label>
              <Select value={current.cost_basis_method} onValueChange={(v) => v && handleCostMethodChange("cost_basis_method", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIFO">{t("settings.fifo")}</SelectItem>
                  <SelectItem value="LIFO">{t("settings.lifo")}</SelectItem>
                  <SelectItem value="WAC">{t("settings.wac")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("settings.fiscalMethod")}</label>
              <Select value={current.fiscal_cost_method} onValueChange={(v) => v && handleCostMethodChange("fiscal_cost_method", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIFO">{t("settings.fifo")}</SelectItem>
                  <SelectItem value="LIFO">{t("settings.lifo")}</SelectItem>
                  <SelectItem value="WAC">{t("settings.wac")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("settings.giftCost")}</label>
              <Select value={current.gift_cost_mode} onValueChange={(v) => v && setForm((f) => ({ ...f, gift_cost_mode: v as Settings["gift_cost_mode"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZERO">{t("settings.zeroCost")}</SelectItem>
                  <SelectItem value="MARKET">{t("settings.marketPrice")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("settings.moneyDecimals")}</label>
              <Input type="number" value={current.rounding_money ?? 2} onChange={(e) => setForm((f) => ({ ...f, rounding_money: parseInt(e.target.value) }))} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("settings.quantityDecimals")}</label>
              <Input type="number" value={current.rounding_qty ?? 6} onChange={(e) => setForm((f) => ({ ...f, rounding_qty: parseInt(e.target.value) }))} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("settings.priceUpdateFreq")}</label>
              <Select value={String(current.price_update_interval ?? 0)} onValueChange={(v) => v && setForm((f) => ({ ...f, price_update_interval: parseInt(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            </div>
            <div>
              <label className="text-sm font-medium">{t("settings.priceSource")}</label>
              <Select value={current.default_price_source ?? "YAHOO"} onValueChange={(v) => v && setForm((f) => ({ ...f, default_price_source: v as Settings["default_price_source"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YAHOO">Yahoo Finance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">{t("settings.snapshotFreq")}</label>
              <Select value={String(current.snapshot_frequency ?? 1440)} onValueChange={(v) => v && setForm((f) => ({ ...f, snapshot_frequency: parseInt(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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

              {snapshotStatus && (
                <div className="mt-2 flex flex-wrap gap-3">
                  {snapshotStatus.frequency_minutes === 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                      {t("settings.snapshotsDisabled")}
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        {snapshotStatus.last_snapshot
                          ? <>{t("settings.lastSnapshot")}: <span className="font-medium text-foreground">{formatRelative(new Date(snapshotStatus.last_snapshot), now)}</span> &middot; {formatDateTime(snapshotStatus.last_snapshot)}</>
                          : t("settings.noSnapshots")}
                      </span>
                      {snapshotStatus.next_snapshot && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          {t("settings.nextSnapshot")}: <span className="font-medium text-foreground">{formatRelative(new Date(snapshotStatus.next_snapshot), now)}</span> &middot; {formatDateTime(snapshotStatus.next_snapshot)}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={() => settingsMut.mutate(form)} disabled={Object.keys(form).length === 0 || settingsMut.isPending}>
              {settingsMut.isPending ? t("common.saving") : t("settings.saveSettings")}
            </Button>
            {settingsSaved && <span className="text-sm text-green-600">{t("settings.settingsSaved")}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Storage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.storage")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-w-xl">
            <div>
              <p className="text-sm text-muted-foreground mb-2">{t("settings.storageDesc")}</p>
              <div className="flex items-baseline gap-1.5">
                {storageLoading ? (
                  <span className="text-sm text-muted-foreground">{t("settings.calculating")}</span>
                ) : (
                  <>
                    <span className="text-2xl font-semibold tabular-nums">
                      {storageInfo ? storageInfo.total_mb.toFixed(2) : "—"}
                    </span>
                    <span className="text-sm text-muted-foreground">{t("settings.mb")}</span>
                  </>
                )}
              </div>
              {storageInfo && storageInfo.tables.length > 0 && (
                <TooltipProvider delay={200}>
                  <div className="mt-3 space-y-1">
                    {storageInfo.tables.map((tbl) => {
                      const tooltipKey = TABLE_TOOLTIP_KEYS[tbl.table];
                      return (
                        <div key={tbl.table} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 font-mono">
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
                          <span className="tabular-nums">{tbl.size_mb.toFixed(3)} {t("settings.mb")}</span>
                        </div>
                      );
                    })}
                  </div>
                </TooltipProvider>
              )}
            </div>

            {/* Data retention */}
            <div className="pt-2 border-t">
              <label className="text-sm font-medium">{t("settings.dataRetention")}</label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                {t("settings.dataRetentionDesc")}
              </p>
              <div className="flex items-center gap-3">
                <Select
                  value={currentRetention === null || currentRetention === undefined ? "never" : String(currentRetention)}
                  onValueChange={(v) => v && setRetentionDays(v === "never" ? null : parseInt(v))}
                >
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
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
                    if (purgePosition !== undefined) payload.purge_position_snapshots = purgePosition;
                    settingsMut.mutate(payload);
                    setRetentionDays(undefined);
                    setPurgePortfolio(undefined);
                    setPurgePosition(undefined);
                  }}
                  disabled={(retentionDays === undefined && purgePortfolio === undefined && purgePosition === undefined) || settingsMut.isPending}
                >
                  {t("common.save")}
                </Button>
              </div>

              {currentRetention !== null && currentRetention !== undefined && (
                <div className="mt-3 space-y-2">
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
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                      checked={currentPurgePosition}
                      onChange={(e) => setPurgePosition(e.target.checked)}
                    />
                    <span className="text-xs">
                      <span className="font-medium">{t("settings.purgePositionSnapshots")}</span>
                      <span className="text-muted-foreground"> — {t("settings.purgePositionSnapshotsDesc")}</span>
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.backup")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {t("settings.backupDesc")}
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <Button variant="outline" onClick={handleExport}>
              {t("settings.downloadBackup")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              {t("settings.importBackup")}
            </Button>
          </div>

          {importResult && (
            <div className="mt-4 rounded-md bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-700 dark:text-green-400">
              <p className="font-medium mb-1">{t("settings.backupImported")}</p>
              <ul className="space-y-0.5">
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
