"use client";

import { useState } from "react";
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
import type { Interest, InterestFormData, Account, PaginatedResponse } from "@/types";

const PAGE_SIZE = 25;
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => String(currentYear - 5 + i));

export function InterestsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Interest | null>(null);

  const page = Number(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";
  const yearFilter = searchParams.get("year") || "";

  const { data, isLoading } = useQuery({
    queryKey: ["interests", page, search, yearFilter],
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
      queryClient.invalidateQueries({ queryKey: ["interests"] });
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
    window.open(`/api/proxy/export/interests.csv?${p}`, "_blank");
  };

  const columns: Column<Interest>[] = [
    { key: "date", header: t("common.date"), render: (i) => <span className="text-sm">{i.date}</span> },
    { key: "account", header: t("common.account"), render: (i) => <span className="text-sm font-medium">{i.account_name}</span> },
    { key: "gross", header: t("interests.gross"), className: "text-right", render: (i) => <MoneyCell value={i.gross} /> },
    { key: "net", header: t("interests.net"), className: "text-right", render: (i) => <MoneyCell value={i.net} colored /> },
    { key: "balance", header: t("interests.balance"), className: "text-right", render: (i) => <MoneyCell value={i.balance} /> },
    {
      key: "rate",
      header: t("interests.annualRate"),
      className: "text-right",
      render: (i) => (
        <span className="font-mono text-sm tabular-nums">
          {i.annual_rate ? `${parseFloat(i.annual_rate).toFixed(2)}%` : "—"}
        </span>
      ),
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
        {(data?.results ?? []).map((i) => (
          <div
            key={i.id}
            className="border rounded-lg p-3 space-y-1 cursor-pointer active:bg-muted/50"
            onClick={() => { setEditing(i); setDialogOpen(true); }}
          >
            <div className="flex justify-between items-start">
              <p className="text-sm font-medium">{i.account_name}</p>
              <span className="text-xs text-muted-foreground">{i.date}</span>
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
            {i.annual_rate && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("interests.annualRate")}</span>
                <span className="font-mono tabular-nums">{parseFloat(i.annual_rate).toFixed(2)}%</span>
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
          keyFn={(i) => i.id}
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.count}
          onPageChange={(p) => setParam("page", String(p))}
          emptyMessage={isLoading ? `${t("common.loading")}...` : t("common.noData")}
        />
      </div>

      <InterestDialog open={dialogOpen} onOpenChange={setDialogOpen} interest={editing} />
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
  const [form, setForm] = useState<InterestFormData>({
    date: new Date().toISOString().split("T")[0],
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

  const resetForm = () => {
    if (interest) {
      setForm({
        date: interest.date,
        account: interest.account,
        gross: interest.gross,
        net: interest.net,
        balance: interest.balance || undefined,
        annual_rate: interest.annual_rate || undefined,
      });
    } else {
      setForm({ date: new Date().toISOString().split("T")[0], account: "", gross: "", net: "" });
    }
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
      queryClient.invalidateQueries({ queryKey: ["interests"] });
      onOpenChange(false);
    } catch {
      toast.error(t("common.errorSaving"));
    } finally {
      setLoading(false);
    }
  };

  const accountList = Array.isArray(accounts) ? accounts : [];

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) resetForm(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{interest ? t("interests.edit") : t("interests.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("common.date")} *</label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("common.account")} *</label>
              <Select value={form.account} onValueChange={(v) => setForm((f) => ({ ...f, account: v || "" }))}>
                <SelectTrigger><SelectValue placeholder={t("common.select")} /></SelectTrigger>
                <SelectContent>
                  {accountList.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("interests.gross")} *</label>
              <Input type="number" step="0.01" value={form.gross} onChange={(e) => setForm((f) => ({ ...f, gross: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("interests.net")} *</label>
              <Input type="number" step="0.01" value={form.net} onChange={(e) => setForm((f) => ({ ...f, net: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("interests.balance")}</label>
              <Input type="number" step="0.01" value={form.balance || ""} onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value || undefined }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("interests.annualRate")} (%)</label>
              <Input type="number" step="0.01" value={form.annual_rate || ""} onChange={(e) => setForm((f) => ({ ...f, annual_rate: e.target.value || undefined }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={loading}>{loading ? `${t("common.loading")}...` : t("common.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
