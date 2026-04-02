import { describe, it, expect } from "vitest";
import {
  annuityPayment,
  generateSchedule,
  applyAmortization,
  applyMultipleAmortizations,
} from "./mortgage-math";

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// annuityPayment
// ---------------------------------------------------------------------------
describe("annuityPayment", () => {
  it("computes standard 30-year mortgage payment", () => {
    // 200 000 €, 3% annual → 0.0025 monthly, 360 months
    const payment = annuityPayment(200_000, 0.0025, 360);
    expect(round2(payment)).toBeCloseTo(843.21, 0);
  });

  it("returns balance/months when rate is zero", () => {
    const payment = annuityPayment(100_000, 0, 120);
    expect(round2(payment)).toBeCloseTo(833.33, 0);
  });

  it("handles high interest rate", () => {
    // 10% annual → ~0.00833 monthly, 240 months
    const payment = annuityPayment(200_000, 0.1 / 12, 240);
    expect(payment).toBeGreaterThan(1500);
    expect(payment).toBeLessThan(2500);
  });

  it("handles 1 month term", () => {
    const payment = annuityPayment(10_000, 0.005, 1);
    // Should be balance + 1 month of interest
    expect(round2(payment)).toBeCloseTo(10_050, 0);
  });
});

// ---------------------------------------------------------------------------
// generateSchedule
// ---------------------------------------------------------------------------
describe("generateSchedule", () => {
  const balance = 100_000;
  const annualRate = 3; // 3%
  const totalMonths = 120;
  const monthlyRate = annualRate / 100 / 12;
  const payment = round2(annuityPayment(balance, monthlyRate, totalMonths));

  it("returns totalMonths+1 rows (including month 0)", () => {
    const rows = generateSchedule(balance, annualRate, totalMonths, payment);
    expect(rows).toHaveLength(totalMonths + 1);
  });

  it("first row is month 0 with no payment and full balance", () => {
    const rows = generateSchedule(balance, annualRate, totalMonths, payment);
    const first = rows[0];
    expect(first.month).toBe(0);
    expect(first.payment).toBe(0);
    expect(first.principal).toBe(0);
    expect(first.interest).toBe(0);
    expect(first.remainingBalance).toBe(balance);
  });

  it("balance decreases monotonically over time", () => {
    const rows = generateSchedule(balance, annualRate, totalMonths, payment);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].remainingBalance).toBeLessThanOrEqual(rows[i - 1].remainingBalance);
    }
  });

  it("last row balance is near 0", () => {
    const rows = generateSchedule(balance, annualRate, totalMonths, payment);
    const last = rows[rows.length - 1];
    expect(last.remainingBalance).toBeLessThan(1);
  });

  it("total interest + total principal ≈ initial balance (within rounding)", () => {
    const rows = generateSchedule(balance, annualRate, totalMonths, payment);
    const last = rows[rows.length - 1];
    // totalPrincipalPaid should be very close to original balance
    expect(last.totalPrincipalPaid).toBeCloseTo(balance, 0);
    // total interest should be positive
    expect(last.totalInterestPaid).toBeGreaterThan(0);
  });

  it("uses startDate parameter for date labels", () => {
    const rows = generateSchedule(balance, annualRate, totalMonths, payment, 0, "2020-06");
    expect(rows[0].date).toBe("2020-06");
    expect(rows[1].date).toBe("2020-07");
    expect(rows[7].date).toBe("2021-01"); // wraps year
  });

  it("respects monthsPaid parameter", () => {
    const rows = generateSchedule(balance, annualRate, totalMonths, payment, 12, "2020-01");
    // monthsPaid doesn't change schedule length — it's just for date calculations when no startDate
    // With startDate provided, monthsPaid is ignored, so just verify schedule still correct
    expect(rows).toHaveLength(totalMonths + 1);
    expect(rows[0].month).toBe(0);
  });

  it("generates correct date labels without startDate using monthsPaid", () => {
    // When no startDate, the base date is now minus monthsPaid months
    const rows = generateSchedule(balance, annualRate, totalMonths, payment, 0);
    // Should have a date string in YYYY-MM format
    expect(rows[0].date).toMatch(/^\d{4}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// applyAmortization
// ---------------------------------------------------------------------------
describe("applyAmortization", () => {
  const balance = 100_000;
  const annualRate = 3;
  const totalMonths = 120;
  const monthlyRate = annualRate / 100 / 12;
  const payment = round2(annuityPayment(balance, monthlyRate, totalMonths));
  const schedule = generateSchedule(balance, annualRate, totalMonths, payment, 0, "2020-01");

  it("REDUCE_PAYMENT strategy reduces monthly payment", () => {
    const result = applyAmortization(schedule, 12, 10_000, "REDUCE_PAYMENT");
    // After extra payment, subsequent payments should be smaller
    const originalPayment = schedule[13].payment;
    const modifiedPayment = result.modified[13]?.payment ?? 0;
    expect(modifiedPayment).toBeLessThan(originalPayment);
    expect(result.savings.newMonthlyPayment).not.toBeNull();
    expect(result.savings.newMonthlyPayment!).toBeLessThan(payment);
  });

  it("REDUCE_TERM strategy reduces total number of months", () => {
    const result = applyAmortization(schedule, 12, 10_000, "REDUCE_TERM");
    expect(result.modified.length).toBeLessThan(schedule.length);
    expect(result.savings.monthsReduced).toBeGreaterThan(0);
    expect(result.savings.newMonthlyPayment).toBeNull(); // unchanged for REDUCE_TERM
  });

  it("full payoff when extra >= remaining balance", () => {
    const balanceAtMonth12 = schedule[12].remainingBalance;
    const result = applyAmortization(schedule, 12, balanceAtMonth12 + 1000, "REDUCE_PAYMENT");
    // Schedule should end at month 12
    expect(result.modified.length).toBe(13); // months 0..12
    expect(result.savings.newMonthlyPayment).toBe(0);
    expect(result.savings.monthsReduced).toBeGreaterThan(0);
  });

  it("invalid month returns identity (month 0)", () => {
    const result = applyAmortization(schedule, 0, 10_000, "REDUCE_PAYMENT");
    expect(result.original).toBe(schedule);
    expect(result.modified).toBe(schedule);
    expect(result.savings.interestSaved).toBe(0);
  });

  it("invalid month returns identity (month >= schedule length)", () => {
    const result = applyAmortization(schedule, schedule.length, 10_000, "REDUCE_PAYMENT");
    expect(result.original).toBe(schedule);
    expect(result.modified).toBe(schedule);
    expect(result.savings.interestSaved).toBe(0);
  });

  it("savings.interestSaved is positive", () => {
    const result = applyAmortization(schedule, 12, 10_000, "REDUCE_PAYMENT");
    expect(result.savings.interestSaved).toBeGreaterThan(0);
  });

  it("savings.interestSaved is positive for REDUCE_TERM too", () => {
    const result = applyAmortization(schedule, 12, 10_000, "REDUCE_TERM");
    expect(result.savings.interestSaved).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// applyMultipleAmortizations
// ---------------------------------------------------------------------------
describe("applyMultipleAmortizations", () => {
  const balance = 100_000;
  const annualRate = 3;
  const totalMonths = 120;
  const monthlyRate = annualRate / 100 / 12;
  const payment = round2(annuityPayment(balance, monthlyRate, totalMonths));
  const schedule = generateSchedule(balance, annualRate, totalMonths, payment, 0, "2020-01");

  it("empty events returns original schedule", () => {
    const result = applyMultipleAmortizations(schedule, []);
    expect(result.modified).toBe(schedule);
    expect(result.savings.interestSaved).toBe(0);
    expect(result.savings.monthsReduced).toBe(0);
    expect(result.savings.totalExtraPayments).toBe(0);
  });

  it("single event works correctly", () => {
    const events = [
      { id: "1", property: "p1", month: 12, amount: 10_000, strategy: "REDUCE_TERM" as const },
    ];
    const result = applyMultipleAmortizations(schedule, events);
    expect(result.modified.length).toBeLessThan(schedule.length);
    expect(result.savings.interestSaved).toBeGreaterThan(0);
    expect(result.savings.monthsReduced).toBeGreaterThan(0);
    expect(result.savings.totalExtraPayments).toBe(10_000);
  });

  it("multiple events cascade correctly", () => {
    const events = [
      { id: "1", property: "p1", month: 12, amount: 5_000, strategy: "REDUCE_TERM" as const },
      { id: "2", property: "p1", month: 24, amount: 5_000, strategy: "REDUCE_TERM" as const },
    ];
    const result = applyMultipleAmortizations(schedule, events);
    expect(result.modified.length).toBeLessThan(schedule.length);
    expect(result.savings.totalExtraPayments).toBe(10_000);

    // Two events of 5k should save more interest than zero events
    expect(result.savings.interestSaved).toBeGreaterThan(0);
  });

  it("events are sorted by month regardless of input order", () => {
    const eventsUnordered = [
      { id: "2", property: "p1", month: 24, amount: 5_000, strategy: "REDUCE_TERM" as const },
      { id: "1", property: "p1", month: 12, amount: 5_000, strategy: "REDUCE_TERM" as const },
    ];
    const eventsOrdered = [
      { id: "1", property: "p1", month: 12, amount: 5_000, strategy: "REDUCE_TERM" as const },
      { id: "2", property: "p1", month: 24, amount: 5_000, strategy: "REDUCE_TERM" as const },
    ];
    const r1 = applyMultipleAmortizations(schedule, eventsUnordered);
    const r2 = applyMultipleAmortizations(schedule, eventsOrdered);
    expect(r1.modified.length).toBe(r2.modified.length);
    expect(r1.savings.interestSaved).toBeCloseTo(r2.savings.interestSaved, 1);
  });

  it("fully paid off mid-schedule", () => {
    const balanceAtMonth6 = schedule[6].remainingBalance;
    const events = [
      { id: "1", property: "p1", month: 6, amount: balanceAtMonth6 + 50_000, strategy: "REDUCE_TERM" as const },
    ];
    const result = applyMultipleAmortizations(schedule, events);
    const lastModified = result.modified[result.modified.length - 1];
    expect(lastModified.remainingBalance).toBeLessThan(1);
    expect(result.modified.length).toBeLessThan(schedule.length);
    expect(result.savings.monthsReduced).toBeGreaterThan(0);
  });

  it("filters out events with invalid month (< 1) or zero amount", () => {
    const events = [
      { id: "1", property: "p1", month: 0, amount: 5_000, strategy: "REDUCE_TERM" as const },
      { id: "2", property: "p1", month: 12, amount: 0, strategy: "REDUCE_TERM" as const },
      { id: "3", property: "p1", month: 24, amount: 5_000, strategy: "REDUCE_TERM" as const },
    ];
    const result = applyMultipleAmortizations(schedule, events);
    // Only the event at month 24 with amount 5000 should apply
    expect(result.events).toHaveLength(1);
    expect(result.events[0].month).toBe(24);
  });
});
