"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Home, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SwipeCard } from "@/components/app/swipe-card";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import { PropertyFormDialog } from "@/components/app/property-form-dialog";
import { MortgageSummaryHeader } from "@/components/app/mortgage-summary-header";
import { MortgageTimelineChart } from "@/components/app/mortgage-timeline-chart";
import { PaymentBreakdownChart } from "@/components/app/payment-breakdown-chart";
import { AmortizationTable } from "@/components/app/amortization-table";
import { annuityPayment, generateSchedule, applyMultipleAmortizations } from "@/lib/mortgage-math";
import type { Property, AmortizationEvent, SimulationStrategy } from "@/types";

/**
 * Compute the real current outstanding balance for a property with a mortgage,
 * based on the original loan, rate, term, and months paid.
 * This is always accurate regardless of when the property was saved.
 */
function computeCurrentBalance(p: Property): number {
  if (!p.has_mortgage || !p.original_loan_amount) return 0;
  const principal = parseFloat(p.original_loan_amount);
  const rate = parseFloat(p.annual_interest_rate ?? "0");
  const monthlyRate = rate / 100 / 12;
  const totalMonths = p.total_term_months ?? 0;
  const monthsPaid = Math.min(p.months_paid ?? 0, totalMonths);
  if (totalMonths <= 0) return 0;
  if (monthsPaid >= totalMonths) return 0;
  if (monthlyRate === 0) {
    return Math.max(0, principal - (principal / totalMonths) * monthsPaid);
  }
  const factor = Math.pow(1 + monthlyRate, totalMonths);
  const factorPaid = Math.pow(1 + monthlyRate, monthsPaid);
  return Math.max(0, principal * (factor - factorPaid) / (factor - 1));
}

interface PropertiesResponse {
  count: number;
  results: Property[];
}

interface AmortizationsResponse {
  count: number;
  results: AmortizationEvent[];
}

export function PropertiesTab() {
  const t = useTranslations();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProperty, setEditProperty] = useState<Property | null>(null);

  // Detail view state — store only the ID, derive the property from fresh API data
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: () => api.get<PropertiesResponse>("/properties/"),
    staleTime: 5 * 60_000,
  });

  // Fetch ALL amortization events (needed for debt calculation of all properties)
  const { data: allEventsData } = useQuery({
    queryKey: ["amortizations"],
    queryFn: () => api.get<AmortizationsResponse>("/amortizations/"),
    staleTime: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/properties/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      if (selectedId) setSelectedId(null);
    },
    onError: () => {
      toast.error(t("common.errorDeleting"));
    },
  });

  const properties = data?.results ?? [];

  // Derive the selected property from fresh API data so edits are reflected immediately
  const selectedProperty = useMemo(
    () => (selectedId ? properties.find((p) => p.id === selectedId) ?? null : null),
    [selectedId, properties],
  );

  // ── Schedule & amortization for selected property ──
  const schedule = useMemo(() => {
    if (!selectedProperty?.has_mortgage) return null;
    return generateSchedule(
      parseFloat(selectedProperty.original_loan_amount!),
      parseFloat(selectedProperty.annual_interest_rate!),
      selectedProperty.total_term_months!,
      parseFloat(selectedProperty.monthly_payment!),
      selectedProperty.months_paid!,
    );
  }, [selectedProperty]);

  const allEvents = allEventsData?.results ?? [];

  // Events for the selected property
  const events = useMemo(
    () => allEvents.filter((e) => e.property === selectedProperty?.id),
    [allEvents, selectedProperty?.id],
  );

  const multiResult = useMemo(() => {
    if (!schedule || events.length === 0) return null;
    return applyMultipleAmortizations(schedule, events);
  }, [schedule, events]);

  const monthsPaidNum = selectedProperty?.months_paid ?? 0;

  // ── Compute real current debt for each property (with amortizations) ──
  const propertyDebts = useMemo(() => {
    const debts = new Map<string, number>();
    for (const p of properties) {
      if (!p.has_mortgage || !p.original_loan_amount) {
        debts.set(p.id, 0);
        continue;
      }
      const loan = parseFloat(p.original_loan_amount);
      const rate = parseFloat(p.annual_interest_rate ?? "0");
      const term = p.total_term_months ?? 0;
      const payment = parseFloat(p.monthly_payment ?? "0");
      const mp = p.months_paid ?? 0;
      if (term <= 0 || payment <= 0) {
        debts.set(p.id, 0);
        continue;
      }
      const propEvents = allEvents.filter((e) => e.property === p.id);
      if (propEvents.length === 0) {
        // No amortizations — use formula
        if (mp >= term) {
          debts.set(p.id, 0);
        } else {
          debts.set(p.id, computeCurrentBalance(p));
        }
      } else {
        // Has amortizations — generate schedule and apply them
        const sched = generateSchedule(loan, rate, term, payment, mp);
        const result = applyMultipleAmortizations(sched, propEvents);
        const active = result.modified;
        const lastMonth = active[active.length - 1]?.month ?? 0;
        if (mp >= lastMonth) {
          debts.set(p.id, 0);
        } else {
          const row = active[mp];
          debts.set(p.id, row?.remainingBalance ?? 0);
        }
      }
    }
    return debts;
  }, [properties, allEvents]);

  const totalValue = properties.reduce((sum, p) => sum + parseFloat(p.current_value), 0);
  const totalDebt = properties.reduce((sum, p) => sum + (propertyDebts.get(p.id) ?? 0), 0);
  const totalEquity = totalValue - totalDebt;

  // Helper to get real debt and equity for any property
  const getDebt = (p: Property) => propertyDebts.get(p.id) ?? 0;
  const getEquity = (p: Property) => parseFloat(p.current_value) - getDebt(p);

  // ── Event CRUD (API-persisted with optimistic updates) ──
  const eventsQueryKey = ["amortizations"];

  const addEventMutation = useMutation({
    mutationFn: (data: { month: number; amount: number; strategy: SimulationStrategy }) =>
      api.post("/amortizations/", {
        property: selectedProperty!.id,
        month: data.month,
        amount: data.amount.toFixed(2),
        strategy: data.strategy,
      }),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: eventsQueryKey });
      const prev = qc.getQueryData<AmortizationsResponse>(eventsQueryKey);
      const optimistic: AmortizationEvent = {
        id: crypto.randomUUID(),
        property: selectedProperty!.id,
        month: data.month,
        amount: data.amount.toFixed(2),
        strategy: data.strategy,
      };
      qc.setQueryData<AmortizationsResponse>(eventsQueryKey, (old) => ({
        count: (old?.count ?? 0) + 1,
        results: [...(old?.results ?? []), optimistic],
      }));
      return { prev };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.prev) qc.setQueryData(eventsQueryKey, ctx.prev);
      toast.error(t("common.error"));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: eventsQueryKey }),
  });

  const editEventMutation = useMutation({
    mutationFn: (data: { id: string; amount: number; strategy: SimulationStrategy }) =>
      api.put(`/amortizations/${data.id}/`, {
        property: selectedProperty!.id,
        month: events.find((e) => e.id === data.id)?.month,
        amount: data.amount.toFixed(2),
        strategy: data.strategy,
      }),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: eventsQueryKey });
      const prev = qc.getQueryData<AmortizationsResponse>(eventsQueryKey);
      qc.setQueryData<AmortizationsResponse>(eventsQueryKey, (old) => ({
        count: old?.count ?? 0,
        results: (old?.results ?? []).map((e) =>
          e.id === data.id ? { ...e, amount: data.amount.toFixed(2), strategy: data.strategy } : e,
        ),
      }));
      return { prev };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.prev) qc.setQueryData(eventsQueryKey, ctx.prev);
      toast.error(t("common.error"));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: eventsQueryKey }),
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/amortizations/${id}/`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: eventsQueryKey });
      const prev = qc.getQueryData<AmortizationsResponse>(eventsQueryKey);
      qc.setQueryData<AmortizationsResponse>(eventsQueryKey, (old) => ({
        count: Math.max(0, (old?.count ?? 0) - 1),
        results: (old?.results ?? []).filter((e) => e.id !== id),
      }));
      return { prev };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.prev) qc.setQueryData(eventsQueryKey, ctx.prev);
      toast.error(t("common.error"));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: eventsQueryKey }),
  });

  const addEvent = (month: number, amount: number, strategy: SimulationStrategy) => {
    if (events.some((e) => e.month === month)) return;
    addEventMutation.mutate({ month, amount, strategy });
  };

  const editEvent = (id: string, amount: number, strategy: SimulationStrategy) => {
    editEventMutation.mutate({ id, amount, strategy });
  };

  const deleteEvent = (id: string) => {
    deleteEventMutation.mutate(id);
  };

  // ── Handlers ──
  const handleEdit = (property: Property) => {
    setEditProperty(property);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditProperty(null);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm(t("properties.deleteConfirm"))) {
      deleteMutation.mutate(id);
    }
  };

  const handleSelectProperty = (property: Property) => {
    if (selectedId === property.id) {
      setSelectedId(null); // toggle off
    } else {
      setSelectedId(property.id);
      setShowBreakdown(false);
    }
  };

  const handleChartMonthSelect = (month: number) => {
    // If event exists at this month, do nothing (table handles editing)
    if (!events.some((e) => e.month === month)) {
      // We could open the table form here, but since the table is interactive,
      // clicking the chart is a hint — the user can then click the row in the table
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground text-sm">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      {properties.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-3 pb-3 px-4 flex items-center justify-between sm:block">
              <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider sm:mb-1">
                {t("properties.totalValue")}
              </p>
              <p className="font-mono text-base sm:text-lg font-bold tabular-nums">
                {formatMoney(totalValue.toFixed(2))}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 px-4 flex items-center justify-between sm:block">
              <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider sm:mb-1">
                {t("properties.totalDebt")}
              </p>
              <p className="font-mono text-base sm:text-lg font-bold tabular-nums text-red-500">
                {formatMoney(totalDebt.toFixed(2))}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 px-4 flex items-center justify-between sm:block">
              <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider sm:mb-1">
                {t("properties.totalEquity")}
              </p>
              <p className="font-mono text-base sm:text-lg font-bold tabular-nums text-emerald-500">
                {formatMoney(totalEquity.toFixed(2))}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
          {t("properties.tabProperties")}
        </p>
        <Button className="hidden sm:flex" size="sm" onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-1" />
          {t("properties.addProperty")}
        </Button>
      </div>

      {/* Empty state */}
      {properties.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {t("properties.noProperties")}
          </CardContent>
        </Card>
      )}

      {/* Mobile: SwipeCard list */}
      <div className="sm:hidden space-y-2">
        {properties.map((property) => (
          <SwipeCard
            key={property.id}
            onTap={() => handleSelectProperty(property)}
            onEdit={() => handleEdit(property)}
            onDelete={() => handleDelete(property.id)}
            accentColor={selectedProperty?.id === property.id ? "border-l-primary" : "border-l-emerald-500"}
          >
            <div className="flex items-center gap-2 mb-1">
              <Home className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">{property.name}</span>
            </div>
            <div className="font-mono text-lg font-bold tabular-nums">
              {formatMoney(property.current_value)}
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-muted-foreground">
              <span>{t("properties.netEquity")}: {formatMoney(getEquity(property))}</span>
              {property.has_mortgage && (
                <span className="text-red-400">
                  {t("properties.outstandingBalance")}: {formatMoney(getDebt(property))}
                </span>
              )}
            </div>
          </SwipeCard>
        ))}
      </div>

      {/* Desktop: Card grid */}
      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {properties.map((property) => {
          const isSelected = selectedProperty?.id === property.id;
          return (
            <Card
              key={property.id}
              className={`cursor-pointer transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "hover:border-primary/50"
              }`}
              onClick={() => handleSelectProperty(property)}
            >
              <CardContent className="pt-4 pb-4 px-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Home className="h-5 w-5 text-muted-foreground" />
                    <span className="font-semibold text-sm">{property.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEdit(property); }}
                      className="p-1 rounded hover:bg-secondary transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(property.id); }}
                      className="p-1 rounded hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                    </button>
                  </div>
                </div>
                <div className="font-mono text-lg font-bold tabular-nums mb-1">
                  {formatMoney(property.current_value)}
                </div>
                <p className="text-xs font-mono text-emerald-500 mb-1">
                  {t("properties.netEquity")}: {formatMoney(getEquity(property))}
                </p>
                {property.has_mortgage && (
                  <>
                    <p className="text-xs font-mono text-muted-foreground">
                      {t("properties.outstandingBalance")}: {formatMoney(getDebt(property))}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground">
                      {t("properties.monthlyPayment")}: {formatMoney(property.monthly_payment)} · {property.annual_interest_rate}%
                    </p>
                  </>
                )}
                {!property.has_mortgage && (
                  <p className="text-xs font-mono text-muted-foreground">
                    {t("properties.noMortgage")}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Property Detail View (Mortgage) ── */}
      {selectedProperty && schedule && (
        <div className="space-y-6 pt-2 border-t">
          {/* Back button */}
          <button
            onClick={() => setSelectedId(null)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("properties.backToList")}
          </button>

          {/* Summary header */}
          <MortgageSummaryHeader
            property={selectedProperty}
            schedule={schedule}
            multiResult={multiResult}
          />

          {/* Timeline chart */}
          <MortgageTimelineChart
            schedule={schedule}
            modifiedSchedule={multiResult?.modified}
            currentMonth={monthsPaidNum}
            events={events}
            onMonthSelect={handleChartMonthSelect}
          />

          {/* Interactive amortization table */}
          <AmortizationTable
            schedule={schedule}
            modifiedSchedule={multiResult?.modified}
            currentMonth={monthsPaidNum}
            events={events}
            onAddEvent={addEvent}
            onEditEvent={editEvent}
            onDeleteEvent={deleteEvent}
          />

          {/* Payment breakdown (collapsible) */}
          <div>
            <button
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
            >
              {showBreakdown ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showBreakdown ? t("properties.hideBreakdown") : t("properties.showBreakdown")}
            </button>
            {showBreakdown && (
              <PaymentBreakdownChart
                schedule={multiResult?.modified ?? schedule}
                originalSchedule={schedule}
                currentMonth={monthsPaidNum}
                events={events}
              />
            )}
          </div>
        </div>
      )}

      {/* Detail for non-mortgage property */}
      {selectedProperty && !selectedProperty.has_mortgage && (
        <div className="space-y-4 pt-2 border-t">
          <button
            onClick={() => setSelectedId(null)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("properties.backToList")}
          </button>
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              {t("properties.noMortgage")}
            </CardContent>
          </Card>
        </div>
      )}

      {/* FAB mobile */}
      <button
        className="fixed bottom-24 right-5 z-40 sm:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
        onClick={handleCreate}
        aria-label={t("properties.addProperty")}
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Form dialog */}
      <PropertyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        property={editProperty}
      />
    </div>
  );
}
