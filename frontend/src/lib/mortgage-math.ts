import type {
  AmortizationRow,
  AmortizationComparison,
  AmortizationEvent,
  MultiAmortizationResult,
  SimulationStrategy,
} from "@/types";

/**
 * Standard annuity payment formula.
 * P = B × r × (1+r)^n / ((1+r)^n − 1)
 */
export function annuityPayment(balance: number, monthlyRate: number, months: number): number {
  if (monthlyRate === 0) return balance / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return (balance * monthlyRate * factor) / (factor - 1);
}

/**
 * Generate a full month-by-month amortization schedule.
 */
export function generateSchedule(
  balance: number,
  annualRate: number,
  totalMonths: number,
  monthlyPayment: number,
  monthsPaid: number = 0,
  startDate?: string,
): AmortizationRow[] {
  const monthlyRate = annualRate / 100 / 12;
  const rows: AmortizationRow[] = [];

  // Determine the base date for labels
  let baseYear: number;
  let baseMonth: number; // 0-indexed
  if (startDate) {
    const [y, m] = startDate.split("-").map(Number);
    baseYear = y;
    baseMonth = m - 1;
  } else {
    const now = new Date();
    // Go back monthsPaid months from now
    const d = new Date(now.getFullYear(), now.getMonth() - monthsPaid, 1);
    baseYear = d.getFullYear();
    baseMonth = d.getMonth();
  }

  let remaining = balance;
  let totalInterestPaid = 0;
  let totalPrincipalPaid = 0;

  // Build schedule for the full loan life (from month 0)
  for (let i = 0; i <= totalMonths && remaining > 0.005; i++) {
    const dateMonth = (baseMonth + i) % 12;
    const dateYear = baseYear + Math.floor((baseMonth + i) / 12);
    const date = `${dateYear}-${String(dateMonth + 1).padStart(2, "0")}`;

    if (i === 0) {
      // Month 0 = loan start, no payment yet
      rows.push({
        month: i,
        date,
        payment: 0,
        principal: 0,
        interest: 0,
        remainingBalance: remaining,
        totalInterestPaid: 0,
        totalPrincipalPaid: 0,
      });
      continue;
    }

    const interest = remaining * monthlyRate;
    const principal = Math.min(monthlyPayment - interest, remaining);
    const payment = Math.min(monthlyPayment, remaining + interest);
    remaining = Math.max(0, remaining - principal);
    totalInterestPaid += interest;
    totalPrincipalPaid += principal;

    rows.push({
      month: i,
      date,
      payment: round2(payment),
      principal: round2(principal),
      interest: round2(interest),
      remainingBalance: round2(remaining),
      totalInterestPaid: round2(totalInterestPaid),
      totalPrincipalPaid: round2(totalPrincipalPaid),
    });
  }

  return rows;
}

/**
 * Apply an early amortization at a specific month and compute the comparison.
 * `atMonth` is relative to the schedule (not months_paid).
 */
export function applyAmortization(
  schedule: AmortizationRow[],
  atMonth: number,
  extraPayment: number,
  strategy: SimulationStrategy,
): AmortizationComparison {
  if (atMonth < 1 || atMonth >= schedule.length) {
    // Invalid month — return identity comparison
    return {
      original: schedule,
      modified: schedule,
      amortizationMonth: atMonth,
      extraPayment,
      strategy,
      savings: {
        interestSaved: 0,
        monthsReduced: 0,
        newMonthlyPayment: null,
        originalEndDate: schedule[schedule.length - 1]?.date ?? "",
        newEndDate: schedule[schedule.length - 1]?.date ?? "",
      },
    };
  }

  const annualRate = deriveAnnualRate(schedule);
  const monthlyRate = annualRate / 100 / 12;

  // Find the balance at the amortization month (before the extra payment)
  const rowAtMonth = schedule[atMonth];
  const balanceBeforeExtra = rowAtMonth.remainingBalance;
  const newBalance = Math.max(0, balanceBeforeExtra - extraPayment);

  // Copy schedule up to the amortization month unchanged
  const modified: AmortizationRow[] = schedule.slice(0, atMonth + 1).map((r) => ({ ...r }));
  // Adjust the balance at amortization month
  modified[atMonth] = { ...modified[atMonth], remainingBalance: round2(newBalance) };

  if (newBalance <= 0.005) {
    // Mortgage fully paid off
    const origLast = schedule[schedule.length - 1];
    const modLast = modified[modified.length - 1];
    return {
      original: schedule,
      modified,
      amortizationMonth: atMonth,
      extraPayment,
      strategy,
      savings: {
        interestSaved: round2(origLast.totalInterestPaid - modLast.totalInterestPaid),
        monthsReduced: schedule.length - 1 - atMonth,
        newMonthlyPayment: 0,
        originalEndDate: origLast.date,
        newEndDate: modLast.date,
      },
    };
  }

  // Determine remaining months from original schedule after amortization point
  const originalRemainingMonths = schedule.length - 1 - atMonth;

  let newPayment: number;
  let newRemainingMonths: number;

  if (strategy === "REDUCE_PAYMENT") {
    newRemainingMonths = originalRemainingMonths;
    newPayment = annuityPayment(newBalance, monthlyRate, newRemainingMonths);
  } else {
    // REDUCE_TERM: keep the same payment
    newPayment = schedule[atMonth].payment || schedule[atMonth - 1]?.payment || 0;
    if (monthlyRate === 0) {
      newRemainingMonths = Math.ceil(newBalance / newPayment);
    } else {
      const inner = 1 - (newBalance * monthlyRate) / newPayment;
      if (inner <= 0) {
        newRemainingMonths = originalRemainingMonths;
      } else {
        newRemainingMonths = Math.ceil(-Math.log(inner) / Math.log(1 + monthlyRate));
      }
    }
  }

  // Generate the remainder of the modified schedule
  let remaining = newBalance;
  let cumInterest = modified[atMonth].totalInterestPaid;
  let cumPrincipal = modified[atMonth].totalPrincipalPaid;

  // Get base date info from schedule
  const baseDate = schedule[0].date;
  const [baseY, baseM] = baseDate.split("-").map(Number);
  const baseMonth0 = baseM - 1; // 0-indexed

  for (let i = 1; i <= newRemainingMonths && remaining > 0.005; i++) {
    const absMonth = atMonth + i;
    const dateMonth = (baseMonth0 + absMonth) % 12;
    const dateYear = baseY + Math.floor((baseMonth0 + absMonth) / 12);
    const date = `${dateYear}-${String(dateMonth + 1).padStart(2, "0")}`;

    const interest = remaining * monthlyRate;
    const principal = Math.min(newPayment - interest, remaining);
    const payment = Math.min(newPayment, remaining + interest);
    remaining = Math.max(0, remaining - principal);
    cumInterest += interest;
    cumPrincipal += principal;

    modified.push({
      month: absMonth,
      date,
      payment: round2(payment),
      principal: round2(principal),
      interest: round2(interest),
      remainingBalance: round2(remaining),
      totalInterestPaid: round2(cumInterest),
      totalPrincipalPaid: round2(cumPrincipal),
    });
  }

  const origLast = schedule[schedule.length - 1];
  const modLast = modified[modified.length - 1];

  return {
    original: schedule,
    modified,
    amortizationMonth: atMonth,
    extraPayment,
    strategy,
    savings: {
      interestSaved: round2(origLast.totalInterestPaid - modLast.totalInterestPaid),
      monthsReduced: (schedule.length - 1) - (modified.length - 1),
      newMonthlyPayment: strategy === "REDUCE_PAYMENT" ? round2(newPayment) : null,
      originalEndDate: origLast.date,
      newEndDate: modLast.date,
    },
  };
}

/**
 * Apply multiple amortization events to a schedule.
 * Events are processed in chronological order, each cascading into the next.
 * Single forward pass — O(n) where n = schedule length.
 *
 * Pass `annualRate` when known: deriving it from the schedule uses the first month's
 * interest, already rounded to cents, and the small rate error accumulates over the
 * remaining months. The backend (`apps/realestate/mortgage.py`) uses the exact rate.
 */
export function applyMultipleAmortizations(
  schedule: AmortizationRow[],
  events: AmortizationEvent[],
  annualRate?: number,
): MultiAmortizationResult {
  if (events.length === 0) {
    const last = schedule[schedule.length - 1];
    return {
      original: schedule,
      modified: schedule,
      events: [],
      savings: {
        interestSaved: 0,
        monthsReduced: 0,
        totalExtraPayments: 0,
        originalEndDate: last?.date ?? "",
        newEndDate: last?.date ?? "",
      },
    };
  }

  // Sort events by month, filter valid ones
  const sorted = [...events]
    .filter((e) => e.month >= 1 && parseFloat(String(e.amount)) > 0)
    .sort((a, b) => a.month - b.month);

  const monthlyRate = (annualRate ?? deriveAnnualRate(schedule)) / 100 / 12;

  // Base date from schedule for computing dates of new months
  const baseDate = schedule[0].date;
  const [baseY, baseM] = baseDate.split("-").map(Number);
  const baseMonth0 = baseM - 1; // 0-indexed

  function computeDate(absMonth: number): string {
    const dm = (baseMonth0 + absMonth) % 12;
    const dy = baseY + Math.floor((baseMonth0 + absMonth) / 12);
    return `${dy}-${String(dm + 1).padStart(2, "0")}`;
  }

  // We'll walk forward generating the modified schedule
  const modified: AmortizationRow[] = [{ ...schedule[0] }]; // month 0

  let remaining = schedule[0].remainingBalance;
  let currentPayment = schedule[1]?.payment ?? 0;
  let cumInterest = 0;
  let cumPrincipal = 0;
  let eventIdx = 0;
  let currentMonth = 1;

  // For REDUCE_PAYMENT we need to know how many months remain from the
  // event point to the current expected end. We track the "target end month"
  // which starts as schedule.length - 1 and may shrink with REDUCE_TERM events.
  let targetEndMonth = schedule.length - 1;

  while (remaining > 0.005) {
    // Normal amortization step
    const interest = remaining * monthlyRate;
    const principal = Math.min(currentPayment - interest, remaining);
    const payment = Math.min(currentPayment, remaining + interest);
    remaining = Math.max(0, remaining - principal);
    cumInterest += interest;
    cumPrincipal += principal;

    modified.push({
      month: currentMonth,
      date: computeDate(currentMonth),
      payment: round2(payment),
      principal: round2(principal),
      interest: round2(interest),
      remainingBalance: round2(remaining),
      totalInterestPaid: round2(cumInterest),
      totalPrincipalPaid: round2(cumPrincipal),
    });

    // Check if there's an event at this month (after the regular payment)
    if (eventIdx < sorted.length && sorted[eventIdx].month === currentMonth) {
      const event = sorted[eventIdx];
      const eventAmount = parseFloat(String(event.amount));
      const extraPrincipal = Math.min(eventAmount, remaining);
      remaining = Math.max(0, remaining - extraPrincipal);
      cumPrincipal += extraPrincipal;

      // Update the current row to reflect the extra payment
      const lastRow = modified[modified.length - 1];
      modified[modified.length - 1] = {
        ...lastRow,
        principal: round2(lastRow.principal + extraPrincipal),
        remainingBalance: round2(remaining),
        totalPrincipalPaid: round2(cumPrincipal),
      };

      if (remaining <= 0.005) {
        // Mortgage fully paid off by this event
        eventIdx++;
        break;
      }

      // Recalculate based on strategy
      if (event.strategy === "REDUCE_PAYMENT") {
        const monthsLeft = targetEndMonth - currentMonth;
        if (monthsLeft > 0) {
          currentPayment = annuityPayment(remaining, monthlyRate, monthsLeft);
        } else {
          // Schedule already shortened past this point — pay remaining in one
          currentPayment = remaining + remaining * monthlyRate;
        }
      } else {
        // REDUCE_TERM: keep currentPayment, targetEndMonth shrinks naturally
        // (the loop will terminate when remaining hits 0)
        // Recalculate targetEndMonth for future REDUCE_PAYMENT events
        if (monthlyRate === 0) {
          targetEndMonth = currentMonth + Math.ceil(remaining / currentPayment);
        } else {
          const inner = 1 - (remaining * monthlyRate) / currentPayment;
          if (inner > 0) {
            targetEndMonth = currentMonth + Math.ceil(-Math.log(inner) / Math.log(1 + monthlyRate));
          }
        }
      }

      eventIdx++;
    }

    // Safety: prevent infinite loops (max 600 months = 50 years)
    if (currentMonth > 600) break;

    // For REDUCE_PAYMENT, cap at targetEndMonth
    if (currentMonth >= targetEndMonth && remaining <= 0.005) break;

    currentMonth++;
  }

  const origLast = schedule[schedule.length - 1];
  const modLast = modified[modified.length - 1];
  const totalExtra = sorted.reduce((sum, e) => sum + parseFloat(String(e.amount)), 0);

  return {
    original: schedule,
    modified,
    events: sorted,
    savings: {
      interestSaved: round2(origLast.totalInterestPaid - modLast.totalInterestPaid),
      monthsReduced: (schedule.length - 1) - (modified.length - 1),
      totalExtraPayments: round2(totalExtra),
      originalEndDate: origLast.date,
      newEndDate: modLast.date,
    },
  };
}

/** Derive the annual interest rate from the first payment in the schedule. */
function deriveAnnualRate(schedule: AmortizationRow[]): number {
  for (let i = 1; i < schedule.length; i++) {
    const row = schedule[i];
    if (row.payment > 0 && row.remainingBalance > 0) {
      const prevBalance = schedule[i - 1].remainingBalance;
      if (prevBalance > 0) {
        const monthlyRate = row.interest / prevBalance;
        return monthlyRate * 12 * 100;
      }
    }
  }
  return 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
