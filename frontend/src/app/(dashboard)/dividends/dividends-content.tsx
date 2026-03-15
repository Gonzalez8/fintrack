"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DataTable, type Column } from "@/components/app/data-table";
import { MoneyCell } from "@/components/app/money-cell";
import { SwipeCard } from "@/components/app/swipe-card";
import { DetailDrawer, type DetailRow } from "@/components/app/detail-drawer";
import { Plus, Search, Pencil, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { Dividend, DividendFormData, Asset, PaginatedResponse, PortfolioData } from "@/types";
import { useDebounce } from "@/hooks/use-debounce";

const PAGE_SIZE = 25;
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => String(currentYear - 5 + i));

export function DividendsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Dividend | null>(null);
  const [detailItem, setDetailItem] = useState<Dividend | null>(null);

  const page = Number(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";
  const yearFilter = searchParams.get("year") || "";

  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    if (debouncedSearch !== search) {
      setParam("search", debouncedSearch);
    }
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading } = useQuery({
    queryKey: ["dividends", page, debouncedSearch, yearFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      if (search) p.set("search", search);
      if (yearFilter) p.set("year", yearFilter);
      return api.get<PaginatedResponse<Dividend>>(`/dividends/?${p}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/dividends/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dividends"], refetchType: "active" });
      toast.success(t("common.deleted"));
    },
    onError: () => {
      toast.error(t("common.errorDeleting"));
    },
  });

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    if (key !== "page") params.delete("page");
    router.push(`?${params}`);
  };

  const prefetchDialogData = () => {
    queryClient.prefetchQuery({ queryKey: ["assets-list"], queryFn: () => api.get<Asset[]>("/assets/?page_size=1000") });
    queryClient.prefetchQuery({ queryKey: ["portfolio"], queryFn: () => api.get<PortfolioData>("/portfolio/") });
  };

  const handleExportCsv = () => {
    const p = new URLSearchParams();
    if (yearFilter) p.set("year", yearFilter);
    if (search) p.set("search", search);
    window.open(`/api/proxy/export/dividends.csv?${p}`, "_blank");
  };

  const columns: Column<Dividend>[] = [
    { key: "date", header: t("common.date"), render: (d) => <span className="text-sm">{d.date}</span> },
    {
      key: "asset",
      header: t("common.name"),
      render: (d) => (
        <div>
          <p className="text-sm font-medium">{d.asset_name}</p>
          {d.asset_ticker && <p className="text-xs text-muted-foreground">{d.asset_ticker}</p>}
        </div>
      ),
    },
    { key: "gross", header: t("dividends.gross"), className: "text-right", render: (d) => <MoneyCell value={d.gross} /> },
    { key: "tax", header: t("dividends.withholding"), className: "text-right", render: (d) => <MoneyCell value={d.tax} /> },
    { key: "net", header: t("dividends.net"), className: "text-right", render: (d) => <MoneyCell value={d.net} colored /> },
    {
      key: "rate",
      header: t("dividends.withholdingRate"),
      className: "text-right",
      render: (d) => (
        <span className="font-mono text-sm tabular-nums">
          {d.withholding_rate ? `${parseFloat(d.withholding_rate).toFixed(1)}%` : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (d) => (
        <div className="flex gap-1 justify-end">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(d); setDialogOpen(true); }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); if (confirm("Eliminar?")) deleteMutation.mutate(d.id); }}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t("dividends.title")}</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={`${t("common.search")}...`} className="pl-9" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <Select value={yearFilter} onValueChange={(v) => setParam("year", v === "all" || !v ? "" : v)}>
          <SelectTrigger className="w-full sm:w-[120px]">
            <span data-slot="select-value">{yearFilter || t("common.all")}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={handleExportCsv} title="CSV">
          <Download className="h-4 w-4" />
        </Button>
        <Button className="hidden sm:flex" onClick={() => { setEditing(null); setDialogOpen(true); }} onMouseEnter={prefetchDialogData}>
          <Plus className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">{t("common.new")}</span>
        </Button>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {(data?.results ?? []).map((d) => (
          <SwipeCard
            key={d.id}
            onTap={() => setDetailItem(d)}
            onEdit={() => { setEditing(d); setDialogOpen(true); }}
            onDelete={() => { if (confirm("Eliminar?")) deleteMutation.mutate(d.id); }}
            accentColor="border-l-blue-500"
          >
            <div className="space-y-1">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium">{d.asset_name}</p>
                  {d.asset_ticker && <p className="text-xs text-muted-foreground">{d.asset_ticker}</p>}
                </div>
                <span className="text-xs text-muted-foreground">{d.date}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("dividends.gross")}</span>
                <span className="font-mono tabular-nums">{formatMoney(d.gross)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("dividends.withholding")}</span>
                <span className="font-mono tabular-nums">{formatMoney(d.tax)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span>{t("dividends.net")}</span>
                <span className={`font-mono tabular-nums ${parseFloat(d.net) >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {formatMoney(d.net ?? "0")}
                </span>
              </div>
              {d.withholding_rate && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("dividends.withholdingRate")}</span>
                  <span className="font-mono tabular-nums">{parseFloat(d.withholding_rate).toFixed(1)}%</span>
                </div>
              )}
            </div>
          </SwipeCard>
        ))}
        {!isLoading && (data?.results ?? []).length === 0 && (
          <p className="text-center text-muted-foreground py-8">{t("common.noData")}</p>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block">
        <DataTable
          columns={columns}
          data={data?.results ?? []}
          keyFn={(d) => d.id}
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.count}
          onPageChange={(p) => setParam("page", String(p))}
          emptyMessage={isLoading ? `${t("common.loading")}...` : t("common.noData")}
        />
      </div>

      {/* FAB mobile */}
      <button
        className="fixed bottom-24 right-5 z-40 sm:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
        onClick={() => { setEditing(null); setDialogOpen(true); }}
        aria-label={t("common.new")}
      >
        <Plus className="h-6 w-6" />
      </button>

      <DividendDialog open={dialogOpen} onOpenChange={setDialogOpen} dividend={editing} />

      <DetailDrawer
        open={!!detailItem}
        onOpenChange={(v) => { if (!v) setDetailItem(null); }}
        title={detailItem?.asset_name ?? ""}
        subtitle={detailItem ? `${detailItem.asset_ticker ?? ""} · ${detailItem.date}` : undefined}
        rows={detailItem ? [
          { label: t("dividends.gross"), value: formatMoney(detailItem.gross) },
          { label: t("dividends.withholding"), value: formatMoney(detailItem.tax) },
          { label: t("dividends.net"), value: <span className={parseFloat(detailItem.net) >= 0 ? "text-green-500" : "text-red-500"}>{formatMoney(detailItem.net)}</span> },
          ...(detailItem.withholding_rate ? [{ label: t("dividends.withholdingRate"), value: `${parseFloat(detailItem.withholding_rate).toFixed(2)}%` }] : []),
          ...(detailItem.shares ? [{ label: t("dividends.shares"), value: detailItem.shares }] : []),
          ...(detailItem.asset_issuer_country ? [{ label: t("dividends.country"), value: detailItem.asset_issuer_country }] : []),
        ] : []}
      />
    </div>
  );
}

function DividendDialog({
  open,
  onOpenChange,
  dividend,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dividend: Dividend | null;
}) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form, setForm] = useState<DividendFormData>({
    date: new Date().toISOString().split("T")[0],
    asset: "",
    gross: "",
    tax: "0",
    net: "",
  });
  const [loading, setLoading] = useState(false);

  const { data: assets } = useQuery({
    queryKey: ["assets-list"],
    queryFn: () => api.get<Asset[]>("/assets/?page_size=1000"),
    enabled: open,
  });

  const { data: portfolio } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.get<PortfolioData>("/portfolio/"),
    enabled: open,
  });

  // Reset form every time the dialog opens
  useEffect(() => {
    if (!open) return;
    if (dividend) {
      setForm({
        date: dividend.date,
        asset: dividend.asset,
        shares: dividend.shares || undefined,
        gross: dividend.gross,
        tax: dividend.tax,
        net: dividend.net,
        withholding_rate: dividend.withholding_rate || undefined,
      });
    } else {
      setForm({ date: new Date().toISOString().split("T")[0], asset: "", gross: "", tax: "0", net: "" });
    }
  }, [open, dividend]);

  // Auto-calculate: gross = net + tax, rate = tax / gross
  const recalcGross = (net: number, tax: number) => {
    const gross = net + tax;
    const rate = gross > 0 ? ((tax / gross) * 100).toFixed(2) : undefined;
    return { gross: gross.toFixed(2), withholding_rate: rate };
  };

  const handleNetChange = (value: string) => {
    setForm((f) => {
      const net = parseFloat(value) || 0;
      const tax = parseFloat(f.tax ?? "0") || 0;
      const { gross, withholding_rate } = recalcGross(net, tax);
      return { ...f, net: value, gross, withholding_rate };
    });
  };

  const handleTaxChange = (value: string) => {
    setForm((f) => {
      const net = parseFloat(f.net) || 0;
      const tax = parseFloat(value) || 0;
      const { gross, withholding_rate } = recalcGross(net, tax);
      return { ...f, tax: value, gross, withholding_rate };
    });
  };

  // Auto-fill shares from portfolio position when asset changes
  const handleAssetChange = (assetId: string) => {
    setForm((f) => {
      const pos = portfolio?.positions?.find((p) => p.asset_id === assetId);
      return { ...f, asset: assetId, shares: pos ? pos.quantity : f.shares };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { withholding_rate: _, ...payload } = form;
    try {
      if (dividend) {
        await api.put(`/dividends/${dividend.id}/`, payload);
        toast.success(t("common.success"));
      } else {
        await api.post("/dividends/", payload);
        toast.success(t("common.success"));
      }
      queryClient.invalidateQueries({ queryKey: ["dividends"], refetchType: "active" });
      onOpenChange(false);
    } catch {
      toast.error(t("common.errorSaving"));
    } finally {
      setLoading(false);
    }
  };

  const assetList = Array.isArray(assets) ? assets : (assets as PaginatedResponse<Asset> | undefined)?.results ?? [];

  // Compute display label (Base UI Portal unmounts items when closed, losing label resolution)
  const selectedAssetLabel = (() => {
    if (!form.asset) return "";
    const asset = assetList.find((a) => a.id === form.asset);
    if (!asset) return "";
    return `${asset.name}${asset.ticker ? ` (${asset.ticker})` : ""}`;
  })();

  // Computed preview values
  const gross = parseFloat(form.gross) || 0;
  const shares = parseFloat(form.shares as string) || 0;
  const grossPerShare = shares > 0 ? (gross / shares).toFixed(4) : null;
  const withholdingPct = form.withholding_rate ? parseFloat(form.withholding_rate).toFixed(2) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dividend ? t("dividends.edit") : t("dividends.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Fecha */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("common.date")}</label>
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
          </div>

          {/* Activo */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("common.asset")}</label>
            <Select value={form.asset} onValueChange={(v) => v && handleAssetChange(v)}>
              <SelectTrigger className="w-full">
                <span className="flex flex-1 text-left truncate" data-slot="select-value">
                  {selectedAssetLabel || <span className="text-muted-foreground">{t("common.select")}</span>}
                </span>
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {assetList.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}{a.ticker ? ` (${a.ticker})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Numero de acciones */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("dividends.shares")}</label>
            <Input type="number" step="any" value={form.shares || ""} onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value || undefined }))} />
          </div>

          {/* Total recibido (neto) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Total recibido (neto)</label>
            <Input type="number" step="0.01" value={form.net} onChange={(e) => handleNetChange(e.target.value)} required />
          </div>

          {/* Impuestos retenidos */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Impuestos retenidos</label>
            <Input type="number" step="0.01" value={form.tax} onChange={(e) => handleTaxChange(e.target.value)} />
          </div>

          {/* Preview */}
          {gross > 0 && (
            <div className="text-sm text-muted-foreground">
              <p>Bruto: {formatMoney(String(gross))}{grossPerShare ? ` (${grossPerShare} EUR/accion)` : ""}</p>
              {withholdingPct && <p>Retencion: {withholdingPct}%</p>}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? `${t("common.loading")}...` : t("common.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
