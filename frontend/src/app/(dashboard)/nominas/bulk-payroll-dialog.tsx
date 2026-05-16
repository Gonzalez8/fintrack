"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";

import { api, ApiClientError, extractApiErrorMessage } from "@/lib/api-client";
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
import { useTranslations } from "@/i18n/use-translations";
import { PAYROLL_TYPES } from "@/types";
import type {
  BulkPayrollCreateErrorResponse,
  BulkPayrollCreateResponse,
  Employer,
  PayrollFormData,
  PayrollPdfSuggestion,
  PayrollType,
} from "@/types";

type RowStatus = "parsing" | "ready" | "error";

interface RowState {
  id: string;
  filename: string;
  status: RowStatus;
  errorMessage?: string;
  form: PayrollFormData;
  serverErrors: Record<string, string[]> | null;
}

function lastDayOfMonth(yyyyMmDd: string): string {
  if (!yyyyMmDd) return "";
  const [y, m] = yyyyMmDd.split("-").map(Number);
  if (!y || !m) return "";
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function emptyFormForFile(filename: string): PayrollFormData {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  return {
    period_start: start,
    period_end: lastDayOfMonth(start),
    concept: filename.replace(/\.pdf$/i, "").trim() || "Mensual",
    payroll_type: "MONTHLY",
    employer: "",
    gross: "",
    ss_employee: "0",
    irpf_withholding: "0",
    net: "",
  };
}

function findMatchingEmployer(
  suggestion: PayrollPdfSuggestion,
  employers: Employer[],
): string {
  const cif = suggestion.suggested.employer_cif?.trim();
  const name = suggestion.suggested.employer_name?.trim();
  if (cif) {
    const byCif = employers.find(
      (e) => e.cif && e.cif.toUpperCase() === cif.toUpperCase(),
    );
    if (byCif) return byCif.id;
  }
  if (name) {
    const byName = employers.find(
      (e) => e.name.toLowerCase() === name.toLowerCase(),
    );
    if (byName) return byName.id;
  }
  return "";
}

function applySuggestion(
  filename: string,
  suggestion: PayrollPdfSuggestion,
  employers: Employer[],
): PayrollFormData {
  const base = emptyFormForFile(filename);
  const s = suggestion.suggested;
  return {
    ...base,
    period_start: s.period_start ?? base.period_start,
    period_end: s.period_end ?? base.period_end,
    // Filename always wins for the concept; user can edit per-row anyway.
    concept: base.concept,
    // The backend already inferred a payroll_type from the parsed concept;
    // pass it through so each row lands pre-classified.
    payroll_type: s.payroll_type,
    employer: findMatchingEmployer(suggestion, employers),
    gross: s.gross ?? base.gross,
    ss_employee: s.ss_employee ?? base.ss_employee,
    irpf_withholding: s.irpf_withholding ?? base.irpf_withholding,
    net: s.net ?? base.net,
    base_irpf: s.base_irpf ?? undefined,
    base_cc: s.base_cc ?? undefined,
    employer_cost: s.employer_cost ?? undefined,
  };
}

export function BulkPayrollDialog({
  open,
  onOpenChange,
  files,
  employers,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  files: File[];
  employers: Employer[];
}) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  const [rows, setRows] = useState<RowState[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const parsedKeyRef = useRef<string | null>(null);

  // Parse all uploaded files in parallel on mount / files change. Each PDF
  // produces a row; failures still produce a row with the filename as
  // concept and empty importes — the user can still complete it manually
  // or remove it from the batch.
  useEffect(() => {
    if (!open || files.length === 0) return;
    const key = files.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join("|");
    if (parsedKeyRef.current === key) return;
    parsedKeyRef.current = key;

    const initial: RowState[] = files.map((f, i) => ({
      id: `${i}-${f.name}`,
      filename: f.name,
      status: "parsing",
      form: emptyFormForFile(f.name),
      serverErrors: null,
    }));
    setRows(initial);

    files.forEach((file, i) => {
      const fd = new FormData();
      fd.append("file", file);
      api
        .upload<PayrollPdfSuggestion>("/payrolls/parse-pdf/", fd)
        .then((suggestion) => {
          setRows((prev) =>
            prev.map((r, idx) =>
              idx === i
                ? {
                    ...r,
                    status: "ready",
                    form: applySuggestion(file.name, suggestion, employers),
                  }
                : r,
            ),
          );
        })
        .catch((err) => {
          const is422 = err instanceof ApiClientError && err.status === 422;
          setRows((prev) =>
            prev.map((r, idx) =>
              idx === i
                ? {
                    ...r,
                    status: is422 ? "ready" : "error",
                    errorMessage: is422
                      ? t("payroll.pdfNotRecognized")
                      : extractApiErrorMessage(err, t("common.error")),
                  }
                : r,
            ),
          );
        });
    });
  }, [files, open, employers, t]);

  // Reset state when closing the dialog so re-opening starts clean.
  useEffect(() => {
    if (!open) {
      setRows([]);
      parsedKeyRef.current = null;
      setSubmitting(false);
    }
  }, [open]);

  const stats = useMemo(() => {
    const parsing = rows.filter((r) => r.status === "parsing").length;
    const ready = rows.filter((r) => r.status === "ready").length;
    const error = rows.filter((r) => r.status === "error").length;
    return { parsing, ready, error };
  }, [rows]);

  function updateRow(id: string, patch: Partial<PayrollFormData>) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, form: { ...r.form, ...patch }, serverErrors: null } : r,
      ),
    );
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function rowIsSubmittable(r: RowState): boolean {
    if (r.status === "error") return false;
    return Boolean(r.form.gross && r.form.net && r.form.employer);
  }

  async function submit() {
    const submittable = rows.filter(rowIsSubmittable);
    if (submittable.length === 0) {
      toast.error(t("payroll.bulkNoRowsReady"));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        payrolls: submittable.map((r) => ({
          period_start: r.form.period_start,
          period_end: r.form.period_end,
          concept: r.form.concept,
          payroll_type: r.form.payroll_type,
          employer: r.form.employer,
          gross: r.form.gross,
          ss_employee: r.form.ss_employee || "0",
          irpf_withholding: r.form.irpf_withholding || "0",
          net: r.form.net,
          ...(r.form.base_irpf ? { base_irpf: r.form.base_irpf } : {}),
          ...(r.form.base_cc ? { base_cc: r.form.base_cc } : {}),
          ...(r.form.employer_cost ? { employer_cost: r.form.employer_cost } : {}),
          notes: r.form.notes ?? "",
        })),
      };
      const res = await api.post<BulkPayrollCreateResponse>(
        "/payrolls/bulk-create/",
        payload,
      );
      queryClient.invalidateQueries({ queryKey: ["payrolls"], refetchType: "active" });
      toast.success(t("payroll.bulkCreated", { count: String(res.created.length) }));
      onOpenChange(false);
    } catch (err) {
      // Bulk-create returns { errors: [...] } on validation failure; map
      // them back to each submittable row so we can highlight inline.
      if (err instanceof ApiClientError && err.status === 400) {
        try {
          const body = JSON.parse(err.body) as BulkPayrollCreateErrorResponse;
          if (Array.isArray(body.errors)) {
            const submittable = rows.filter(rowIsSubmittable);
            const errorsByRowId = new Map<string, Record<string, string[]>>();
            submittable.forEach((r, idx) => {
              const e = body.errors[idx];
              if (e) errorsByRowId.set(r.id, e);
            });
            setRows((prev) =>
              prev.map((r) => ({
                ...r,
                serverErrors: errorsByRowId.get(r.id) ?? null,
              })),
            );
            toast.error(t("payroll.bulkSomeFailed"));
            return;
          }
        } catch {
          // fall through to generic toast
        }
      }
      toast.error(extractApiErrorMessage(err, t("common.errorSaving")));
    } finally {
      setSubmitting(false);
    }
  }

  const submittableCount = rows.filter(rowIsSubmittable).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {t("payroll.bulkTitle", { count: String(rows.length) })}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          {t("payroll.bulkSubtitle")}
        </p>

        {stats.parsing > 0 && (
          <p className="text-xs text-amber-500">
            {t("payroll.bulkParsing", { count: String(stats.parsing) })}
          </p>
        )}

        <div className="flex-1 overflow-y-auto space-y-3 -mx-2 px-2">
          {rows.map((row) => (
            <BulkRow
              key={row.id}
              row={row}
              employers={employers}
              onChange={(patch) => updateRow(row.id, patch)}
              onRemove={() => removeRow(row.id)}
            />
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || submittableCount === 0 || stats.parsing > 0}
          >
            {submitting
              ? t("common.creating")
              : t("payroll.bulkCreateButton", { count: String(submittableCount) })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkRow({
  row,
  employers,
  onChange,
  onRemove,
}: {
  row: RowState;
  employers: Employer[];
  onChange: (patch: Partial<PayrollFormData>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations();
  const { form } = row;

  const mismatch = useMemo(() => {
    const g = parseFloat(form.gross || "0");
    const s = parseFloat(form.ss_employee || "0");
    const i = parseFloat(form.irpf_withholding || "0");
    const n = parseFloat(form.net || "0");
    if (!form.gross || !form.net) return null;
    const delta = g - s - i - n;
    if (Math.abs(delta) <= 0.02) return null;
    return delta.toFixed(2);
  }, [form]);

  const serverErrorMessage = row.serverErrors
    ? Object.values(row.serverErrors).flat()[0]
    : null;

  return (
    <div
      className={`border rounded-md p-3 space-y-2 ${
        row.serverErrors ? "border-destructive/60 bg-destructive/[0.04]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-muted-foreground truncate">
            {row.filename}
          </p>
          {row.status === "error" && (
            <p className="text-xs text-destructive flex items-center gap-1 mt-0.5">
              <AlertTriangle className="h-3 w-3" /> {row.errorMessage}
            </p>
          )}
          {serverErrorMessage && (
            <p className="text-xs text-destructive flex items-center gap-1 mt-0.5">
              <AlertTriangle className="h-3 w-3" /> {serverErrorMessage}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          title={t("payroll.bulkRemoveRow")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("payroll.concept")}</Label>
          <Input
            value={form.concept}
            onChange={(e) => onChange({ concept: e.target.value })}
            maxLength={120}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("payroll.type")}</Label>
          <Select
            value={form.payroll_type}
            onValueChange={(v) =>
              onChange({ payroll_type: v as PayrollType })
            }
          >
            <SelectTrigger>
              <span data-slot="select-value" className="text-xs">
                {t(`payroll.type.${form.payroll_type}` as const)}
              </span>
            </SelectTrigger>
            <SelectContent>
              {PAYROLL_TYPES.map((pt) => (
                <SelectItem key={pt} value={pt}>
                  {t(`payroll.type.${pt}` as const)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("payroll.periodStart")}</Label>
          <Input
            type="date"
            value={form.period_start}
            onChange={(e) => onChange({ period_start: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("payroll.periodEnd")}</Label>
          <Input
            type="date"
            value={form.period_end}
            onChange={(e) => onChange({ period_end: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("payroll.employer")}</Label>
          <Select
            value={form.employer}
            onValueChange={(v) =>
              onChange({ employer: v ? String(v) : "" })
            }
          >
            <SelectTrigger>
              <span data-slot="select-value" className="text-xs">
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
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("payroll.gross")}</Label>
          <Input
            type="number"
            step="0.01"
            value={form.gross}
            onChange={(e) => onChange({ gross: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("payroll.ssEmployee")}</Label>
          <Input
            type="number"
            step="0.01"
            value={form.ss_employee}
            onChange={(e) => onChange({ ss_employee: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("payroll.irpfWithholding")}</Label>
          <Input
            type="number"
            step="0.01"
            value={form.irpf_withholding}
            onChange={(e) => onChange({ irpf_withholding: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("payroll.net")}</Label>
          <Input
            type="number"
            step="0.01"
            value={form.net}
            onChange={(e) => onChange({ net: e.target.value })}
          />
        </div>
      </div>

      {mismatch !== null && (
        <p className="text-xs text-amber-500">
          {t("payroll.mismatchWarning", { delta: mismatch })}
        </p>
      )}
    </div>
  );
}
