"use client";

import { useState, useLayoutEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MoneyCell } from "@/components/app/money-cell";
import { SwipeCard } from "@/components/app/swipe-card";
import { Plus, Pencil, Trash2, Camera, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { ACCOUNT_TYPE_KEYS } from "@/lib/constants";
import { formatMoney } from "@/lib/utils";
import type { Account, AccountFormData, AccountSnapshot, PaginatedResponse } from "@/types";
import { useTranslations } from "@/i18n/use-translations";

export function AccountsContent() {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [snapshotAccount, setSnapshotAccount] = useState<Account | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: rawAccounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<PaginatedResponse<Account>>("/accounts/"),
    staleTime: 5 * 60_000,
  });
  const accounts = rawAccounts?.results;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/accounts/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success(t("common.deleted"));
    },
    onError: () => {
      toast.error(t("accounts.deleteError"));
    },
  });

  const totalBalance = accounts?.reduce(
    (sum, a) => sum + parseFloat(a.balance || "0"),
    0,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">{t("accounts.title")}</h1>

      {/* Summary */}
      <Card>
        <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("accounts.totalBalance")}</p>
            <MoneyCell value={totalBalance} className="text-2xl font-bold" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <Camera className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">{t("accounts.bulkSnapshot")}</span>
            </Button>
            <Button className="hidden sm:inline-flex" onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> {t("common.new")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mobile: SwipeCard list */}
      <div className="sm:hidden space-y-2">
        {accounts?.map((account) => (
          <SwipeCard
            key={account.id}
            onTap={() => setExpandedId(expandedId === account.id ? null : account.id)}
            onEdit={() => { setEditing(account); setDialogOpen(true); }}
            onDelete={() => {
              if (confirm(t("accounts.deleteConfirm"))) deleteMutation.mutate(account.id);
            }}
            accentColor="border-l-cyan-500"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{account.name}</p>
                <Badge variant="secondary" className="text-[10px]">
                  {t(ACCOUNT_TYPE_KEYS[account.type]) || account.type}
                </Badge>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setSnapshotAccount(account); }}
                className="p-1.5 rounded hover:bg-secondary transition-colors"
              >
                <Camera className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <MoneyCell value={account.balance} currency={account.currency} className="text-lg font-bold" />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[11px] text-muted-foreground">{account.currency}</p>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span>Snapshots</span>
                {expandedId === account.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </div>
            </div>
            {expandedId === account.id && (
              <div className="mt-2 pt-2 border-t">
                <SnapshotHistory accountId={account.id} />
              </div>
            )}
          </SwipeCard>
        ))}
      </div>

      {/* Desktop: Card grid */}
      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts?.map((account) => (
          <Card key={account.id}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium">{account.name}</p>
                  <Badge variant="secondary" className="mt-1">
                    {t(ACCOUNT_TYPE_KEYS[account.type]) || account.type}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Snapshot"
                    onClick={() => setSnapshotAccount(account)}
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setEditing(account); setDialogOpen(true); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(t("accounts.deleteConfirm"))) deleteMutation.mutate(account.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
              <MoneyCell value={account.balance} currency={account.currency} className="text-lg font-bold" />
              <p className="text-xs text-muted-foreground mt-1">{account.currency}</p>

              {/* Expandable snapshot history */}
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full justify-between text-xs text-muted-foreground"
                onClick={() => setExpandedId(expandedId === account.id ? null : account.id)}
              >
                Snapshots
                {expandedId === account.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
              {expandedId === account.id && (
                <SnapshotHistory accountId={account.id} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* FAB mobile */}
      <button
        className="fixed bottom-24 right-5 z-40 sm:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
        onClick={() => { setEditing(null); setDialogOpen(true); }}
        aria-label={t("common.new")}
      >
        <Plus className="h-6 w-6" />
      </button>

      <AccountDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} />
      <BulkSnapshotDialog open={bulkOpen} onOpenChange={setBulkOpen} accounts={accounts || []} />
      <IndividualSnapshotDialog
        open={!!snapshotAccount}
        onOpenChange={(v) => { if (!v) setSnapshotAccount(null); }}
        account={snapshotAccount}
      />
    </div>
  );
}

/* ── Snapshot History (lazy loaded per account) ── */
function SnapshotHistory({ accountId }: { accountId: string }) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["account-snapshots", accountId],
    queryFn: () => api.get<PaginatedResponse<AccountSnapshot>>(`/account-snapshots/?account=${accountId}&ordering=-date&page_size=20`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/account-snapshots/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-snapshots", accountId] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success(t("common.deleted"));
    },
    onError: () => {
      toast.error(t("common.errorDeleting"));
    },
  });

  const snapshots = data?.results ?? [];

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">...</p>;
  if (snapshots.length === 0) return <p className="text-xs text-muted-foreground py-2">{t("common.noData")}</p>;

  return (
    <div className="mt-1 space-y-1 max-h-48 overflow-y-auto">
      {snapshots.map((s) => (
        <div key={s.id} className="flex items-center justify-between text-xs py-1 border-t">
          <span className="text-muted-foreground">{s.date}</span>
          <div className="flex items-center gap-2">
            <span className="font-mono tabular-nums">{formatMoney(s.balance)}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0"
              onClick={() => { if (confirm("Eliminar snapshot?")) deleteMutation.mutate(s.id); }}
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Individual Snapshot Dialog ── */
function IndividualSnapshotDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: Account | null;
}) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [balance, setBalance] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    setLoading(true);
    try {
      await api.post("/account-snapshots/", {
        account: account.id,
        date,
        balance,
        note,
      });
      queryClient.invalidateQueries({ queryKey: ["account-snapshots", account.id] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success(t("common.success"));
      onOpenChange(false);
      setBalance("");
      setNote("");
    } catch {
      toast.error(t("common.errorSaving"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Snapshot — {account?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("common.date")}</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Balance *</label>
            <Input
              type="number"
              step="0.01"
              placeholder={account?.balance}
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nota</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={loading}>{loading ? `${t("common.loading")}...` : t("common.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Account Dialog ── */
function AccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: Account | null;
}) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form, setForm] = useState<AccountFormData>({ name: "", type: "OPERATIVA", currency: "EUR" });
  const [loading, setLoading] = useState(false);

  useLayoutEffect(() => {
    if (open) {
      if (account) setForm({ name: account.name, type: account.type, currency: account.currency });
      else setForm({ name: "", type: "OPERATIVA", currency: "EUR" });
    }
  }, [open, account]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (account) {
        await api.put(`/accounts/${account.id}/`, form);
        toast.success(t("common.success"));
      } else {
        await api.post("/accounts/", form);
        toast.success(t("common.success"));
      }
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      onOpenChange(false);
    } catch {
      toast.error(t("common.errorSaving"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{account ? t("accounts.edit") : t("accounts.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("common.name")} *</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("common.type")}</label>
            <Select value={form.type} onValueChange={(v) => v && setForm((f) => ({ ...f, type: v as AccountFormData["type"] }))}>
              <SelectTrigger><span data-slot="select-value">{t(ACCOUNT_TYPE_KEYS[form.type]) || form.type}</span></SelectTrigger>
              <SelectContent>
                {Object.entries(ACCOUNT_TYPE_KEYS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{t(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("common.currency")}</label>
            <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={loading}>{loading ? `${t("common.loading")}...` : t("common.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Bulk Snapshot Dialog ── */
function BulkSnapshotDialog({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: Account[];
}) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [snapshots, setSnapshots] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const items = Object.entries(snapshots)
        .filter(([, v]) => v !== "")
        .map(([account, balance]) => ({ account, balance }));
      if (items.length === 0) { toast.error(t("common.error")); return; }
      await api.post("/accounts/bulk-snapshot/", { date, snapshots: items });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      toast.success(t("common.success"));
      onOpenChange(false);
    } catch {
      toast.error(t("common.errorSaving"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("accounts.bulkSnapshot")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("common.date")}</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-3">
              <span className="text-sm font-medium w-24 sm:w-40 shrink-0 truncate">{a.name}</span>
              <Input
                type="number"
                step="0.01"
                placeholder={a.balance}
                value={snapshots[a.id] || ""}
                onChange={(e) => setSnapshots((s) => ({ ...s, [a.id]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={loading}>{loading ? `${t("common.loading")}...` : t("common.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
