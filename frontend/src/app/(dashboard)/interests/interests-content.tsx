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
import { DetailDrawer } from "@/components/app/detail-drawer";
import { Plus, Search, Pencil, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { Interest, InterestFormData, Account, PaginatedResponse } from "@/types";
import { useDebounce } from "@/hooks/use-debounce";

const PAGE_SIZE = 25;
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => String(currentYear - 5 + i));

// Shared calc helpers
function calcTIN(gross: number, balance: number, days: number): number | null {
  if (balance <= 0 || gross <= 0 || days <= 0) return null;
  return (gross / balance) * (365 / days) * 100;
}

function calcTAE(gross: number, balance: number, days: number): number | null {
  if (balance <= 0 || gross <= 0 || days <= 0) return null;
  return (Math.pow(1 + gross / balance, 365 / days) - 1) * 100;
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / 86400000);
}

export function InterestsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Interest | null>(null);
  const [detailItem, setDetailItem] = useState<Interest | null>(null);

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
    queryKey: ["interests", page, debouncedSearch, yearFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      if (search) p.set("search", search);
      if (yearFilter) p.set("year", yearFilter);
      return api.get<PaginatedResponse<Interest>>(`/interests/?${p}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/interests/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interests"], refetchType: "active" });
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
    queryClient.prefetchQuery({ queryKey: ["accounts"], queryFn: () => api.get<Account[]>("/accounts/") });
  };

  const handleExportCsv = () => {
    const p = new URLSearchParams();
    if (yearFilter) p.set("year", yearFilter);
    if (search) p.set("search", search);
    window.open(`/api/proxy/export/interests.csv?${p}`, "_blank");
  };

  const columns: Column<Interest>[] = [
    {
      key: "period",
      header: "Periodo",
      render: (i) => {
        const completed = new Date(i.date_end) <= new Date();
        return (
          <div className="text-sm">
            <span>{i.date_start}</span>
            <span className="text-muted-foreground mx-1">→</span>
            <span>{i.date_end}</span>
            <span className="text-xs text-muted-foreground ml-1">({i.days}d)</span>
            {completed
              ? <span className="ml-1.5 text-xs text-green-500">Completado</span>
              : <span className="ml-1.5 text-xs text-yellow-500">Activo</span>
            }
          </div>
        );
      },
    },
    { key: "account", header: t("common.account"), render: (i) => <span className="text-sm font-medium">{i.account_name}</span> },
    { key: "gross", header: t("interests.gross"), className: "text-right", render: (i) => <MoneyCell value={i.gross} /> },
    { key: "net", header: t("interests.net"), className: "text-right", render: (i) => <MoneyCell value={i.net} colored /> },
    { key: "balance", header: t("interests.balance"), className: "text-right", render: (i) => <MoneyCell value={i.balance} /> },
    {
      key: "tin",
      header: "TIN",
      className: "text-right",
      render: (i) => {
        const tin = calcTIN(parseFloat(i.gross), parseFloat(i.balance ?? "0"), i.days);
        return <span className="font-mono text-sm tabular-nums">{tin !== null ? `${tin.toFixed(2)}%` : "—"}</span>;
      },
    },
    {
      key: "tae",
      header: "TAE",
      className: "text-right",
      render: (i) => {
        const tae = calcTAE(parseFloat(i.gross), parseFloat(i.balance ?? "0"), i.days);
        return <span className="font-mono text-sm tabular-nums">{tae !== null ? `${tae.toFixed(2)}%` : "—"}</span>;
      },
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (i) => (
        <div className="flex gap-1 justify-end">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(i); setDialogOpen(true); }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); if (confirm("Eliminar?")) deleteMutation.mutate(i.id); }}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t("interests.title")}</h1>

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
        {(data?.results ?? []).map((i) => {
          const gross = parseFloat(i.gross) || 0;
          const balance = parseFloat(i.balance ?? "0") || 0;
          const tin = calcTIN(gross, balance, i.days);
          const tae = calcTAE(gross, balance, i.days);
          const completed = new Date(i.date_end) <= new Date();
          return (
            <SwipeCard
              key={i.id}
              onTap={() => setDetailItem(i)}
              onEdit={() => { setEditing(i); setDialogOpen(true); }}
              onDelete={() => { if (confirm("Eliminar?")) deleteMutation.mutate(i.id); }}
              accentColor="border-l-emerald-500"
            >
              <div className="space-y-1">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium">{i.account_name}</p>
                    {completed
                      ? <span className="text-xs text-green-500">Completado</span>
                      : <span className="text-xs text-yellow-500">Activo</span>
                    }
                  </div>
                  <span className="text-xs text-muted-foreground">{i.date_start} → {i.date_end} ({i.days}d)</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("interests.gross")}</span>
                  <span className="font-mono tabular-nums">{formatMoney(i.gross)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span>{t("interests.net")}</span>
                  <span className={`font-mono tabular-nums ${parseFloat(i.net) >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {formatMoney(i.net)}
                  </span>
                </div>
                {i.balance && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("interests.balance")}</span>
                    <span className="font-mono tabular-nums">{formatMoney(i.balance)}</span>
                  </div>
                )}
                {tin !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">TIN</span>
                    <span className="font-mono tabular-nums">{tin.toFixed(2)}%</span>
                  </div>
                )}
                {tae !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">TAE</span>
                    <span className="font-mono tabular-nums">{tae.toFixed(2)}%</span>
                  </div>
                )}
              </div>
            </SwipeCard>
          );
        })}
        {!isLoading && (data?.results ?? []).length === 0 && (
          <p className="text-center text-muted-foreground py-8">{t("common.noData")}</p>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block">
        <DataTable
          columns={columns}
          data={data?.results ?? []}
          keyFn={(i) => i.id}
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

      <InterestDialog open={dialogOpen} onOpenChange={setDialogOpen} interest={editing} />

      {(() => {
        const di = detailItem;
        if (!di) return null;
        const gross = parseFloat(di.gross) || 0;
        const balance = parseFloat(di.balance ?? "0") || 0;
        const tin = calcTIN(gross, balance, di.days);
        const tae = calcTAE(gross, balance, di.days);
        const completed = new Date(di.date_end) <= new Date();
        return (
          <DetailDrawer
            open
            onOpenChange={(v) => { if (!v) setDetailItem(null); }}
            title={di.account_name ?? ""}
            subtitle={`${di.date_start} → ${di.date_end} (${di.days}d) · ${completed ? t("interests.completed") : t("interests.active")}`}
            rows={[
              { label: t("interests.gross"), value: formatMoney(di.gross) },
              { label: t("interests.net"), value: <span className={parseFloat(di.net) >= 0 ? "text-green-500" : "text-red-500"}>{formatMoney(di.net)}</span> },
              ...(di.balance ? [{ label: t("interests.balance"), value: formatMoney(di.balance) }] : []),
              ...(tin !== null ? [{ label: "TIN", value: `${tin.toFixed(2)}%` }] : []),
              ...(tae !== null ? [{ label: "TAE", value: `${tae.toFixed(2)}%` }] : []),
            ]}
          />
        );
      })()}
    </div>
  );
}

function InterestDialog({
  open,
  onOpenChange,
  interest,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  interest: Interest | null;
}) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState<InterestFormData>({
    date_start: today,
    date_end: today,
    account: "",
    gross: "",
    net: "",
  });
  const [loading, setLoading] = useState(false);

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<Account[]>("/accounts/"),
    enabled: open,
  });

  // Reset form every time the dialog opens
  useEffect(() => {
    if (!open) return;
    if (interest) {
      setForm({
        date_start: interest.date_start,
        date_end: interest.date_end,
        account: interest.account,
        gross: interest.gross,
        net: interest.net,
        balance: interest.balance || undefined,
      });
    } else {
      setForm({ date_start: today, date_end: today, account: "", gross: "", net: "" });
    }
  }, [open, interest, today]);

  // Spain withholding tax rate (19%) — TODO: move to user settings
  const TAX_RATE = 0.19;

  const handleGrossChange = (value: string) => {
    setForm((f) => {
      const gross = parseFloat(value) || 0;
      const net = (gross * (1 - TAX_RATE)).toFixed(2);
      return { ...f, gross: value, net };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (interest) {
        await api.put(`/interests/${interest.id}/`, form);
        toast.success(t("common.success"));
      } else {
        await api.post("/interests/", form);
        toast.success(t("common.success"));
      }
      queryClient.invalidateQueries({ queryKey: ["interests"], refetchType: "active" });
      onOpenChange(false);
    } catch {
      toast.error(t("common.errorSaving"));
    } finally {
      setLoading(false);
    }
  };

  const accountList = Array.isArray(accounts) ? accounts : (accounts as PaginatedResponse<Account> | undefined)?.results ?? [];

  // Compute display label (Base UI Portal unmounts items when closed, losing label resolution)
  const selectedAccountLabel = (() => {
    if (!form.account) return "";
    const account = accountList.find((a) => a.id === form.account);
    return account?.name ?? "";
  })();

  // Computed preview values
  const gross = parseFloat(form.gross) || 0;
  const net = parseFloat(form.net) || 0;
  const balance = parseFloat(form.balance ?? "0") || 0;
  const days = daysBetween(form.date_start, form.date_end);
  const previewTIN = calcTIN(gross, balance, days);
  const previewTAE = calcTAE(gross, balance, days);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{interest ? t("interests.edit") : t("interests.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Fecha Inicio / Fin */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Fecha inicio</label>
              <Input type="date" value={form.date_start} onChange={(e) => setForm((f) => ({ ...f, date_start: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Fecha fin</label>
              <Input type="date" value={form.date_end} onChange={(e) => setForm((f) => ({ ...f, date_end: e.target.value }))} required />
            </div>
          </div>

          {/* Cuenta */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("common.account")}</label>
            <Select value={form.account} onValueChange={(v) => setForm((f) => ({ ...f, account: v || "" }))}>
              <SelectTrigger className="w-full">
                <span className="flex flex-1 text-left truncate" data-slot="select-value">
                  {selectedAccountLabel || <span className="text-muted-foreground">{t("common.select")}</span>}
                </span>
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {accountList.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bruto */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("interests.gross")}</label>
            <Input type="number" step="0.01" value={form.gross} onChange={(e) => handleGrossChange(e.target.value)} required />
          </div>

          {/* Balance */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("interests.balance")}</label>
            <Input type="number" step="0.01" value={form.balance || ""} onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value || undefined }))} />
          </div>

          {/* Preview */}
          {gross > 0 && (
            <div className="text-sm text-muted-foreground">
              <p>Neto: {formatMoney(String(net))} ({(TAX_RATE * 100).toFixed(0)}% retención)</p>
              {days > 0 && <p>Días: {days}</p>}
              {previewTIN !== null && <p>TIN: {previewTIN.toFixed(2)}%</p>}
              {previewTAE !== null && <p>TAE: {previewTAE.toFixed(2)}%</p>}
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
