"use client";

import { useState, useEffect, useLayoutEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, pollTask } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DataTable, type Column } from "@/components/app/data-table";
import { MoneyCell } from "@/components/app/money-cell";
import { SwipeCard } from "@/components/app/swipe-card";
import { Plus, Search, Pencil, Trash2, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Clock, MinusCircle } from "lucide-react";
import { toast } from "sonner";
import type { Asset, AssetFormData, PaginatedResponse } from "@/types";
import { ASSET_TYPE_LABELS, ASSET_TYPE_BADGE_COLORS } from "@/lib/constants";
import { useTranslations } from "@/i18n/use-translations";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";

const PAGE_SIZE = 25;

/* ── Sync Status Helper ────────────────────────────────────── */

function formatSyncDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Ahora";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
}

function SyncStatusBadge({ asset }: { asset: Asset }) {
  const status = asset.price_status;
  const timeAgo = formatSyncDate(asset.price_updated_at);

  if (asset.price_mode === "MANUAL") {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <MinusCircle className="h-3.5 w-3.5" />
        <span className="text-xs">Manual</span>
      </div>
    );
  }

  if (status === "OK") {
    return (
      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">OK</span>
        {timeAgo && <span className="text-[10px] text-muted-foreground">{timeAgo}</span>}
      </div>
    );
  }

  if (status === "ERROR") {
    return (
      <div className="flex items-center gap-1.5 text-destructive">
        <AlertCircle className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Error</span>
        {timeAgo && <span className="text-[10px] text-muted-foreground">{timeAgo}</span>}
      </div>
    );
  }

  if (status === "NO_TICKER") {
    return (
      <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
        <AlertCircle className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Sin ticker</span>
      </div>
    );
  }

  // PENDING or null
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <Clock className="h-3.5 w-3.5" />
      <span className="text-xs">Pendiente</span>
    </div>
  );
}

/* ── Asset Card (mobile) uses shared SwipeCard ─────────────── */

function AssetCard({
  asset,
  onTap,
  onEdit,
  onDelete,
}: {
  asset: Asset;
  onTap: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const badgeColor = ASSET_TYPE_BADGE_COLORS[asset.type] ?? "";
  const accentColor = asset.type === "STOCK"
    ? "border-l-blue-500"
    : asset.type === "ETF"
      ? "border-l-emerald-500"
      : asset.type === "FUND"
        ? "border-l-violet-500"
        : "border-l-orange-500";

  return (
    <SwipeCard onTap={onTap} onEdit={onEdit} onDelete={onDelete} accentColor={accentColor}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate leading-tight">{asset.name}</p>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            {asset.ticker && (
              <span className="font-mono text-[11px] font-medium text-muted-foreground">
                {asset.ticker}
              </span>
            )}
            <Badge
              variant="secondary"
              className={cn("text-[9px] px-1.5 h-4", badgeColor)}
            >
              {ASSET_TYPE_LABELS[asset.type] || asset.type}
            </Badge>
            <SyncStatusBadge asset={asset} />
          </div>
        </div>
        <div className="text-right shrink-0">
          <MoneyCell
            value={asset.current_price}
            currency={asset.currency}
            className="text-sm font-semibold"
          />
          <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
            {asset.currency}
          </p>
        </div>
      </div>
    </SwipeCard>
  );
}

/* ── Mobile Pagination ──────────────────────────────────────── */

function MobilePagination({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-2 sm:hidden">
      <p className="text-xs text-muted-foreground tabular-nums">
        {total} resultado{total !== 1 ? "s" : ""}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs tabular-nums font-mono">
          {page}/{totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────── */

export function AssetsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [updating, setUpdating] = useState(false);
  const [priceResult, setPriceResult] = useState<{ updated: number; errors: string[] } | null>(null);

  const page = Number(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";
  const typeFilter = searchParams.get("type") || "";

  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebounce(searchInput, 300);

  // Sync debounced search to URL
  useEffect(() => {
    if (debouncedSearch !== search) {
      setParam("search", debouncedSearch);
    }
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading } = useQuery({
    queryKey: ["assets", page, debouncedSearch, typeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (search) params.set("search", search);
      if (typeFilter) params.set("type", typeFilter);
      return api.get<PaginatedResponse<Asset>>(`/assets/?${params}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/assets/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"], refetchType: "active" });
      toast.success(t("common.deleted"));
    },
    onError: () => {
      toast.error(t("assets.deleteError"));
    },
  });

  const handleUpdatePrices = async () => {
    setUpdating(true);
    setPriceResult(null);
    try {
      const res = await api.post<{ task_id: string }>("/assets/update-prices/");
      const taskResult = await pollTask(res.task_id);
      if (taskResult.status === "FAILURE") throw new Error(taskResult.error ?? "Error");
      const result = taskResult.result as { updated: number; errors: string[] };
      setPriceResult({ updated: result.updated, errors: result.errors });
      queryClient.invalidateQueries({ queryKey: ["assets"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["portfolio"], refetchType: "active" });
    } catch {
      setPriceResult({ updated: 0, errors: [t("common.error")] });
    } finally {
      setUpdating(false);
    }
  };

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== "page") params.delete("page");
    router.push(`?${params}`);
  };

  /* ── Desktop table columns (unchanged) ── */
  const columns: Column<Asset>[] = [
    {
      key: "name",
      header: t("common.name"),
      render: (a) => (
        <div>
          <p className="font-medium text-sm">{a.name}</p>
          {a.ticker && <p className="text-xs text-muted-foreground">{a.ticker}</p>}
        </div>
      ),
    },
    {
      key: "type",
      header: t("common.type"),
      render: (a) => (
        <Badge
          variant="secondary"
          className={ASSET_TYPE_BADGE_COLORS[a.type] ?? ""}
        >
          {ASSET_TYPE_LABELS[a.type] || a.type}
        </Badge>
      ),
    },
    { key: "currency", header: t("common.currency"), render: (a) => <span className="text-sm">{a.currency}</span> },
    { key: "price", header: t("transactions.price"), className: "text-right", render: (a) => <MoneyCell value={a.current_price} currency={a.currency} /> },
    {
      key: "sync",
      header: "Sync",
      render: (a) => <SyncStatusBadge asset={a} />,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (a) => (
        <div className="flex gap-1 justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); setEditing(a); setDialogOpen(true); }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Eliminar este activo?")) deleteMutation.mutate(a.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  const assets = data?.results ?? [];
  const total = data?.count ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">{t("assets.title")}</h1>
        <Button variant="outline" size="sm" onClick={handleUpdatePrices} disabled={updating}>
          <RefreshCw className={`h-4 w-4 mr-2 ${updating ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{updating ? t("portfolio.updating") : t("portfolio.updatePrices")}</span>
        </Button>
      </div>

      {priceResult && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">{priceResult.updated}</span>{" "}
          {t("portfolio.pricesUpdated")}
          {priceResult.errors.length > 0 && (
            <span className="text-destructive ml-1">
              · {priceResult.errors.length} {t("common.error").toLowerCase()}
            </span>
          )}
        </p>
      )}

      {/* Filters — mobile: stacked, desktop: row */}
      <div className="space-y-2 sm:space-y-0 sm:flex sm:flex-row sm:gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`${t("common.search")}...`}
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={(v) => setParam("type", v === "ALL" ? "" : v || "")}>
            <SelectTrigger className="flex-1 sm:w-[150px]">
              <span data-slot="select-value">{typeFilter ? (ASSET_TYPE_LABELS[typeFilter] || typeFilter) : t("common.all")}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("common.all")}</SelectItem>
              {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Desktop inline new button */}
          <Button className="hidden sm:flex" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> {t("common.new")}
          </Button>
        </div>
      </div>

      {/* ── Mobile: Card List ── */}
      <div className="sm:hidden">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{t("common.loading")}...</p>
        ) : assets.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{t("common.noData")}</p>
        ) : (
          <div className="space-y-2">
            {assets.map((a) => (
              <AssetCard
                key={a.id}
                asset={a}
                onTap={() => router.push(`/assets/${a.id}`)}
                onEdit={() => { setEditing(a); setDialogOpen(true); }}
                onDelete={() => {
                  if (confirm("Eliminar este activo?")) deleteMutation.mutate(a.id);
                }}
              />
            ))}
          </div>
        )}
        <MobilePagination
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={(p) => setParam("page", String(p))}
        />
      </div>

      {/* ── Desktop: Table ── */}
      <div className="hidden sm:block">
        <DataTable
          columns={columns}
          data={assets}
          keyFn={(a) => a.id}
          onRowClick={(a) => router.push(`/assets/${a.id}`)}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={(p) => setParam("page", String(p))}
          emptyMessage={isLoading ? `${t("common.loading")}...` : t("common.noData")}
        />
      </div>

      {/* ── Mobile FAB ── */}
      <button
        onClick={() => { setEditing(null); setDialogOpen(true); }}
        className={cn(
          "fixed bottom-24 right-5 z-40 sm:hidden",
          "flex h-14 w-14 items-center justify-center rounded-full",
          "bg-primary text-primary-foreground shadow-lg shadow-primary/25",
          "active:scale-95 transition-transform duration-150",
        )}
        aria-label={t("assets.new")}
      >
        <Plus className="h-6 w-6" />
      </button>

      <AssetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        asset={editing}
      />
    </div>
  );
}

/* ── Create / Edit Dialog ───────────────────────────────────── */

function AssetDialog({
  open,
  onOpenChange,
  asset,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset: Asset | null;
}) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form, setForm] = useState<AssetFormData>({
    name: "",
    ticker: "",
    isin: "",
    type: "STOCK",
    currency: "EUR",
    price_mode: "AUTO",
    issuer_country: "",
    domicile_country: "",
    withholding_country: "",
  });
  const [loading, setLoading] = useState(false);

  // Sync form whenever dialog opens or asset changes
  useLayoutEffect(() => {
    if (!open) return;
    if (asset) {
      setForm({
        name: asset.name,
        ticker: asset.ticker || "",
        isin: asset.isin || "",
        type: asset.type,
        currency: asset.currency,
        price_mode: asset.price_mode,
        issuer_country: asset.issuer_country || "",
        domicile_country: asset.domicile_country || "",
        withholding_country: asset.withholding_country || "",
      });
    } else {
      setForm({ name: "", ticker: "", isin: "", type: "STOCK", currency: "EUR", price_mode: "AUTO", issuer_country: "", domicile_country: "", withholding_country: "" });
    }
  }, [open, asset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (asset) {
        await api.put(`/assets/${asset.id}/`, form);
        toast.success(t("common.success"));
      } else {
        await api.post("/assets/", form);
        toast.success(t("common.success"));
      }
      queryClient.invalidateQueries({ queryKey: ["assets"], refetchType: "active" });
      onOpenChange(false);
    } catch {
      toast.error(t("common.errorSaving"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{asset ? t("assets.edit") : t("assets.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-sm font-medium">{t("common.name")} *</label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("assets.ticker")}</label>
              <Input value={form.ticker} onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("assets.isin")}</label>
              <Input value={form.isin} onChange={(e) => setForm((f) => ({ ...f, isin: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("common.type")}</label>
              <Select value={form.type} onValueChange={(v) => v && setForm((f) => ({ ...f, type: v as AssetFormData["type"] }))}>
                <SelectTrigger><span data-slot="select-value">{ASSET_TYPE_LABELS[form.type] || form.type}</span></SelectTrigger>
                <SelectContent>
                  {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("common.currency")}</label>
              <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("assets.priceMode")}</label>
              <Select value={form.price_mode} onValueChange={(v) => v && setForm((f) => ({ ...f, price_mode: v as "MANUAL" | "AUTO" }))}>
                <SelectTrigger><span data-slot="select-value">{form.price_mode === "AUTO" ? "Automatico" : "Manual"}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">Automatico</SelectItem>
                  <SelectItem value="MANUAL">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("assets.issuerCountry")}</label>
              <Input value={form.issuer_country} onChange={(e) => setForm((f) => ({ ...f, issuer_country: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("assets.domicileCountry")}</label>
              <Input value={form.domicile_country} onChange={(e) => setForm((f) => ({ ...f, domicile_country: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("assets.withholdingCountry")}</label>
              <Input value={form.withholding_country} onChange={(e) => setForm((f) => ({ ...f, withholding_country: e.target.value }))} />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              {loading ? `${t("common.loading")}...` : t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
