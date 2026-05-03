"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { DataTable, type Column } from "@/components/app/data-table";
import { MoneyCell } from "@/components/app/money-cell";
import { SwipeCard } from "@/components/app/swipe-card";
import { DetailDrawer } from "@/components/app/detail-drawer";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import type {
  Employer,
  EmployerFormData,
  PaginatedResponse,
  Payroll,
  PayrollFormData,
} from "@/types";

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => String(currentYear - 5 + i));

function lastDayOfMonth(yyyyMmDd: string): string {
  if (!yyyyMmDd) return "";
  const [y, m] = yyyyMmDd.split("-").map(Number);
  if (!y || !m) return "";
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function emptyForm(): PayrollFormData {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  return {
    period_start: start,
    period_end: lastDayOfMonth(start),
    employer: "",
    gross: "",
    ss_employee: "0",
    irpf_withholding: "0",
    net: "",
  };
}

export function NominasContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const t = useTranslations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Payroll | null>(null);
  const [detailItem, setDetailItem] = useState<Payroll | null>(null);

  const yearFilter = searchParams.get("year") || "";
  const employerFilter = searchParams.get("employer") || "";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`?${params.toString()}`, { scroll: false });
  }

  const { data: employersData } = useQuery({
    queryKey: ["employers"],
    queryFn: () => api.get<PaginatedResponse<Employer>>("/employers/"),
  });
  const employers = employersData?.results ?? [];

  const { data } = useQuery({
    queryKey: ["payrolls", yearFilter, employerFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      if (yearFilter) p.set("year", yearFilter);
      if (employerFilter) p.set("employer_id", employerFilter);
      return api.get<PaginatedResponse<Payroll>>(`/payrolls/?${p}`);
    },
  });
  const payrolls = data?.results ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/payrolls/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payrolls"], refetchType: "active" });
      toast.success(t("common.deleted"));
    },
    onError: () => toast.error(t("common.errorDeleting")),
  });

  const columns: Column<Payroll>[] = [
    {
      key: "period",
      header: t("payroll.period"),
      render: (p) => (
        <span className="font-mono text-xs">
          {p.period_start} → {p.period_end}
        </span>
      ),
    },
    {
      key: "employer",
      header: t("payroll.employer"),
      render: (p) => <span className="text-sm font-medium">{p.employer_name}</span>,
    },
    {
      key: "gross",
      header: t("payroll.gross"),
      className: "text-right",
      render: (p) => <MoneyCell value={p.gross} />,
    },
    {
      key: "ss",
      header: t("payroll.ssEmployee"),
      className: "text-right",
      render: (p) => <MoneyCell value={p.ss_employee} />,
    },
    {
      key: "irpf",
      header: t("payroll.irpfWithholding"),
      className: "text-right",
      render: (p) => (
        <span title={p.irpf_rate ? `${p.irpf_rate}%` : undefined}>
          <MoneyCell value={p.irpf_withholding} />
        </span>
      ),
    },
    {
      key: "net",
      header: t("payroll.net"),
      className: "text-right",
      render: (p) => <MoneyCell value={p.net} colored />,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (p) => (
        <div className="flex gap-1 justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(p);
              setDialogOpen(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Eliminar?")) deleteMutation.mutate(p.id);
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
      <h1 className="text-lg font-semibold">{t("payroll.title")}</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Select
          value={yearFilter || "all"}
          onValueChange={(v) => setParam("year", v === "all" || !v ? "" : String(v))}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <span data-slot="select-value">{yearFilter || t("common.all")}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {YEAR_OPTIONS.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={employerFilter || "all"}
          onValueChange={(v) => setParam("employer", v === "all" || !v ? "" : String(v))}
        >
          <SelectTrigger className="w-full sm:w-[220px]">
            <span data-slot="select-value">
              {employers.find((e) => e.id === employerFilter)?.name || t("common.all")}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {employers.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          className="hidden sm:flex"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">{t("common.new")}</span>
        </Button>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {payrolls.map((p) => (
          <SwipeCard
            key={p.id}
            onTap={() => setDetailItem(p)}
            onEdit={() => {
              setEditing(p);
              setDialogOpen(true);
            }}
            onDelete={() => {
              if (confirm("Eliminar?")) deleteMutation.mutate(p.id);
            }}
            accentColor="border-l-cyan-500"
          >
            <div className="space-y-1">
              <div className="flex justify-between items-start">
                <p className="text-sm font-medium">{p.employer_name}</p>
                <span className="text-xs text-muted-foreground">
                  {p.period_start} → {p.period_end}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("payroll.gross")}</span>
                <span className="font-mono tabular-nums">{formatMoney(p.gross)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("payroll.irpfWithholding")}</span>
                <span className="font-mono tabular-nums">
                  {formatMoney(p.irpf_withholding)}
                  {p.irpf_rate && (
                    <span className="text-xs text-muted-foreground ml-1">
                      ({p.irpf_rate}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span>{t("payroll.net")}</span>
                <span className="font-mono tabular-nums">{formatMoney(p.net)}</span>
              </div>
            </div>
          </SwipeCard>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block">
        <DataTable
          columns={columns}
          data={payrolls}
          keyFn={(p) => p.id}
          emptyMessage={t("payroll.empty")}
        />
      </div>

      {/* FAB (mobile) */}
      <Button
        className="sm:hidden fixed bottom-24 right-5 h-12 w-12 rounded-full shadow-lg"
        onClick={() => {
          setEditing(null);
          setDialogOpen(true);
        }}
      >
        <Plus className="h-6 w-6" />
      </Button>

      {dialogOpen && (
        <PayrollDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          payroll={editing}
          employers={employers}
        />
      )}

      {detailItem &&
        (() => {
          const di = detailItem;
          return (
            <DetailDrawer
              open
              onOpenChange={(v) => {
                if (!v) setDetailItem(null);
              }}
              title={di.employer_name ?? ""}
              subtitle={`${di.period_start} → ${di.period_end}`}
              rows={[
                { label: t("payroll.gross"), value: formatMoney(di.gross) },
                { label: t("payroll.ssEmployee"), value: formatMoney(di.ss_employee) },
                {
                  label: t("payroll.irpfWithholding"),
                  value: `${formatMoney(di.irpf_withholding)}${di.irpf_rate ? ` (${di.irpf_rate}%)` : ""}`,
                },
                { label: t("payroll.net"), value: formatMoney(di.net) },
                ...(di.base_irpf
                  ? [{ label: t("payroll.baseIrpf"), value: formatMoney(di.base_irpf) }]
                  : []),
                ...(di.base_cc
                  ? [{ label: t("payroll.baseCc"), value: formatMoney(di.base_cc) }]
                  : []),
                ...(di.employer_cost
                  ? [
                      {
                        label: t("payroll.employerCost"),
                        value: formatMoney(di.employer_cost),
                      },
                    ]
                  : []),
              ]}
            />
          );
        })()}
    </div>
  );
}

function PayrollDialog({
  open,
  onOpenChange,
  payroll,
  employers,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payroll: Payroll | null;
  employers: Employer[];
}) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  const [form, setForm] = useState<PayrollFormData>(() => {
    if (payroll) {
      return {
        period_start: payroll.period_start,
        period_end: payroll.period_end,
        employer: payroll.employer,
        gross: payroll.gross,
        ss_employee: payroll.ss_employee,
        irpf_withholding: payroll.irpf_withholding,
        net: payroll.net,
        base_irpf: payroll.base_irpf ?? "",
        base_cc: payroll.base_cc ?? "",
        employer_cost: payroll.employer_cost ?? "",
        notes: payroll.notes,
      };
    }
    return emptyForm();
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [employerDialogOpen, setEmployerDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Auto-fill period_end when period_start changes (last day of that month)
  function handlePeriodStartChange(value: string) {
    setForm((f) => ({
      ...f,
      period_start: value,
      period_end: f.period_end || lastDayOfMonth(value),
    }));
  }

  // Conciliation warning — informational only, never blocks save
  function getMismatch(): string | null {
    const g = parseFloat(form.gross || "0");
    const s = parseFloat(form.ss_employee || "0");
    const i = parseFloat(form.irpf_withholding || "0");
    const n = parseFloat(form.net || "0");
    if (!form.gross || !form.net) return null;
    const expected = g - s - i;
    const delta = expected - n;
    if (Math.abs(delta) <= 0.02) return null;
    return delta.toFixed(2);
  }

  async function submit() {
    setLoading(true);
    try {
      const payload: Record<string, string | undefined> = {
        period_start: form.period_start,
        period_end: form.period_end,
        employer: form.employer,
        gross: form.gross,
        ss_employee: form.ss_employee || "0",
        irpf_withholding: form.irpf_withholding || "0",
        net: form.net,
        notes: form.notes,
      };
      if (form.base_irpf) payload.base_irpf = form.base_irpf;
      if (form.base_cc) payload.base_cc = form.base_cc;
      if (form.employer_cost) payload.employer_cost = form.employer_cost;

      if (payroll) {
        await api.put(`/payrolls/${payroll.id}/`, payload);
      } else {
        await api.post("/payrolls/", payload);
      }
      queryClient.invalidateQueries({ queryKey: ["payrolls"], refetchType: "active" });
      toast.success(t("common.success"));
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("common.errorSaving");
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const mismatch = getMismatch();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{payroll ? t("payroll.edit") : t("payroll.new")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Period */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("payroll.periodStart")}</Label>
                <Input
                  type="date"
                  value={form.period_start}
                  onChange={(e) => handlePeriodStartChange(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("payroll.periodEnd")}</Label>
                <Input
                  type="date"
                  value={form.period_end}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, period_end: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Employer */}
            <div className="space-y-1.5">
              <Label>{t("payroll.employer")}</Label>
              <div className="flex gap-2">
                <Select
                  value={form.employer || undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, employer: v ? String(v) : "" }))}
                >
                  <SelectTrigger className="flex-1">
                    <span data-slot="select-value">
                      {employers.find((e) => e.id === form.employer)?.name ||
                        t("payroll.employerPlaceholder")}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {employers.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEmployerDialogOpen(true)}
                >
                  + {t("payroll.employerNew")}
                </Button>
              </div>
            </div>

            {/* Amounts */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("payroll.gross")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.gross}
                  onChange={(e) => setForm((f) => ({ ...f, gross: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("payroll.ssEmployee")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.ss_employee}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ss_employee: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("payroll.irpfWithholding")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.irpf_withholding}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, irpf_withholding: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("payroll.net")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.net}
                  onChange={(e) => setForm((f) => ({ ...f, net: e.target.value }))}
                />
              </div>
            </div>

            {mismatch !== null && (
              <p className="text-xs text-amber-500">
                {t("payroll.mismatchWarning", { delta: mismatch })}
              </p>
            )}

            {/* Advanced — collapsible */}
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline"
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              {advancedOpen ? t("payroll.advancedHide") : t("payroll.advancedShow")}
            </button>
            {advancedOpen && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                <div className="space-y-1.5">
                  <Label>{t("payroll.baseIrpf")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.base_irpf ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, base_irpf: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("payroll.baseCc")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.base_cc ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, base_cc: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>{t("payroll.employerCost")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.employer_cost ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, employer_cost: e.target.value }))
                    }
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={submit}
                disabled={
                  loading || !form.gross || !form.net || !form.employer
                }
              >
                {payroll ? t("common.save") : t("common.create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {employerDialogOpen && (
        <EmployerDialog
          open={employerDialogOpen}
          onOpenChange={setEmployerDialogOpen}
          onCreated={(e) => setForm((f) => ({ ...f, employer: e.id }))}
        />
      )}
    </>
  );
}

function EmployerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (e: Employer) => void;
}) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form, setForm] = useState<EmployerFormData>({ name: "", cif: "" });
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const created = await api.post<Employer>("/employers/", form);
      queryClient.invalidateQueries({ queryKey: ["employers"], refetchType: "active" });
      toast.success(t("common.success"));
      onCreated(created);
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("common.errorSaving");
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("payroll.employerNew")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("payroll.employerName")}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("payroll.employerCif")}</Label>
            <Input
              value={form.cif}
              onChange={(e) => setForm((f) => ({ ...f, cif: e.target.value }))}
              placeholder="B00000000"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submit} disabled={loading || !form.name}>
              {t("common.create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
