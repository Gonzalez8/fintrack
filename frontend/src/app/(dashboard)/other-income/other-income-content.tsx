"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Search, Pencil, Trash2, Repeat } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type {
  Account, OtherIncome, OtherIncomeCategory, OtherIncomeFormData, PaginatedResponse,
} from "@/types";
import { useDebounce } from "@/hooks/use-debounce";

// Personal side income is a handful of rows a year: load them all and summarise client-side
const MAX_ROWS = 1000;
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => String(currentYear - 5 + i));
const CATEGORIES: OtherIncomeCategory[] = ["RENTAL", "SELF_EMPLOYMENT", "SIDE_JOB", "GIFT", "OTHER"];

const CATEGORY_ACCENT: Record<OtherIncomeCategory, string> = {
  RENTAL: "border-l-teal-500",
  SELF_EMPLOYMENT: "border-l-indigo-500",
  SIDE_JOB: "border-l-sky-500",
  GIFT: "border-l-pink-500",
  OTHER: "border-l-slate-500",
};

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function emptyForm(): OtherIncomeFormData {
  return {
    date: todayIso(),
    category: "RENTAL",
    description: "",
    amount: "",
    account: null,
    declared: false,
    notes: "",
  };
}

export function OtherIncomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OtherIncome | null>(null);
  const [template, setTemplate] = useState<OtherIncome | null>(null);
  const [detailItem, setDetailItem] = useState<OtherIncome | null>(null);

  const search = searchParams.get("search") || "";
  const yearFilter = searchParams.get("year") ?? String(currentYear);
  const categoryFilter = searchParams.get("category") || "";

  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebounce(searchInput, 300);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    if (!value && key !== "year") params.delete(key);
    router.push(`?${params}`);
  };

  useEffect(() => {
    if (debouncedSearch !== search) setParam("search", debouncedSearch);
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading } = useQuery({
    queryKey: ["other-incomes", search, yearFilter, categoryFilter],
    queryFn: () => {
      const p = new URLSearchParams({ page_size: String(MAX_ROWS) });
      if (search) p.set("search", search);
      if (yearFilter) p.set("year", yearFilter);
      if (categoryFilter) p.set("category", categoryFilter);
      return api.get<PaginatedResponse<OtherIncome>>(`/other-incomes/?${p}`);
    },
  });
  const rows = useMemo(() => data?.results ?? [], [data]);

  // Newest income overall, for "repeat last" (independent of the filters)
  const { data: latest } = useQuery({
    queryKey: ["other-incomes", "latest"],
    queryFn: () => api.get<PaginatedResponse<OtherIncome>>("/other-incomes/?page_size=1"),
  });
  const lastIncome = latest?.results?.[0] ?? null;

  const summary = useMemo(() => {
    const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
    const undeclared = rows.filter((r) => !r.declared).reduce((s, r) => s + parseFloat(r.amount), 0);
    const months = new Set(rows.map((r) => r.date.slice(0, 7))).size;
    return { total, undeclared, monthlyAvg: months ? total / months : 0 };
  }, [rows]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/other-incomes/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["other-incomes"], refetchType: "active" });
      toast.success(t("common.deleted"));
    },
    onError: () => toast.error(t("common.errorDeleting")),
  });

  const confirmDelete = (id: string) => {
    if (confirm(t("otherIncome.confirmDelete"))) deleteMutation.mutate(id);
  };
  const openNew = (from: OtherIncome | null = null) => {
    setEditing(null);
    setTemplate(from);
    setDialogOpen(true);
  };
  const openEdit = (income: OtherIncome) => {
    setTemplate(null);
    setEditing(income);
    setDialogOpen(true);
  };

  const categoryLabel = (c: OtherIncomeCategory) => t(`otherIncome.category.${c}`);
  const declaredLabel = (r: OtherIncome) => (r.declared ? t("otherIncome.declaredShort") : t("otherIncome.notDeclared"));

  const columns: Column<OtherIncome>[] = [
    { key: "date", header: t("common.date"), render: (r) => <span className="text-sm">{r.date}</span> },
    { key: "category", header: t("otherIncome.category"), render: (r) => <span className="text-sm">{categoryLabel(r.category)}</span> },
    {
      key: "description",
      header: t("otherIncome.description"),
      render: (r) => (
        <div className="text-sm">
          <p className="font-medium">{r.description}</p>
          {r.notes && <p className="text-xs text-muted-foreground truncate max-w-[260px]">{r.notes}</p>}
        </div>
      ),
    },
    { key: "account", header: t("common.account"), render: (r) => <span className="text-sm">{r.account_name ?? "—"}</span> },
    {
      key: "declared",
      header: t("otherIncome.declared"),
      render: (r) => (
        <span className={`text-xs ${r.declared ? "text-green-500" : "text-amber-500"}`}>{declaredLabel(r)}</span>
      ),
    },
    { key: "amount", header: t("otherIncome.amount"), className: "text-right", render: (r) => <MoneyCell value={r.amount} /> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) => (
        <div className="flex gap-1 justify-end">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(r); }} aria-label={t("common.edit")}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); confirmDelete(r.id); }} aria-label={t("common.delete")}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{t("otherIncome.title")}</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">{t("otherIncome.subtitle")}</p>
        </div>
        <div className="hidden sm:flex gap-2 shrink-0">
          {lastIncome && (
            <Button variant="outline" onClick={() => openNew(lastIncome)} title={t("otherIncome.repeatLastHelp")}>
              <Repeat className="h-4 w-4 mr-1" /> {t("otherIncome.repeatLast")}
            </Button>
          )}
          <Button onClick={() => openNew()}>
            <Plus className="h-4 w-4 mr-1" /> {t("common.new")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={`${t("common.search")}...`} className="pl-9" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <Select value={yearFilter || "all"} onValueChange={(v) => setParam("year", v === "all" || !v ? "" : v)}>
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
        <Select value={categoryFilter || "all"} onValueChange={(v) => setParam("category", v === "all" || !v ? "" : v)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <span data-slot="select-value">
              {categoryFilter ? categoryLabel(categoryFilter as OtherIncomeCategory) : t("otherIncome.allCategories")}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("otherIncome.allCategories")}</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: t("otherIncome.totalPeriod"), value: summary.total },
          { label: t("otherIncome.monthlyAvg"), value: summary.monthlyAvg },
          { label: t("otherIncome.undeclaredTotal"), value: summary.undeclared },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="flex items-center justify-between sm:block py-3 sm:py-4">
              <p className="text-sm sm:text-xs text-muted-foreground">{card.label}</p>
              <p className="font-mono text-base sm:text-xl font-semibold tabular-nums">{formatMoney(card.value.toFixed(2))}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {lastIncome && (
          <Button variant="outline" className="w-full" onClick={() => openNew(lastIncome)}>
            <Repeat className="h-4 w-4 mr-1" /> {t("otherIncome.repeatLast")}
          </Button>
        )}
        {rows.map((r) => (
          <SwipeCard
            key={r.id}
            onTap={() => setDetailItem(r)}
            onEdit={() => openEdit(r)}
            onDelete={() => confirmDelete(r.id)}
            accentColor={CATEGORY_ACCENT[r.category]}
          >
            <div className="space-y-1">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {categoryLabel(r.category)} · <span className={r.declared ? "text-green-500" : "text-amber-500"}>{declaredLabel(r)}</span>
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{r.date}</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span className="text-muted-foreground">{r.account_name ?? t("otherIncome.noAccount")}</span>
                <span className="font-mono tabular-nums">{formatMoney(r.amount)}</span>
              </div>
            </div>
          </SwipeCard>
        ))}
        {!isLoading && rows.length === 0 && (
          <p className="text-center text-muted-foreground py-8">{t("common.noData")}</p>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block">
        <DataTable
          columns={columns}
          data={rows}
          keyFn={(r) => r.id}
          emptyMessage={isLoading ? `${t("common.loading")}...` : t("common.noData")}
        />
      </div>

      {/* FAB mobile */}
      <button
        className="fixed bottom-24 right-5 z-40 sm:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
        onClick={() => openNew()}
        aria-label={t("common.new")}
      >
        <Plus className="h-6 w-6" />
      </button>

      <OtherIncomeDialog open={dialogOpen} onOpenChange={setDialogOpen} income={editing} template={template} />

      {detailItem && (
        <DetailDrawer
          open
          onOpenChange={(v) => { if (!v) setDetailItem(null); }}
          title={detailItem.description}
          subtitle={`${detailItem.date} · ${categoryLabel(detailItem.category)}`}
          rows={[
            { label: t("otherIncome.amount"), value: formatMoney(detailItem.amount) },
            { label: t("otherIncome.account"), value: detailItem.account_name ?? t("otherIncome.noAccount") },
            { label: t("otherIncome.declared"), value: declaredLabel(detailItem) },
            ...(detailItem.notes ? [{ label: t("otherIncome.notes"), value: detailItem.notes }] : []),
          ]}
        />
      )}
    </div>
  );
}

function OtherIncomeDialog({
  open,
  onOpenChange,
  income,
  template,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  income: OtherIncome | null;
  /** Prefills a new income from an existing one ("repeat last") */
  template: OtherIncome | null;
}) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form, setForm] = useState<OtherIncomeFormData>(emptyForm);
  const [loading, setLoading] = useState(false);

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<Account[]>("/accounts/"),
    enabled: open,
  });
  const accountList = Array.isArray(accounts) ? accounts : (accounts as PaginatedResponse<Account> | undefined)?.results ?? [];

  useEffect(() => {
    if (!open) return;
    const source = income ?? template;
    if (!source) {
      setForm(emptyForm());
      return;
    }
    setForm({
      date: income ? income.date : todayIso(),
      category: source.category,
      description: source.description,
      amount: income ? income.amount : "",
      account: source.account,
      declared: source.declared,
      notes: income ? income.notes : "",
    });
  }, [open, income, template]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (income) {
        await api.put(`/other-incomes/${income.id}/`, form);
      } else {
        await api.post("/other-incomes/", form);
      }
      toast.success(t("common.success"));
      queryClient.invalidateQueries({ queryKey: ["other-incomes"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["monthly-savings"] });
      queryClient.invalidateQueries({ queryKey: ["annual-savings"] });
      onOpenChange(false);
    } catch {
      toast.error(t("common.errorSaving"));
    } finally {
      setLoading(false);
    }
  };

  const selectedAccountLabel = form.account
    ? accountList.find((a) => a.id === form.account)?.name ?? ""
    : t("otherIncome.noAccount");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{income ? t("otherIncome.edit") : t("otherIncome.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("common.date")}</label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("otherIncome.amount")}</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                autoFocus={!!template}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("otherIncome.category")}</label>
            <Select value={form.category} onValueChange={(v) => v && setForm((f) => ({ ...f, category: v as OtherIncomeCategory }))}>
              <SelectTrigger className="w-full">
                <span className="flex flex-1 text-left truncate" data-slot="select-value">{t(`otherIncome.category.${form.category}`)}</span>
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{t(`otherIncome.category.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("otherIncome.description")}</label>
            <Input
              value={form.description}
              placeholder={t("otherIncome.descriptionPlaceholder")}
              maxLength={200}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("otherIncome.account")}</label>
            <Select value={form.account ?? "none"} onValueChange={(v) => setForm((f) => ({ ...f, account: !v || v === "none" ? null : v }))}>
              <SelectTrigger className="w-full">
                <span className="flex flex-1 text-left truncate" data-slot="select-value">{selectedAccountLabel}</span>
              </SelectTrigger>
              <SelectContent className="z-[200]">
                <SelectItem value="none">{t("otherIncome.noAccount")}</SelectItem>
                {accountList.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={form.declared}
                onChange={(e) => setForm((f) => ({ ...f, declared: e.target.checked }))}
                className="h-4 w-4 cursor-pointer accent-cyan-500"
              />
              {t("otherIncome.declared")}
            </label>
            <p className="text-[11px] text-muted-foreground leading-tight">{t("otherIncome.declaredHelp")}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("otherIncome.notes")}</label>
            <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? `${t("common.loading")}...` : t("common.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
