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
import { Plus, Search, Pencil, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { Dividend, DividendFormData, Asset, PaginatedResponse, PortfolioData } from "@/types";

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

  const page = Number(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";
  const yearFilter = searchParams.get("year") || "";

  const { data, isLoading } = useQuery({
    queryKey: ["dividends", page, search, yearFilter],
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
      queryClient.invalidateQueries({ queryKey: ["dividends"] });
      toast.success(t("common.deleted"));
    },
  });

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    if (key !== "page") params.delete("page");
    router.push(`?${params}`);
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
          <Input placeholder={`${t("common.search")}...`} className="pl-9" defaultValue={search} onChange={(e) => setParam("search", e.target.value)} />
        </div>
        <Select value={yearFilter} onValueChange={(v) => setParam("year", v === "all" || !v ? "" : v)}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder={t("common.all")} /></SelectTrigger>
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
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> {t("common.new")}
        </Button>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {(data?.results ?? []).map((d) => (
          <div
            key={d.id}
            className="border rounded-lg p-3 space-y-1 cursor-pointer active:bg-muted/50"
            onClick={() => { setEditing(d); setDialogOpen(true); }}
          >
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
        ))}
        {!isLoading && (data?.results ?? []).length === 0 && (
          <p className="text-center text-muted-foreground py-8">{t("common.noData")}</p>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
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

      <DividendDialog open={dialogOpen} onOpenChange={setDialogOpen} dividend={editing} />
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

  const resetForm = () => {
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
  };

  // Auto-calculate: when gross or tax changes, compute net = gross - tax
  const handleGrossChange = (value: string) => {
    setForm((f) => {
      const gross = parseFloat(value) || 0;
      const tax = parseFloat(f.tax ?? "0") || 0;
      const net = (gross - tax).toFixed(2);
      const rate = gross > 0 ? ((tax / gross) * 100).toFixed(2) : undefined;
      return { ...f, gross: value, net, withholding_rate: rate };
    });
  };

  const handleTaxChange = (value: string) => {
    setForm((f) => {
      const gross = parseFloat(f.gross) || 0;
      const tax = parseFloat(value) || 0;
      const net = (gross - tax).toFixed(2);
      const rate = gross > 0 ? ((tax / gross) * 100).toFixed(2) : undefined;
      return { ...f, tax: value, net, withholding_rate: rate };
    });
  };

  const handleNetChange = (value: string) => {
    setForm((f) => {
      const gross = parseFloat(f.gross) || 0;
      const net = parseFloat(value) || 0;
      const tax = (gross - net).toFixed(2);
      const rate = gross > 0 ? (((gross - net) / gross) * 100).toFixed(2) : undefined;
      return { ...f, net: value, tax, withholding_rate: rate };
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
    try {
      if (dividend) {
        await api.put(`/dividends/${dividend.id}/`, form);
        toast.success(t("common.success"));
      } else {
        await api.post("/dividends/", form);
        toast.success(t("common.success"));
      }
      queryClient.invalidateQueries({ queryKey: ["dividends"] });
      onOpenChange(false);
    } catch {
      toast.error(t("common.errorSaving"));
    } finally {
      setLoading(false);
    }
  };

  const assetList = Array.isArray(assets) ? assets : (assets as PaginatedResponse<Asset> | undefined)?.results ?? [];

  // Per-share preview
  const perShare = form.shares && parseFloat(form.shares as string) > 0 && form.net
    ? (parseFloat(form.net) / parseFloat(form.shares as string)).toFixed(4)
    : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) resetForm(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dividend ? t("dividends.edit") : t("dividends.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("common.date")} *</label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("common.name")} *</label>
              <Select value={form.asset} onValueChange={(v) => v && handleAssetChange(v)}>
                <SelectTrigger><SelectValue placeholder={t("common.select")} /></SelectTrigger>
                <SelectContent>
                  {assetList.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("dividends.gross")} *</label>
              <Input type="number" step="0.01" value={form.gross} onChange={(e) => handleGrossChange(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("dividends.withholding")}</label>
              <Input type="number" step="0.01" value={form.tax} onChange={(e) => handleTaxChange(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("dividends.net")} *</label>
              <Input type="number" step="0.01" value={form.net} onChange={(e) => handleNetChange(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("dividends.withholdingRate")}</label>
              <Input type="number" step="0.01" value={form.withholding_rate || ""} onChange={(e) => setForm((f) => ({ ...f, withholding_rate: e.target.value || undefined }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("dividends.shares")}</label>
              <Input type="number" step="any" value={form.shares || ""} onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value || undefined }))} />
            </div>
          </div>
          {perShare && (
            <p className="text-xs text-muted-foreground text-right">
              {formatMoney(perShare)} / {t("dividends.shares").toLowerCase()}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={loading}>{loading ? `${t("common.loading")}...` : t("common.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
