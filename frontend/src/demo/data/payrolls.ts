import type { Payroll } from "@/types";

const EMPLOYER_ID = "f1000000-0001-4000-f000-000000000001";
const EMPLOYER_NAME = "ACME DEMO S.L.";
const EMPLOYER_CIF = "B12345678";

function makePayroll(year: number, month: number, gross: number): Payroll {
  // Realistic-ish proportions: ss ~6%, irpf ~28% (mid-bracket).
  const ss = Math.round(gross * 0.0602 * 100) / 100;
  const irpf = Math.round(gross * 0.2886 * 100) / 100;
  const net = Math.round((gross - ss - irpf) * 100) / 100;
  const lastDay = new Date(year, month, 0).getDate();
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const irpfRate = ((irpf / gross) * 100).toFixed(2);

  return {
    id: `f2000000-${year}${String(month).padStart(2, "0")}-4000-f000-000000000001`,
    period_start: periodStart,
    period_end: periodEnd,
    concept: "Mensual",
    employer: EMPLOYER_ID,
    employer_name: EMPLOYER_NAME,
    employer_cif: EMPLOYER_CIF,
    gross: gross.toFixed(2),
    ss_employee: ss.toFixed(2),
    irpf_withholding: irpf.toFixed(2),
    irpf_rate: irpfRate,
    net: net.toFixed(2),
    base_irpf: gross.toFixed(2),
    base_cc: (gross * 0.92).toFixed(2),
    employer_cost: (gross * 1.32).toFixed(2),
    notes: "",
    net_mismatch: "0.00",
    created_at: `${periodEnd}T10:00:00Z`,
    updated_at: `${periodEnd}T10:00:00Z`,
  };
}

// 12 months of 2025 + 6 months of 2026 (Jan–Jun) so demo users always see
// data spanning more than one fiscal year.
export const demoPayrolls: Payroll[] = [
  ...Array.from({ length: 12 }, (_, i) => makePayroll(2025, i + 1, 5500)),
  ...Array.from({ length: 6 }, (_, i) => makePayroll(2026, i + 1, 5523.4)),
].sort((a, b) => (a.period_end < b.period_end ? 1 : -1));
