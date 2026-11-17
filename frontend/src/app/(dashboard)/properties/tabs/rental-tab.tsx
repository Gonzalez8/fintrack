"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { SwipeCard } from "@/components/app/swipe-card";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type {
  Lease, OtherIncome, PaginatedResponse, Property, RentalExpense, RentalOverview,
} from "@/types";
import {
  LeaseDialog, PropertyTaxDialog, RentPaymentDialog, RentalExpenseDialog, useRentalRefresh,
} from "./rental-dialogs";
import { RentalResultCard, RentalSimulator } from "./rental-tax-card";

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => currentYear + 1 - i);

type Results<T> = PaginatedResponse<T> | T[];
const rowsOf = <T,>(data: Results<T> | undefined): T[] => (Array.isArray(data) ? data : data?.results ?? []);

/** A list item: swipe actions on mobile, inline icons on desktop */
function ItemRow({
  children, onEdit, onDelete, accent,
}: { children: React.ReactNode; onEdit: () => void; onDelete: () => void; accent: string }) {
  const t = useTranslations();
  return (
    <>
      <div className="sm:hidden">
        <SwipeCard onEdit={onEdit} onDelete={onDelete} accentColor={accent}>{children}</SwipeCard>
      </div>
      <div className="hidden sm:flex items-center gap-3 rounded-md border px-3 py-2 group">
        <div className="flex-1 min-w-0">{children}</div>
        <div className="flex gap-1 opacity-60 group-hover:opacity-100">
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label={t("common.edit")}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={onDelete} aria-label={t("common.delete")}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    </>
  );
}

function Section({
  title, action, children,
}: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">{title}</CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-2">{text}</p>;
}

export function RentalTab() {
  const t = useTranslations();
  const refresh = useRentalRefresh();
  const [pickedId, setPropertyId] = useState<string | null>(null);
  const [year, setYear] = useState(currentYear);
  const [taxOpen, setTaxOpen] = useState(false);
  const [lease, setLease] = useState<{ open: boolean; item: Lease | null }>({ open: false, item: null });
  const [payment, setPayment] = useState<{ open: boolean; item: OtherIncome | null }>({ open: false, item: null });
  const [expense, setExpense] = useState<{ open: boolean; item: RentalExpense | null }>({ open: false, item: null });

  const { data: propertiesData } = useQuery({
    queryKey: ["properties"],
    queryFn: () => api.get<Results<Property>>("/properties/"),
    staleTime: 5 * 60_000,
  });
  const properties = rowsOf(propertiesData);
  const { data: allLeases } = useQuery({
    queryKey: ["leases"],
    queryFn: () => api.get<Results<Lease>>("/leases/?page_size=1000"),
  });

  // Until one is picked: the first property with a lease, else the first one
  const leasedIds = rowsOf(allLeases).map((l) => l.property);
  const propertyId = pickedId ?? properties.find((p) => leasedIds.includes(p.id))?.id ?? properties[0]?.id ?? null;

  const property = properties.find((p) => p.id === propertyId) ?? null;
  const leases = rowsOf(allLeases).filter((l) => l.property === propertyId);
  const todayIso = new Date().toISOString().split("T")[0];
  const activeLease =
    leases.find((l) => l.start_date <= todayIso && (!l.end_date || l.end_date >= todayIso)) ?? leases[0] ?? null;

  const { data: paymentsData } = useQuery({
    queryKey: ["rent-payments", propertyId, year],
    queryFn: () => api.get<Results<OtherIncome>>(`/other-incomes/?property=${propertyId}&year=${year}&page_size=1000`),
    enabled: !!propertyId,
  });
  const payments = rowsOf(paymentsData);
  const { data: expensesData } = useQuery({
    queryKey: ["rental-expenses", propertyId, year],
    queryFn: () => api.get<Results<RentalExpense>>(`/rental-expenses/?property=${propertyId}&year=${year}&page_size=1000`),
    enabled: !!propertyId,
  });
  const expenses = rowsOf(expensesData);
  const { data: overview, isError: noTaxModule } = useQuery({
    queryKey: ["rental-overview", year],
    queryFn: () => api.get<RentalOverview>(`/rental/overview/?year=${year}`),
    retry: false,
  });
  const entry = overview?.properties.find((p) => p.property.id === propertyId) ?? null;

  const remove = useMutation({
    mutationFn: (path: string) => api.delete(path),
    onSuccess: () => { refresh(); toast.success(t("common.deleted")); },
    onError: () => toast.error(t("common.errorDeleting")),
  });
  const confirmRemove = (path: string) => { if (confirm(t("rental.confirmDelete"))) remove.mutate(path); };

  if (!properties.length) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t("rental.noProperties")}</CardContent></Card>;
  }

  const sum = (items: { amount: string }[]) => items.reduce((s, i) => s + parseFloat(i.amount), 0).toFixed(2);
  const taxFacts = property && [
    { label: t("rental.purchasePrice"), value: property.purchase_price },
    { label: t("rental.acquisitionCosts"), value: property.acquisition_costs },
    { label: t("rental.cadastralValue"), value: property.cadastral_value },
    { label: t("rental.cadastralConstruction"), value: property.cadastral_construction_value },
    { label: t("rental.furnitureValue"), value: property.furniture_value },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground max-w-3xl">{t("rental.intro")}</p>

      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={propertyId ?? ""} onValueChange={(v) => v && setPropertyId(v)}>
          <SelectTrigger className="w-full sm:w-[280px]">
            <span className="flex flex-1 text-left truncate" data-slot="select-value">{property?.name}</span>
          </SelectTrigger>
          <SelectContent>
            {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => v && setYear(Number(v))}>
          <SelectTrigger className="w-full sm:w-[120px]"><span data-slot="select-value">{year}</span></SelectTrigger>
          <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {property && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            title={t("rental.taxData")}
            action={<Button size="sm" variant="outline" onClick={() => setTaxOpen(true)}><Pencil className="h-3.5 w-3.5 mr-1" />{t("common.edit")}</Button>}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {taxFacts!.map((f) => (
                <div key={f.label} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="font-mono tabular-nums">{f.value ? formatMoney(f.value) : "—"}</span>
                </div>
              ))}
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("rental.ownershipPct")}</span>
                <span className="font-mono tabular-nums">{parseFloat(property.ownership_pct ?? "100")} %</span>
              </div>
            </div>
            {(!property.cadastral_value || !property.cadastral_construction_value || !property.purchase_price) && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />{t("rental.taxDataMissing")}
              </p>
            )}
          </Section>

          <Section
            title={t("rental.leases")}
            action={<Button size="sm" variant="outline" onClick={() => setLease({ open: true, item: null })}><Plus className="h-3.5 w-3.5 mr-1" />{t("rental.newLease")}</Button>}
          >
            {leases.length === 0 && <Empty text={t("rental.noLeases")} />}
            {leases.map((l) => (
              <ItemRow key={l.id} accent="border-l-teal-500" onEdit={() => setLease({ open: true, item: l })} onDelete={() => confirmRemove(`/leases/${l.id}/`)}>
                <div className="flex justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{l.tenant || t("rental.tenantUnnamed")}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.start_date} → {l.end_date ?? t("rental.ongoing")} · {t(`rental.reduction.${l.reduction}`)}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums shrink-0">{formatMoney(l.monthly_rent)}{t("rental.perMonth")}</span>
                </div>
              </ItemRow>
            ))}
          </Section>

          <Section
            title={`${t("rental.payments")} ${year} · ${formatMoney(sum(payments))}`}
            action={activeLease && (
              <Button size="sm" onClick={() => setPayment({ open: true, item: null })}><Plus className="h-3.5 w-3.5 mr-1" />{t("rental.recordPayment")}</Button>
            )}
          >
            {entry && entry.missing_months.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                {t("rental.missingMonths", { months: entry.missing_months.join(", ") })}
              </p>
            )}
            {!activeLease && <Empty text={t("rental.needLease")} />}
            {activeLease && payments.length === 0 && <Empty text={t("common.noData")} />}
            {payments.map((p) => (
              <ItemRow key={p.id} accent="border-l-emerald-500" onEdit={() => setPayment({ open: true, item: p })} onDelete={() => confirmRemove(`/other-incomes/${p.id}/`)}>
                <div className="flex justify-between gap-2 text-sm">
                  <span>{p.date}{p.account_name ? <span className="text-muted-foreground"> · {p.account_name}</span> : null}</span>
                  <span className="font-mono tabular-nums">{formatMoney(p.amount)}</span>
                </div>
              </ItemRow>
            ))}
          </Section>

          <Section
            title={`${t("rental.expenses")} ${year} · ${formatMoney(sum(expenses))}`}
            action={<Button size="sm" variant="outline" onClick={() => setExpense({ open: true, item: null })}><Plus className="h-3.5 w-3.5 mr-1" />{t("rental.newExpense")}</Button>}
          >
            {expenses.length === 0 && <Empty text={t("rental.noExpenses")} />}
            {expenses.map((e) => (
              <ItemRow key={e.id} accent="border-l-amber-500" onEdit={() => setExpense({ open: true, item: e })} onDelete={() => confirmRemove(`/rental-expenses/${e.id}/`)}>
                <div className="flex justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{t(`rental.expense.${e.category}`)}{e.description ? <span className="text-muted-foreground"> · {e.description}</span> : null}</p>
                    <p className="text-xs text-muted-foreground">{e.date}</p>
                  </div>
                  <span className="font-mono tabular-nums shrink-0">{formatMoney(e.amount)}</span>
                </div>
              </ItemRow>
            ))}
          </Section>
        </div>
      )}

      {noTaxModule && <Card><CardContent className="py-4 text-sm text-muted-foreground">{t("rental.taxOnlySpain")}</CardContent></Card>}
      {!noTaxModule && overview && !entry && property && (
        <Card><CardContent className="py-4 text-sm text-muted-foreground">{t("rental.noLeaseThisYear", { year })}</CardContent></Card>
      )}
      {entry && (
        <>
          <RentalResultCard entry={entry} year={year} />
          <RentalSimulator key={`${entry.property.id}-${JSON.stringify(entry.projected.inputs)}`} base={entry.projected.inputs} />
          <p className="text-[11px] text-muted-foreground max-w-3xl">
            {t("rental.disclaimer", { base: formatMoney(overview!.other_general_base) })}
          </p>
        </>
      )}

      {property && (
        <>
          <PropertyTaxDialog open={taxOpen} onOpenChange={setTaxOpen} property={property} />
          <LeaseDialog open={lease.open} onOpenChange={(open) => setLease((s) => ({ ...s, open }))} propertyId={property.id} lease={lease.item} />
          <RentPaymentDialog
            open={payment.open}
            onOpenChange={(open) => setPayment((s) => ({ ...s, open }))}
            lease={activeLease}
            payment={payment.item}
            propertyName={property.name}
          />
          <RentalExpenseDialog open={expense.open} onOpenChange={(open) => setExpense((s) => ({ ...s, open }))} propertyId={property.id} expense={expense.item} />
        </>
      )}
    </div>
  );
}
