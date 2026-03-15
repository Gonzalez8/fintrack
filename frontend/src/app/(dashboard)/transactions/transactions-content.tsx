"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
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
import { DetailDrawer } from "@/components/app/detail-drawer";
import { ShoppingCart, TrendingDown, Gift, Search, Pencil, Trash2, Download, Info, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { TRANSACTION_TYPE_LABELS } from "@/lib/constants";
import { formatMoney, formatQty } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type { Transaction, TransactionFormData, Asset, Account, PaginatedResponse, PortfolioData } from "@/types";
import { useDebounce } from "@/hooks/use-debounce";

const PAGE_SIZE = 25;

const TX_TYPE_BADGE_COLORS: Record<string, string> = {
  BUY: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  SELL: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  GIFT: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

export function TransactionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [detailItem, setDetailItem] = useState<Transaction | null>(null);
  const [newType, setNewType] = useState<"BUY" | "SELL" | "GIFT">("BUY");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const page = Number(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";
  const typeFilter = searchParams.get("type") || "";
  const dateFrom = searchParams.get("date_from") || "";
  const dateTo = searchParams.get("date_to") || "";
  const accountFilter = searchParams.get("account") || "";

  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    if (debouncedSearch !== search) {
      setParam("search", debouncedSearch);
    }
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", page, debouncedSearch, typeFilter, dateFrom, dateTo, accountFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      if (search) p.set("search", search);
      if (typeFilter) p.set("type", typeFilter);
      if (dateFrom) p.set("date_after", dateFrom);
      if (dateTo) p.set("date_before", dateTo);
      if (accountFilter) p.set("account", accountFilter);
      return api.get<PaginatedResponse<Transaction>>(`/transactions/?${p}`);
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<Account[]>("/accounts/"),
  });
  const accountList = Array.isArray(accounts) ? accounts : (accounts as PaginatedResponse<Account> | undefined)?.results ?? [];

  const handleExportCsv = async () => {
    try {
      const res = await fetch("/api/proxy/export/transactions.csv", { credentials: "include" });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "transactions.csv";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error("[csv-export]", err);
      toast.error(t("common.errorSaving"));
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/transactions/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["portfolio"], refetchType: "active" });
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
    queryClient.prefetchQuery({ queryKey: ["accounts"], queryFn: () => api.get<Account[]>("/accounts/") });
    queryClient.prefetchQuery({ queryKey: ["portfolio"], queryFn: () => api.get<PortfolioData>("/portfolio/") });
  };

  const openNew = (type: "BUY" | "SELL" | "GIFT") => {
    setEditing(null);
    setNewType(type);
    setDialogOpen(true);
  };

  const openEdit = (tx: Transaction) => {
    setEditing(tx);
    setDialogOpen(true);
  };

  const columns: Column<Transaction>[] = [
    { key: "date", header: t("common.date"), render: (tx) => <span className="text-sm">{tx.date}</span> },
    {
      key: "type",
      header: t("common.type"),
      render: (tx) => (
        <Badge className={TX_TYPE_BADGE_COLORS[tx.type] ?? ""} variant="secondary">
          {TRANSACTION_TYPE_LABELS[tx.type] || tx.type}
        </Badge>
      ),
    },
    {
      key: "asset",
      header: t("common.name"),
      render: (tx) => (
        <div>
          <span className="font-medium">{tx.asset_name}</span>
          {tx.asset_ticker && <span className="ml-1 text-xs text-muted-foreground">{tx.asset_ticker}</span>}
        </div>
      ),
    },
    { key: "account", header: t("common.account"), render: (tx) => <span className="text-sm">{tx.account_name}</span> },
    { key: "qty", header: t("portfolio.quantity"), className: "text-right", render: (tx) => <span className="font-mono text-sm tabular-nums">{formatQty(tx.quantity)}</span> },
    { key: "price", header: t("transactions.price"), className: "text-right", render: (tx) => <MoneyCell value={tx.price} /> },
    { key: "commission", header: t("transactions.commission"), className: "text-right", render: (tx) => <MoneyCell value={tx.commission} /> },
    { key: "tax", header: t("transactions.taxes"), className: "text-right", render: (tx) => <MoneyCell value={tx.tax} /> },
    {
      key: "total",
      header: "Total",
      className: "text-right",
      render: (tx) => {
        const tot = tx.price ? parseFloat(tx.quantity) * parseFloat(tx.price) : null;
        return tot != null ? <span className="font-mono text-sm font-semibold tabular-nums">{formatMoney(tot)}</span> : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (tx) => (
        <div className="flex gap-1 justify-end">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(tx); }}>
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); if (confirm("Eliminar?")) deleteMutation.mutate(tx.id); }}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header: title + action buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">{t("transactions.title")}</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">CSV</span>
          </Button>
          <Button size="sm" onClick={() => openNew("BUY")} onMouseEnter={prefetchDialogData}>
            <ShoppingCart className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">{t("transactions.buy")}</span>
          </Button>
          <Button size="sm" variant="destructive" onClick={() => openNew("SELL")} onMouseEnter={prefetchDialogData}>
            <TrendingDown className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">{t("transactions.sell")}</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openNew("GIFT")} onMouseEnter={prefetchDialogData}>
            <Gift className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">{t("transactions.gift")}</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      {(() => {
        const activeFilterCount = [typeFilter, dateFrom, dateTo, accountFilter].filter(Boolean).length;
        const clearAllFilters = () => {
          setParam("type", "");
          setParam("date_from", "");
          setParam("date_to", "");
          setParam("account", "");
        };
        return (
          <div className="space-y-2">
            {/* Search + filter toggle (always visible) */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t("transactions.searchPlaceholder")} className="pl-9" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
              </div>
              <Button
                variant="outline"
                size="icon"
                className="sm:hidden relative shrink-0"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </div>

            {/* Active filter chips (mobile, when collapsed) */}
            {!filtersOpen && activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5 sm:hidden">
                {typeFilter && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-mono">
                    {TRANSACTION_TYPE_LABELS[typeFilter] || typeFilter}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setParam("type", "")} />
                  </span>
                )}
                {dateFrom && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-mono">
                    {t("transactions.from")}: {dateFrom}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setParam("date_from", "")} />
                  </span>
                )}
                {dateTo && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-mono">
                    {t("transactions.to")}: {dateTo}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setParam("date_to", "")} />
                  </span>
                )}
                {accountFilter && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-mono">
                    {accountList.find((a) => a.id === accountFilter)?.name || accountFilter}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setParam("account", "")} />
                  </span>
                )}
                <button className="text-xs text-muted-foreground underline" onClick={clearAllFilters}>
                  {t("transactions.clearFilters")}
                </button>
              </div>
            )}

            {/* Expanded filter panel (mobile: toggled, desktop: always visible) */}
            <div className={`flex-col sm:flex-row gap-2 ${filtersOpen ? "flex sm:flex" : "hidden sm:flex"}`}>
              <Input type="date" className="w-full sm:w-[140px]" value={dateFrom} onChange={(e) => setParam("date_from", e.target.value)} />
              <Input type="date" className="w-full sm:w-[140px]" value={dateTo} onChange={(e) => setParam("date_to", e.target.value)} />
              <Select value={typeFilter || "ALL"} onValueChange={(v) => setParam("type", v === "ALL" ? "" : v || "")}>
                <SelectTrigger className="w-full sm:w-[130px]">
                  <span data-slot="select-value">{typeFilter ? (TRANSACTION_TYPE_LABELS[typeFilter] || typeFilter) : t("transactions.allTypes")}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("transactions.allTypes")}</SelectItem>
                  {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={accountFilter || "ALL"} onValueChange={(v) => setParam("account", v === "ALL" ? "" : v || "")}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <span data-slot="select-value">{accountFilter ? (accountList.find((a) => a.id === accountFilter)?.name || accountFilter) : t("transactions.allAccounts")}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("transactions.allAccounts")}</SelectItem>
                  {accountList.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      })()}

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">{t("common.loading")}</div>
        ) : (data?.results ?? []).length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">{t("transactions.noTransactions")}</div>
        ) : (
          (data?.results ?? []).map((tx) => {
            const total = tx.price ? parseFloat(tx.quantity) * parseFloat(tx.price) : null;
            const accent = tx.type === "BUY" ? "border-l-green-500" : tx.type === "SELL" ? "border-l-red-500" : "border-l-purple-500";
            return (
              <SwipeCard
                key={tx.id}
                onTap={() => setDetailItem(tx)}
                onEdit={() => openEdit(tx)}
                onDelete={() => { if (confirm("Eliminar?")) deleteMutation.mutate(tx.id); }}
                accentColor={accent}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge className={TX_TYPE_BADGE_COLORS[tx.type] ?? ""} variant="secondary">
                        {TRANSACTION_TYPE_LABELS[tx.type] || tx.type}
                      </Badge>
                      <span className="font-medium text-sm truncate">{tx.asset_name}</span>
                      {tx.asset_ticker && <span className="text-xs text-muted-foreground">{tx.asset_ticker}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {tx.date} · {tx.account_name} · {formatQty(tx.quantity)} × {tx.price ? formatMoney(tx.price) : "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {total != null && (
                      <p className="font-mono text-sm font-bold tabular-nums">{formatMoney(total)}</p>
                    )}
                  </div>
                </div>
              </SwipeCard>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block">
        <DataTable
          columns={columns}
          data={data?.results ?? []}
          keyFn={(t) => t.id}
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.count}
          onPageChange={(p) => setParam("page", String(p))}
          emptyMessage={isLoading ? `${t("common.loading")}...` : t("transactions.noTransactions")}
        />
      </div>

      <TransactionDialog open={dialogOpen} onOpenChange={setDialogOpen} transaction={editing} defaultType={newType} />

      {detailItem && (() => {
        const tx = detailItem;
        const total = tx.price ? parseFloat(tx.quantity) * parseFloat(tx.price) : null;
        return (
          <DetailDrawer
            open
            onOpenChange={(v) => { if (!v) setDetailItem(null); }}
            title={tx.asset_name ?? ""}
            subtitle={`${tx.asset_ticker ?? ""} · ${TRANSACTION_TYPE_LABELS[tx.type] || tx.type} · ${tx.date}`}
            rows={[
              { label: t("common.account"), value: tx.account_name ?? "" },
              { label: t("common.quantity"), value: formatQty(tx.quantity) },
              ...(tx.price ? [{ label: t("transactions.price"), value: formatMoney(tx.price) }] : []),
              ...(total != null ? [{ label: "Total", value: <span className="font-semibold">{formatMoney(total)}</span> }] : []),
              ...(tx.commission && parseFloat(tx.commission) > 0 ? [{ label: t("transactions.commission"), value: formatMoney(tx.commission) }] : []),
              ...(tx.tax && parseFloat(tx.tax) > 0 ? [{ label: t("transactions.tax"), value: formatMoney(tx.tax) }] : []),
              ...(tx.notes ? [{ label: t("transactions.notes"), value: tx.notes }] : []),
            ]}
          />
        );
      })()}
    </div>
  );
}

function TransactionDialog({
  open,
  onOpenChange,
  transaction,
  defaultType,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transaction: Transaction | null;
  defaultType: "BUY" | "SELL" | "GIFT";
}) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form, setForm] = useState<TransactionFormData>({
    date: new Date().toISOString().split("T")[0],
    type: "BUY",
    asset: "",
    account: "",
    quantity: "",
    price: "",
    commission: "0",
    tax: "0",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Reset form every time the dialog opens
  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setForm({
        date: transaction.date,
        type: transaction.type,
        asset: transaction.asset,
        account: transaction.account,
        quantity: transaction.quantity,
        price: transaction.price || "",
        commission: transaction.commission,
        tax: transaction.tax,
        notes: transaction.notes,
      });
    } else {
      setForm({
        date: new Date().toISOString().split("T")[0],
        type: defaultType,
        asset: "",
        account: "",
        quantity: "",
        price: "",
        commission: "0",
        tax: "0",
        notes: "",
      });
    }
    setError("");
  }, [open, transaction, defaultType]);

  const { data: assets } = useQuery({
    queryKey: ["assets-list"],
    queryFn: () => api.get<Asset[]>("/assets/?page_size=1000"),
    enabled: open,
  });

  const { data: dialogAccounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<Account[]>("/accounts/"),
    enabled: open,
  });

  const { data: portfolio } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.get<PortfolioData>("/portfolio/"),
    enabled: open,
  });

  const positionMap = new Map(
    (portfolio?.positions ?? []).map((p) => [p.asset_id, p])
  );

  const isSell = form.type === "SELL";


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (transaction) {
        await api.put(`/transactions/${transaction.id}/`, form);
        toast.success(t("transactions.edit"));
      } else {
        await api.post("/transactions/", form);
        toast.success(t("transactions.new"));
      }
      queryClient.invalidateQueries({ queryKey: ["transactions"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["portfolio"], refetchType: "active" });
      onOpenChange(false);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "body" in err) {
        try {
          const data = JSON.parse((err as { body: string }).body);
          const msgs: string[] = [];
          for (const v of Object.values(data)) {
            msgs.push(Array.isArray(v) ? v[0] : String(v));
          }
          setError(msgs.join(". "));
        } catch {
          setError(t("common.errorSaving"));
        }
      } else {
        setError(t("common.errorSaving"));
      }
    } finally {
      setLoading(false);
    }
  };

  const assetList = Array.isArray(assets) ? assets : (assets as PaginatedResponse<Asset> | undefined)?.results ?? [];
  const dialogAccountList = Array.isArray(dialogAccounts) ? dialogAccounts : (dialogAccounts as PaginatedResponse<Account> | undefined)?.results ?? [];

  // For SELL: only show assets with open positions
  const assetOptions = isSell
    ? assetList.filter((a) => positionMap.has(a.id))
    : assetList;

  const selectedPosition = isSell && form.asset ? positionMap.get(form.asset) : null;

  // Compute display labels (Base UI Portal unmounts items when closed, losing label resolution)
  const selectedAssetLabel = (() => {
    if (!form.asset) return "";
    const asset = assetList.find((a) => a.id === form.asset);
    if (!asset) return "";
    return `${asset.name}${asset.ticker ? ` (${asset.ticker})` : ""}`;
  })();

  const selectedAccountLabel = (() => {
    if (!form.account) return "";
    const account = dialogAccountList.find((a) => a.id === form.account);
    return account?.name ?? "";
  })();

  const handleAssetChange = (assetId: string) => {
    setForm((f) => {
      const updates: Partial<TransactionFormData> = { asset: assetId };
      if (f.type === "SELL" && assetId) {
        const pos = positionMap.get(assetId);
        if (pos) {
          updates.price = pos.current_price;
        }
      } else {
        const asset = assetList.find((a) => a.id === assetId);
        if (asset?.current_price) {
          updates.price = asset.current_price;
        }
      }
      return { ...f, ...updates };
    });
  };

  const handleTypeChange = (type: string) => {
    setForm((f) => {
      const updates: Partial<TransactionFormData> = { type: type as TransactionFormData["type"] };
      if (type === "SELL" && f.asset) {
        const pos = positionMap.get(f.asset);
        if (pos) {
          updates.price = pos.current_price;
        }
      }
      return { ...f, ...updates };
    });
  };

  // Total calculation
  const qty = parseFloat(form.quantity) || 0;
  const price = parseFloat(form.price || "0") || 0;
  const commission = parseFloat(form.commission || "0") || 0;
  const tax = parseFloat(form.tax || "0") || 0;
  const subtotal = qty * price;
  const total = isSell ? subtotal - commission - tax : subtotal + commission + tax;

  const getDialogTitle = () => {
    if (transaction) return t("transactions.editTransaction");
    if (form.type === "BUY") return t("transactions.newBuy");
    if (form.type === "SELL") return t("transactions.newSell");
    if (form.type === "GIFT") return t("transactions.newGift");
    return t("transactions.title");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">{t("common.date")}</label>
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
          </div>

          {/* Only show type selector when editing (new transactions already have type from button) */}
          {transaction && (
            <div>
              <label className="text-sm font-medium">{t("common.type")}</label>
              <Select value={form.type} onValueChange={(v) => v && handleTypeChange(v)}>
                <SelectTrigger className="w-full">
                  <span data-slot="select-value">{TRANSACTION_TYPE_LABELS[form.type] || form.type}</span>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">{t("common.name")} *</label>
            <Select value={form.asset} onValueChange={(v) => v && handleAssetChange(v)}>
              <SelectTrigger className="w-full">
                <span className="flex flex-1 text-left truncate" data-slot="select-value">
                  {selectedAssetLabel || <span className="text-muted-foreground">{t("common.select")}</span>}
                </span>
              </SelectTrigger>
              <SelectContent>
                {assetOptions.map((a) => {
                  const pos = positionMap.get(a.id);
                  const suffix = isSell && pos ? ` — ${formatQty(pos.quantity)} ${t("transactions.units")}` : "";
                  return (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} {a.ticker ? `(${a.ticker})` : ""}{suffix}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">{t("common.account")} *</label>
            <Select value={form.account} onValueChange={(v) => { const val = v || ""; setForm((f) => ({ ...f, account: val })); }}>
              <SelectTrigger className="w-full">
                <span className="flex flex-1 text-left truncate" data-slot="select-value">
                  {selectedAccountLabel || <span className="text-muted-foreground">{t("common.select")}</span>}
                </span>
              </SelectTrigger>
              <SelectContent>
                {dialogAccountList.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">{t("portfolio.quantity")} *</label>
            <Input
              type="number"
              step="any"
              min="0"
              value={form.quantity}
              max={selectedPosition ? selectedPosition.quantity : undefined}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              required
            />
            {selectedPosition && (
              <p className="text-xs text-muted-foreground mt-1">
                {t("transactions.available")}: <strong>{formatQty(selectedPosition.quantity)}</strong> {t("transactions.units")}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">{t("transactions.unitPrice")}</label>
            <Input type="number" step="any" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">{t("transactions.commission")}</label>
              <div className="relative">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  className="pr-7"
                  value={form.commission}
                  onChange={(e) => setForm((f) => ({ ...f, commission: e.target.value }))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium inline-flex items-center gap-1">
                {t("transactions.taxes")}
                <span className="relative group cursor-help">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-52 rounded-md bg-popover border text-popover-foreground text-xs p-2 shadow-md z-50 pointer-events-none">
                    {t("transactions.taxesTooltip")}
                  </span>
                </span>
              </label>
              <div className="relative">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  className="pr-7"
                  value={form.tax}
                  onChange={(e) => setForm((f) => ({ ...f, tax: e.target.value }))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
              </div>
            </div>
          </div>

          {/* Total calculation card */}
          {form.quantity && form.price && subtotal > 0 && (
            <div className="rounded-md bg-muted/50 p-3 space-y-1">
              <p className="text-sm font-medium">
                {t("transactions.totalOperation")}: <strong>{total.toFixed(2)} €</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                {qty} × {price}{isSell ? " −" : " +"} {commission} {t("transactions.commission_short")}{tax > 0 ? ` ${isSell ? "−" : "+"} ${tax} ${t("transactions.taxes_short")}` : ""}
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {t("transactions.taxNote")}
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("transactions.saving") : t("transactions.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
