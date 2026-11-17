"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useTranslations } from "@/i18n/use-translations";
import type {
  Account, Lease, LeaseReduction, OtherIncome, PaginatedResponse, Property, RentalExpense, RentalExpenseCategory,
} from "@/types";

export const REDUCTIONS: LeaseReduction[] = ["PRE_2023", "GENERAL", "RENT_DROP", "YOUNG", "REHAB", "NONE"];
export const EXPENSE_CATEGORIES: RentalExpenseCategory[] = [
  "TAXES", "COMMUNITY", "INSURANCE", "REPAIRS", "FINANCING", "UTILITIES", "SERVICES", "IMPROVEMENT", "OTHER",
];

/** Contracts signed before 26/05/2023 keep the old 60 % reduction */
const NEW_HOUSING_LAW = "2023-05-26";

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

/** Invalidate everything the rental screen and savings read */
export function useRentalRefresh() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["leases", "rental-expenses", "rental-overview", "rent-payments", "other-incomes", "properties"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
    qc.invalidateQueries({ queryKey: ["monthly-savings"] });
    qc.invalidateQueries({ queryKey: ["annual-savings"] });
  };
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {help && <p className="text-[11px] text-muted-foreground leading-tight">{help}</p>}
    </div>
  );
}

function SubmitButton({ loading }: { loading: boolean }) {
  const t = useTranslations();
  return (
    <Button type="submit" className="w-full" disabled={loading}>
      {loading ? `${t("common.loading")}...` : t("common.save")}
    </Button>
  );
}

async function save(path: string, id: string | undefined, body: unknown) {
  return id ? api.put(`${path}${id}/`, body) : api.post(path, body);
}

// ── Tax data of the property ────────────────────────────────────────────────

export function PropertyTaxDialog({
  open, onOpenChange, property,
}: { open: boolean; onOpenChange: (v: boolean) => void; property: Property }) {
  const t = useTranslations();
  const refresh = useRentalRefresh();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    purchase_price: "", acquisition_costs: "", cadastral_value: "", cadastral_construction_value: "",
    cadastral_revised: true, furniture_value: "", ownership_pct: "100",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      purchase_price: property.purchase_price ?? "",
      acquisition_costs: property.acquisition_costs ?? "",
      cadastral_value: property.cadastral_value ?? "",
      cadastral_construction_value: property.cadastral_construction_value ?? "",
      cadastral_revised: property.cadastral_revised ?? true,
      furniture_value: property.furniture_value ?? "",
      ownership_pct: property.ownership_pct ?? "100",
    });
  }, [open, property]);

  const money = (key: keyof typeof form) => ({
    type: "number", step: "0.01", min: "0", inputMode: "decimal" as const,
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const nullable = (v: string) => (v === "" ? null : v);
    try {
      await api.patch(`/properties/${property.id}/`, {
        purchase_price: nullable(form.purchase_price),
        acquisition_costs: nullable(form.acquisition_costs),
        cadastral_value: nullable(form.cadastral_value),
        cadastral_construction_value: nullable(form.cadastral_construction_value),
        cadastral_revised: form.cadastral_revised,
        furniture_value: nullable(form.furniture_value),
        ownership_pct: form.ownership_pct || "100",
      });
      toast.success(t("common.success"));
      refresh();
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
        <DialogHeader><DialogTitle>{t("rental.taxData")}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("rental.purchasePrice")}><Input {...money("purchase_price")} /></Field>
            <Field label={t("rental.acquisitionCosts")} help={t("rental.acquisitionCostsHelp")}>
              <Input {...money("acquisition_costs")} />
            </Field>
            <Field label={t("rental.cadastralValue")}><Input {...money("cadastral_value")} /></Field>
            <Field label={t("rental.cadastralConstruction")} help={t("rental.cadastralConstructionHelp")}>
              <Input {...money("cadastral_construction_value")} />
            </Field>
            <Field label={t("rental.furnitureValue")}><Input {...money("furniture_value")} /></Field>
            <Field label={t("rental.ownershipPct")}>
              <Input
                type="number" step="0.01" min="0.01" max="100" value={form.ownership_pct}
                onChange={(e) => setForm((f) => ({ ...f, ownership_pct: e.target.value }))}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox" checked={form.cadastral_revised}
              onChange={(e) => setForm((f) => ({ ...f, cadastral_revised: e.target.checked }))}
              className="h-4 w-4 cursor-pointer accent-cyan-500"
            />
            {t("rental.cadastralRevised")}
          </label>
          <p className="text-[11px] text-muted-foreground leading-tight">{t("rental.taxDataHelp")}</p>
          <SubmitButton loading={loading} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Lease ───────────────────────────────────────────────────────────────────

export function LeaseDialog({
  open, onOpenChange, propertyId, lease,
}: { open: boolean; onOpenChange: (v: boolean) => void; propertyId: string; lease: Lease | null }) {
  const t = useTranslations();
  const refresh = useRentalRefresh();
  const [loading, setLoading] = useState(false);
  const empty = {
    tenant: "", start_date: todayIso(), end_date: "", monthly_rent: "", deposit: "",
    reduction: "GENERAL" as LeaseReduction, rented_share_pct: "100", notes: "",
  };
  const [form, setForm] = useState(empty);
  const [reductionTouched, setReductionTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReductionTouched(!!lease);
    setForm(lease ? {
      tenant: lease.tenant, start_date: lease.start_date, end_date: lease.end_date ?? "",
      monthly_rent: lease.monthly_rent, deposit: lease.deposit ?? "", reduction: lease.reduction,
      rented_share_pct: lease.rented_share_pct, notes: lease.notes,
    } : { ...empty, start_date: todayIso() });
  }, [open, lease]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStart = (value: string) => setForm((f) => ({
    ...f,
    start_date: value,
    // Suggest the regime the start date implies until the user picks one
    reduction: reductionTouched ? f.reduction : value && value < NEW_HOUSING_LAW ? "PRE_2023" : "GENERAL",
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await save("/leases/", lease?.id, {
        ...form, property: propertyId, end_date: form.end_date || null, deposit: form.deposit || null,
      });
      toast.success(t("common.success"));
      refresh();
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
        <DialogHeader><DialogTitle>{lease ? t("rental.editLease") : t("rental.newLease")}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t("rental.tenant")}>
            <Input value={form.tenant} onChange={(e) => setForm((f) => ({ ...f, tenant: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("rental.startDate")}>
              <Input type="date" value={form.start_date} onChange={(e) => setStart(e.target.value)} required />
            </Field>
            <Field label={t("rental.endDate")}>
              <Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
            </Field>
            <Field label={t("rental.monthlyRent")}>
              <Input
                type="number" step="0.01" min="0" inputMode="decimal" value={form.monthly_rent} required
                onChange={(e) => setForm((f) => ({ ...f, monthly_rent: e.target.value }))}
              />
            </Field>
            <Field label={t("rental.deposit")}>
              <Input
                type="number" step="0.01" min="0" inputMode="decimal" value={form.deposit}
                onChange={(e) => setForm((f) => ({ ...f, deposit: e.target.value }))}
              />
            </Field>
          </div>
          <Field label={t("rental.reduction")} help={t("rental.reductionHelp")}>
            <Select
              value={form.reduction}
              onValueChange={(v) => { if (v) { setReductionTouched(true); setForm((f) => ({ ...f, reduction: v as LeaseReduction })); } }}
            >
              <SelectTrigger className="w-full">
                <span className="flex flex-1 text-left truncate" data-slot="select-value">{t(`rental.reduction.${form.reduction}`)}</span>
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {REDUCTIONS.map((r) => <SelectItem key={r} value={r}>{t(`rental.reduction.${r}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("rental.rentedShare")} help={t("rental.rentedShareHelp")}>
            <Input
              type="number" step="0.01" min="0.01" max="100" value={form.rented_share_pct}
              onChange={(e) => setForm((f) => ({ ...f, rented_share_pct: e.target.value }))}
            />
          </Field>
          <Field label={t("otherIncome.notes")}>
            <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
          <SubmitButton loading={loading} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Rent payment (an OtherIncome linked to the lease) ───────────────────────

export function RentPaymentDialog({
  open, onOpenChange, lease, payment, propertyName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lease: Lease | null;
  payment: OtherIncome | null;
  propertyName: string;
}) {
  const t = useTranslations();
  const refresh = useRentalRefresh();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ date: todayIso(), amount: "", account: null as string | null });

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<Account[] | PaginatedResponse<Account>>("/accounts/"),
    enabled: open,
  });
  const accountList = Array.isArray(accounts) ? accounts : accounts?.results ?? [];

  useEffect(() => {
    if (!open) return;
    setForm(payment
      ? { date: payment.date, amount: payment.amount, account: payment.account }
      : { date: todayIso(), amount: lease?.monthly_rent ?? "", account: null });
  }, [open, payment, lease]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lease && !payment) return;
    setLoading(true);
    try {
      await save("/other-incomes/", payment?.id, {
        date: form.date,
        amount: form.amount,
        account: form.account,
        category: "RENTAL",
        description: payment?.description ?? `${t("rental.rentOf")} ${propertyName}`,
        lease: payment?.lease ?? lease?.id,
        notes: payment?.notes ?? "",
      });
      toast.success(t("common.success"));
      refresh();
      onOpenChange(false);
    } catch {
      toast.error(t("common.errorSaving"));
    } finally {
      setLoading(false);
    }
  };

  const accountLabel = form.account
    ? accountList.find((a) => a.id === form.account)?.name ?? ""
    : t("otherIncome.noAccount");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{payment ? t("rental.editPayment") : t("rental.recordPayment")}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.date")}>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            </Field>
            <Field label={t("otherIncome.amount")}>
              <Input
                type="number" step="0.01" min="0.01" inputMode="decimal" value={form.amount} required autoFocus
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </Field>
          </div>
          <Field label={t("otherIncome.account")}>
            <Select value={form.account ?? "none"} onValueChange={(v) => setForm((f) => ({ ...f, account: !v || v === "none" ? null : v }))}>
              <SelectTrigger className="w-full">
                <span className="flex flex-1 text-left truncate" data-slot="select-value">{accountLabel}</span>
              </SelectTrigger>
              <SelectContent className="z-[200]">
                <SelectItem value="none">{t("otherIncome.noAccount")}</SelectItem>
                {accountList.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <p className="text-[11px] text-muted-foreground leading-tight">{t("rental.paymentHelp")}</p>
          <SubmitButton loading={loading} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Expense ─────────────────────────────────────────────────────────────────

export function RentalExpenseDialog({
  open, onOpenChange, propertyId, expense,
}: { open: boolean; onOpenChange: (v: boolean) => void; propertyId: string; expense: RentalExpense | null }) {
  const t = useTranslations();
  const refresh = useRentalRefresh();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ date: todayIso(), category: "TAXES" as RentalExpenseCategory, amount: "", description: "" });

  useEffect(() => {
    if (!open) return;
    setForm(expense
      ? { date: expense.date, category: expense.category, amount: expense.amount, description: expense.description }
      : { date: todayIso(), category: "TAXES", amount: "", description: "" });
  }, [open, expense]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await save("/rental-expenses/", expense?.id, { ...form, property: propertyId });
      toast.success(t("common.success"));
      refresh();
      onOpenChange(false);
    } catch {
      toast.error(t("common.errorSaving"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{expense ? t("rental.editExpense") : t("rental.newExpense")}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t("rental.expenseCategory")} help={t(`rental.expense.${form.category}.help`)}>
            <Select value={form.category} onValueChange={(v) => v && setForm((f) => ({ ...f, category: v as RentalExpenseCategory }))}>
              <SelectTrigger className="w-full">
                <span className="flex flex-1 text-left truncate" data-slot="select-value">{t(`rental.expense.${form.category}`)}</span>
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`rental.expense.${c}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.date")}>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            </Field>
            <Field label={t("rental.amount")}>
              <Input
                type="number" step="0.01" min="0.01" inputMode="decimal" value={form.amount} required
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </Field>
          </div>
          <Field label={t("otherIncome.description")}>
            <Input value={form.description} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <SubmitButton loading={loading} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
