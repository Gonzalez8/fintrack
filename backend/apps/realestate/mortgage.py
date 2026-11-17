"""Current state of a mortgage — the server-side twin of ``frontend/src/lib/mortgage-math.ts``.

The web builds schedules client-side for its interactive simulator, but the API (and
everything that reads it: the MCP, reports) must give the same answer as the screen.
``Property.months_paid`` and ``outstanding_balance`` are only a snapshot taken when the
property was saved, so here the elapsed months are recomputed from the purchase date
and early amortizations (``Amortization`` rows) are applied exactly as the client does:

- without amortizations, the closed-form French-amortization balance;
- with amortizations, a month-by-month pass where each extra payment either keeps the
  payment and shortens the term (``REDUCE_TERM``) or keeps the term and lowers the
  payment (``REDUCE_PAYMENT``). A balance that reaches zero means the mortgage is
  finished.

Keep both implementations in sync when the mortgage logic changes.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
ZERO = Decimal("0")
EPS = Decimal("0.005")
MAX_MONTHS = 600  # same safety cap as the client


def round2(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def months_elapsed(start: date, today: date) -> int:
    """Whole months from ``start`` to ``today`` (same rule as the property form)."""
    return max(0, (today.year - start.year) * 12 + (today.month - start.month))


def add_months(start: date, months: int) -> str:
    total = start.month - 1 + months
    return f"{start.year + total // 12}-{total % 12 + 1:02d}"


def annuity_payment(balance: Decimal, monthly_rate: Decimal, months: int) -> Decimal:
    if monthly_rate == 0:
        return balance / months
    factor = (1 + monthly_rate) ** months
    return balance * monthly_rate * factor / (factor - 1)


def closed_form_balance(principal: Decimal, monthly_rate: Decimal, term: int, months_paid: int) -> Decimal:
    """Remaining balance after ``months_paid`` regular payments (French amortization)."""
    if term <= 0 or months_paid >= term:
        return ZERO
    if monthly_rate == 0:
        return max(ZERO, principal - principal / term * months_paid)
    factor = (1 + monthly_rate) ** term
    factor_paid = (1 + monthly_rate) ** months_paid
    return max(ZERO, principal * (factor - factor_paid) / (factor - 1))


def _months_to_repay(remaining: Decimal, monthly_rate: Decimal, payment: Decimal) -> int | None:
    if monthly_rate == 0:
        return int((remaining / payment).to_integral_value(rounding=ROUND_CEILING))
    inner = 1 - remaining * monthly_rate / payment
    if inner <= 0:
        return None
    return int((-inner.ln() / (1 + monthly_rate).ln()).to_integral_value(rounding=ROUND_CEILING))


@dataclass(frozen=True)
class MortgageState:
    status: str  # "NONE" | "ACTIVE" | "FINISHED"
    months_paid: int | None = None  # payments actually made: stops when the mortgage ends
    months_elapsed: int | None = None  # calendar months since the start (capped at the term)
    outstanding_balance: Decimal | None = None
    current_monthly_payment: Decimal | None = None
    end_month: int | None = None  # schedule month of the last payment
    end_date: str | None = None  # YYYY-MM, when the purchase date is known
    extra_amortizations: Decimal | None = None


def _schedule_with_amortizations(
    principal: Decimal, monthly_rate: Decimal, term: int, payment: Decimal, events: list
) -> tuple[dict[int, Decimal], dict[int, Decimal], int]:
    """Month-by-month pass applying extra payments.

    Returns ``(balance_after_month, payment_of_month, last_month)``.
    """
    # Regular schedule: its length is the target end for REDUCE_PAYMENT events
    remaining, target_end = principal, 0
    for month in range(1, term + 1):
        if remaining <= EPS:
            break
        interest = remaining * monthly_rate
        remaining = max(ZERO, remaining - min(payment - interest, remaining))
        target_end = month
    first_payment = round2(min(payment, principal + principal * monthly_rate))

    pending = sorted((e for e in events if e.month >= 1 and e.amount > 0), key=lambda e: e.month)
    balances: dict[int, Decimal] = {0: principal}
    payments: dict[int, Decimal] = {}
    remaining, current_payment, month, idx = principal, first_payment, 1, 0
    while remaining > EPS and month <= MAX_MONTHS:
        interest = remaining * monthly_rate
        payments[month] = round2(min(current_payment, remaining + interest))
        remaining = max(ZERO, remaining - min(current_payment - interest, remaining))

        if idx < len(pending) and pending[idx].month == month:
            event = pending[idx]
            idx += 1
            remaining = max(ZERO, remaining - min(event.amount, remaining))
            if remaining > EPS:
                if event.strategy == "REDUCE_PAYMENT":
                    months_left = target_end - month
                    current_payment = (
                        annuity_payment(remaining, monthly_rate, months_left)
                        if months_left > 0
                        else remaining + remaining * monthly_rate
                    )
                else:  # REDUCE_TERM keeps the payment; the end moves forward
                    repay = _months_to_repay(remaining, monthly_rate, current_payment)
                    if repay is not None:
                        target_end = month + repay
        balances[month] = remaining
        month += 1
    return balances, payments, max(balances)


def mortgage_state(prop, amortizations, today: date) -> MortgageState:
    """State of ``prop``'s mortgage on ``today`` (see the module docstring)."""
    if prop.original_loan_amount is None or not prop.total_term_months or not prop.monthly_payment:
        return MortgageState(status="NONE")

    principal = prop.original_loan_amount
    monthly_rate = (prop.annual_interest_rate or ZERO) / 100 / 12
    term = prop.total_term_months
    if prop.purchase_date:
        elapsed = min(months_elapsed(prop.purchase_date, today), term)
    else:
        elapsed = min(prop.months_paid or 0, term)
    events = list(amortizations)
    extra = sum((e.amount for e in events), ZERO)

    if not events:
        balance = closed_form_balance(principal, monthly_rate, term, elapsed)
        end_month = term
        next_payment = prop.monthly_payment
    else:
        balances, payments, end_month = _schedule_with_amortizations(
            principal, monthly_rate, term, prop.monthly_payment, events
        )
        balance = ZERO if elapsed >= end_month else balances[elapsed]
        next_payment = payments.get(elapsed + 1, ZERO)

    finished = balance <= EPS
    return MortgageState(
        status="FINISHED" if finished else "ACTIVE",
        months_paid=min(elapsed, end_month),
        months_elapsed=elapsed,
        outstanding_balance=ZERO if finished else round2(balance),
        current_monthly_payment=ZERO if finished else round2(next_payment),
        end_month=end_month,
        end_date=add_months(prop.purchase_date, end_month) if prop.purchase_date else None,
        extra_amortizations=round2(extra),
    )
