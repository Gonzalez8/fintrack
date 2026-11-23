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
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { DataTable, type Column } from "@/components/app/data-table";
import { MoneyCell } from "@/components/app/money-cell";
import { SwipeCard } from "@/components/app/swipe-card";
import { DetailDrawer } from "@/components/app/detail-drawer";
import { AssetCombobox } from "@/components/app/asset-combobox";
import { Plus, Search, Pencil, Trash2, Download, RefreshCw, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, formatQty } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { Dividend, DividendFormData, DividendSuggestion, Asset, PaginatedResponse, PortfolioData } from "@/types";
import { DIVIDEND_SUGGESTIONS_KEY, PendingDividendsBanner, UpcomingDividendsCard, formatDraftAmount } from "@/components/app/pending-dividends-banner";
import { formatSplitDate } from "@/lib/splits";
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
  const [reviewing, setReviewing] = useState<DividendSuggestion | null>(null);
  const [detailItem, setDetailItem] = useState<Dividend | null>(null);

  const openDialog = (dividend: Dividend | null, suggestion: DividendSuggestion | null = null) => {
    setEditing(dividend);
    setReviewing(suggestion);
    setDialogOpen(true);
  };

  // Drafts from Yahoo: shared with the banner; "?review=<id>" (dashboard link) opens one
  const { data: suggestions } = useQuery({
    queryKey: DIVIDEND_SUGGESTIONS_KEY,
    queryFn: () =>
      api.get<PaginatedResponse<DividendSuggestion>>("/dividend-suggestions/?status=PENDING&page_size=1000"),
  });
  const reviewId = searchParams.get("review");
  useEffect(() => {
    const target = reviewId && suggestions?.results.find((s) => s.id === reviewId);
    if (target) {
      openDialog(null, target);
      router.replace("/dividends");
    }
  }, [reviewId, suggestions]); // eslint-disable-line react-hooks/exhaustive-deps

  const detectMut = useMutation({
    mutationFn: () => api.post<{ created: DividendSuggestion[] }>("/dividend-suggestions/detect/"),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["dividend-suggestions"] });
      if (res.created.length > 0) toast.success(t("dividendDrafts.detectFound", { count: res.created.length }));
      else toast(t("dividendDrafts.detectNone"));
    },
    onError: () => toast.error(t("dividendDrafts.detectError")),
  });

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
    // Key on the URL "search" param the request uses, not the debounced input:
    // otherwise the query runs with the stale URL value and caches it as the new
    // text's result, so a search only applied after typing another key.
    queryKey: ["dividends", page, search, yearFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("page_size", String(PAGE_SIZE));
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
    {
      key: "domestic_tax",
      header: t("dividends.domesticWithholding"),
      className: "text-right",
      render: (d) => <MoneyCell value={d.domestic_tax ?? "0"} />,
    },
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
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openDialog(d); }}>
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
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => detectMut.mutate()}
            disabled={detectMut.isPending}
            title={t("dividendDrafts.detect")}
            aria-label={t("dividendDrafts.detect")}
          >
            <RefreshCw className={`h-4 w-4 ${detectMut.isPending ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="icon" onClick={handleExportCsv} title="CSV">
            <Download className="h-4 w-4" />
          </Button>
        </div>
        <Button className="hidden sm:flex" onClick={() => { openDialog(null); }} onMouseEnter={prefetchDialogData}>
          <Plus className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">{t("common.new")}</span>
        </Button>
      </div>

      <PendingDividendsBanner onReview={(s) => openDialog(null, s)} />

      <UpcomingDividendsCard />

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {(data?.results ?? []).map((d) => (
          <SwipeCard
            key={d.id}
            onTap={() => setDetailItem(d)}
            onEdit={() => { openDialog(d); }}
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
              {parseFloat(d.domestic_tax ?? "0") > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("dividends.domesticWithholding")}</span>
                  <span className="font-mono tabular-nums">{formatMoney(d.domestic_tax)}</span>
                </div>
              )}
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
        onClick={() => { openDialog(null); }}
        aria-label={t("common.new")}
      >
        <Plus className="h-6 w-6" />
      </button>

      <DividendDialog open={dialogOpen} onOpenChange={setDialogOpen} dividend={editing} suggestion={reviewing} />

      <DetailDrawer
        open={!!detailItem}
        onOpenChange={(v) => { if (!v) setDetailItem(null); }}
        title={detailItem?.asset_name ?? ""}
        subtitle={detailItem ? `${detailItem.asset_ticker ?? ""} · ${detailItem.date}` : undefined}
        rows={detailItem ? [
          { label: t("dividends.gross"), value: formatMoney(detailItem.gross) },
          { label: t("dividends.withholding"), value: formatMoney(detailItem.tax) },
          ...(parseFloat(detailItem.domestic_tax ?? "0") > 0
            ? [{ label: t("dividends.domesticWithholding"), value: formatMoney(detailItem.domestic_tax) }]
            : []),
          ...(parseFloat(detailItem.commission ?? "0") > 0
            ? [{ label: t("dividends.commission"), value: formatMoney(detailItem.commission) }]
            : []),
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
  suggestion = null,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dividend: Dividend | null;
  /** Yahoo draft to review: pre-fills the form and saving accepts it. */
  suggestion?: DividendSuggestion | null;
}) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form, setForm] = useState<DividendFormData>({
    date: new Date().toISOString().split("T")[0],
    asset: "",
    gross: "",
    tax: "0",
    domestic_tax: "0",
    commission: "0",
    net: "",
  });
  const [loading, setLoading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
        domestic_tax: dividend.domestic_tax || "0",
        commission: dividend.commission || "0",
        net: dividend.net,
        withholding_rate: dividend.withholding_rate || undefined,
      });
      setAdvancedOpen(parseFloat(dividend.commission || "0") > 0);
    } else if (suggestion) {
      const gross = parseFloat(suggestion.gross) || 0;
      const tax = parseFloat(suggestion.tax ?? "0") || 0;
      const domestic = parseFloat(suggestion.domestic_tax ?? "0") || 0;
      setForm({
        // Yahoo only knows the ex-date: the user replaces it with the payment date
        date: suggestion.pay_date ?? suggestion.ex_date,
        asset: suggestion.asset,
        shares: String(Number(suggestion.shares)),
        gross: gross.toFixed(2),
        tax: tax.toFixed(2),
        domestic_tax: domestic.toFixed(2),
        commission: "0",
        net: (gross - tax - domestic).toFixed(2),
        withholding_rate: gross > 0 ? ((tax / gross) * 100).toFixed(2) : undefined,
      });
      setAdvancedOpen(false);
    } else {
      setForm({
        date: new Date().toISOString().split("T")[0],
        asset: "",
        gross: "",
        tax: "0",
        domestic_tax: "0",
        commission: "0",
        net: "",
      });
      setAdvancedOpen(false);
    }
  }, [open, dividend, suggestion]);

  // Auto-calculate: gross = net + tax + domestic_tax + commission, rate = tax / gross (at source)
  const recalcGross = (f: DividendFormData): DividendFormData => {
    const num = (v?: string) => parseFloat(v ?? "0") || 0;
    const tax = num(f.tax);
    const gross = num(f.net) + tax + num(f.domestic_tax) + num(f.commission);
    const withholding_rate = gross > 0 ? ((tax / gross) * 100).toFixed(2) : undefined;
    return { ...f, gross: gross.toFixed(2), withholding_rate };
  };

  const handleNetChange = (value: string) => setForm((f) => recalcGross({ ...f, net: value }));
  const handleTaxChange = (value: string) => setForm((f) => recalcGross({ ...f, tax: value }));
  const handleDomesticTaxChange = (value: string) =>
    setForm((f) => recalcGross({ ...f, domestic_tax: value || "0" }));
  const handleCommissionChange = (value: string) =>
    setForm((f) => recalcGross({ ...f, commission: value || "0" }));

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
    const { withholding_rate: _withholdingRate, ...payload } = form;
    try {
      if (dividend) {
        await api.put(`/dividends/${dividend.id}/`, payload);
        toast.success(t("common.success"));
      } else if (suggestion) {
        await api.post(`/dividend-suggestions/${suggestion.id}/accept/`, payload);
        queryClient.invalidateQueries({ queryKey: ["dividend-suggestions"] });
        toast.success(t("dividendDrafts.accepted"));
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

  // Computed preview values
  const gross = parseFloat(form.gross) || 0;
  const shares = parseFloat(form.shares as string) || 0;
  const grossPerShare = shares > 0 ? (gross / shares).toFixed(4) : null;
  const withholdingPct = form.withholding_rate ? parseFloat(form.withholding_rate).toFixed(2) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {dividend ? t("dividends.edit") : suggestion ? t("dividendDrafts.reviewTitle") : t("dividends.new")}
          </DialogTitle>
        </DialogHeader>
        {suggestion && (
          <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
            <HandCoins className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <div className="space-y-1">
              <p>
                {t("dividendDrafts.fromYahoo", {
                  date: formatSplitDate(suggestion.ex_date),
                  shares: formatQty(suggestion.shares),
                  amount: formatDraftAmount(suggestion.amount_per_share, suggestion.currency, true),
                  gross: formatDraftAmount(suggestion.gross, suggestion.currency),
                })}
              </p>
              <p className="text-muted-foreground">
                {suggestion.tax == null ? t("dividendDrafts.checkNoTax") : t("dividendDrafts.checkWithTax")}
              </p>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Fecha */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("common.date")}</label>
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
          </div>

          {/* Activo */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("common.asset")}</label>
            <AssetCombobox
              options={assetList.map((a) => ({ id: a.id, name: a.name, ticker: a.ticker }))}
              value={form.asset}
              onChange={handleAssetChange}
              placeholder={t("transactions.searchAsset")}
              emptyText={t("transactions.noAssetMatch")}
            />
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

          {/* Impuestos retenidos en origen */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("dividends.originWithholding")}</label>
            <Input type="number" step="0.01" value={form.tax} onChange={(e) => handleTaxChange(e.target.value)} />
          </div>

          {/* Retención en destino (país de residencia) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("dividends.domesticWithholding")}</label>
            <Input
              type="number"
              step="0.01"
              value={form.domestic_tax ?? "0"}
              onChange={(e) => handleDomesticTaxChange(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground leading-tight">{t("dividends.domesticWithholdingHelp")}</p>
          </div>

          {/* Advanced fields: commission */}
          <div className="space-y-2">
            <button
              type="button"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              {advancedOpen ? "▾" : "▸"} {t("dividends.advancedFields")}
            </button>
            {advancedOpen && (
              <div className="space-y-1.5 rounded-md border border-dashed border-border/60 p-3">
                <label className="text-sm font-medium">{t("dividends.commission")}</label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.commission ?? "0"}
                  onChange={(e) => handleCommissionChange(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {t("dividends.commissionHelp")}
                </p>
              </div>
            )}
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
