"""Spanish estimate for a simulated sale (base del ahorro). Approximate by design: it uses only what Fintrack
knows this year (realized gains with the fiscal cost method, gross dividends and interests) and ignores losses
carried over from earlier years and anything outside Fintrack.
"""

import calendar
import datetime
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Sum

from apps.portfolio.services import calculate_realized_pnl_fiscal
from apps.transactions.models import Dividend, Interest, Transaction

# Escala del ahorro (2025 onwards): upper limit of each bracket, rate %
SAVINGS_SCALE = (
    (Decimal("6000"), 19),
    (Decimal("50000"), 21),
    (Decimal("200000"), 23),
    (Decimal("300000"), 27),
    (None, 30),
)
# Net capital losses may offset up to 25 % of the capital income (dividends, interests) of the same year
LOSS_OFFSET_SHARE = Decimal("0.25")
# Two-month rule for listed securities (art. 33.5 LIRPF): a loss is deferred if the same security is bought
# within two months before or after the sale
WASH_MONTHS = 2
CENT = Decimal("0.01")


def savings_tax(base: Decimal) -> Decimal:
    tax, lower = Decimal("0"), Decimal("0")
    for upper, rate in SAVINGS_SCALE:
        if base <= lower:
            break
        top = base if upper is None else min(base, upper)
        tax += (top - lower) * rate / 100
        if upper is None:
            break
        lower = upper
    return tax


def savings_base(gains: Decimal, income: Decimal) -> Decimal:
    """Base del ahorro from the year's net capital gains and capital income (losses offset up to 25 %)."""
    if gains >= 0:
        return gains + income
    return income - min(-gains, income * LOSS_OFFSET_SHARE)


def _add_months(day: datetime.date, months: int) -> datetime.date:
    month = day.month - 1 + months
    year, month = day.year + month // 12, month % 12 + 1
    return day.replace(year=year, month=month, day=min(day.day, calendar.monthrange(year, month)[1]))


def estimate_sale_tax(user, asset, gain: Decimal, today: datetime.date) -> dict:
    year = today.year
    gains_ytd = sum(
        (
            Decimal(s["realized_pnl"])
            for s in calculate_realized_pnl_fiscal(user)["realized_sales"]
            if s["date"][:4] == str(year)
        ),
        Decimal("0"),
    )
    dividends = Dividend.objects.filter(owner=user, date__year=year).aggregate(t=Sum("gross"))["t"] or Decimal("0")
    interests = Interest.objects.filter(owner=user, date_end__year=year).aggregate(t=Sum("gross"))["t"] or Decimal("0")
    income_ytd = dividends + interests

    tax_before = savings_tax(savings_base(gains_ytd, income_ytd))
    tax_after = savings_tax(savings_base(gains_ytd + gain, income_ytd))

    wash = None
    if gain < 0:
        since = _add_months(today, -WASH_MONTHS)
        recent = Transaction.objects.filter(
            owner=user, asset=asset, type=Transaction.TransactionType.BUY, date__gte=since, date__lte=today
        ).order_by("date")
        wash = {
            "recent_buys": [{"date": t.date.isoformat(), "quantity": str(t.quantity)} for t in recent],
            "rebuy_until": _add_months(today, WASH_MONTHS).isoformat(),
        }

    return {
        "country": "ES",
        "year": year,
        "gains_ytd": str(gains_ytd.quantize(CENT, rounding=ROUND_HALF_UP)),
        "income_ytd": str(income_ytd.quantize(CENT, rounding=ROUND_HALF_UP)),
        "tax_before": str(tax_before.quantize(CENT, rounding=ROUND_HALF_UP)),
        "tax_after": str(tax_after.quantize(CENT, rounding=ROUND_HALF_UP)),
        # Extra tax this sale adds to the year (negative: the loss lowers the year's tax)
        "tax_sale": str((tax_after - tax_before).quantize(CENT, rounding=ROUND_HALF_UP)),
        "wash_sale": wash,
    }
