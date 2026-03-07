"use client";

import { useState } from "react";
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
import { Plus, Search, Pencil, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { Asset, AssetFormData, PaginatedResponse } from "@/types";
import { ASSET_TYPE_LABELS } from "@/lib/constants";
import { useTranslations } from "@/i18n/use-translations";

const PAGE_SIZE = 25;

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

  const { data, isLoading } = useQuery({
    queryKey: ["assets", page, search, typeFilter],
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
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("common.deleted"));
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
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
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
      render: (a) => <Badge variant="secondary">{ASSET_TYPE_LABELS[a.type] || a.type}</Badge>,
    },
    { key: "currency", header: t("common.currency"), render: (a) => <span className="text-sm">{a.currency}</span> },
    { key: "price", header: t("transactions.price"), className: "text-right", render: (a) => <MoneyCell value={a.current_price} currency={a.currency} /> },
    {
      key: "mode",
      header: t("assets.priceMode"),
      render: (a) => (
        <Badge variant={a.price_mode === "AUTO" ? "default" : "secondary"}>
          {a.price_mode}
        </Badge>
      ),
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">{t("assets.title")}</h1>
        <Button variant="outline" size="sm" onClick={handleUpdatePrices} disabled={updating}>
          <RefreshCw className={`h-4 w-4 mr-2 ${updating ? "animate-spin" : ""}`} />
          <span>{updating ? t("portfolio.updating") : t("portfolio.updatePrices")}</span>
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`${t("common.search")}...`}
            className="pl-9"
            defaultValue={search}
            onChange={(e) => setParam("search", e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setParam("type", v === "ALL" ? "" : v || "")}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={t("common.type")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("common.all")}</SelectItem>
            {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> {t("common.new")}
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.results ?? []}
        keyFn={(a) => a.id}
        onRowClick={(a) => router.push(`/assets/${a.id}`)}
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.count}
        onPageChange={(p) => setParam("page", String(p))}
        emptyMessage={isLoading ? `${t("common.loading")}...` : t("common.noData")}
      />

      <AssetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        asset={editing}
      />
    </div>
  );
}

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

  // Sync form when asset changes
  const resetForm = () => {
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
  };

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
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      onOpenChange(false);
    } catch {
      toast.error(t("common.errorSaving"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) resetForm(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{asset ? t("assets.edit") : t("assets.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
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
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as AssetFormData["type"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Select value={form.price_mode} onValueChange={(v) => setForm((f) => ({ ...f, price_mode: v as "MANUAL" | "AUTO" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? `${t("common.loading")}...` : t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
