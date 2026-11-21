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


def year_context(user, year: int) -> tuple[Decimal, Decimal]:
    """This year's net realized gains (fiscal cost method) and gross capital income (dividends + interests)."""
    gains = sum(
        (
            Decimal(s["realized_pnl"])
            for s in calculate_realized_pnl_fiscal(user)["realized_sales"]
            if s["date"][:4] == str(year)
        ),
        Decimal("0"),
    )
    dividends = Dividend.objects.filter(owner=user, date__year=year).aggregate(t=Sum("gross"))["t"] or Decimal("0")
    interests = Interest.objects.filter(owner=user, date_end__year=year).aggregate(t=Sum("gross"))["t"] or Decimal("0")
    return gains, dividends + interests


def loss_offset(gains_ytd: Decimal, income_ytd: Decimal, loss: Decimal) -> dict[str, Decimal]:
    """Where a new loss goes: this year's gains first, then up to 25 % of capital income (minus what earlier losses
    already used), and the rest is carried forward to the next four years."""
    against_gains = min(loss, max(gains_ytd, Decimal("0")))
    rest = loss - against_gains
    cap_left = income_ytd * LOSS_OFFSET_SHARE - min(max(-gains_ytd, Decimal("0")), income_ytd * LOSS_OFFSET_SHARE)
    against_income = min(rest, max(cap_left, Decimal("0")))
    return {"gains": against_gains, "income": against_income, "carried_forward": rest - against_income}


def tax_effect(gains_ytd: Decimal, income_ytd: Decimal, gain: Decimal) -> dict:
    """Extra tax a sale with this gain adds to the year (negative: what a loss saves) and, for a loss, its offset."""
    before = savings_tax(savings_base(gains_ytd, income_ytd))
    after = savings_tax(savings_base(gains_ytd + gain, income_ytd))
    data = {
        "tax_before": _cents(before),
        "tax_after": _cents(after),
        # Negative: the loss lowers the year's tax by that much
        "tax_sale": _cents(after - before),
        "loss_offset": None,
    }
    if gain < 0:
        data["loss_offset"] = {k: _cents(v) for k, v in loss_offset(gains_ytd, income_ytd, -gain).items()}
    return data


def wash_sale(user, asset, today: datetime.date) -> dict:
    """Two-month rule for a loss: buys of the asset in the last two months, and until when a rebuy would defer it."""
    since = _add_months(today, -WASH_MONTHS)
    recent = Transaction.objects.filter(
        owner=user, asset=asset, type=Transaction.TransactionType.BUY, date__gte=since, date__lte=today
    ).order_by("date")
    return {
        "recent_buys": [{"date": t.date.isoformat(), "quantity": str(t.quantity)} for t in recent],
        "rebuy_until": _add_months(today, WASH_MONTHS).isoformat(),
    }


def _cents(value: Decimal) -> str:
    return str(value.quantize(CENT, rounding=ROUND_HALF_UP))


def estimate_sale_tax(user, asset, gain: Decimal, today: datetime.date) -> dict:
    gains_ytd, income_ytd = year_context(user, today.year)
    return {
        "country": "ES",
        "year": today.year,
        "gains_ytd": _cents(gains_ytd),
        "income_ytd": _cents(income_ytd),
        **tax_effect(gains_ytd, income_ytd, gain),
        "wash_sale": wash_sale(user, asset, today) if gain < 0 else None,
    }


def _tax_delta(gains_ytd: Decimal, income_ytd: Decimal, gain: Decimal) -> Decimal:
    return savings_tax(savings_base(gains_ytd + gain, income_ytd)) - savings_tax(savings_base(gains_ytd, income_ytd))


def loss_harvest(user, candidates: list[dict], selected: set, today: datetime.date) -> dict:
    """Tax side of the loss-harvesting card. ``candidates``: ``{"asset", "loss"}`` (loss > 0) of positions that would
    be sold at a loss today; ``selected``: asset ids the user ticked. The year's context is read once."""
    gains_ytd, income_ytd = year_context(user, today.year)
    per_asset = {
        str(c["asset"].pk): {
            "tax_saving": _cents(-_tax_delta(gains_ytd, income_ytd, -c["loss"])),
            "wash_sale": wash_sale(user, c["asset"], today),
        }
        for c in candidates
    }
    every = sum((c["loss"] for c in candidates), Decimal("0"))
    chosen = sum((c["loss"] for c in candidates if str(c["asset"].pk) in selected), Decimal("0"))
    return {
        "country": "ES",
        "year": today.year,
        "gains_ytd": _cents(gains_ytd),
        "income_ytd": _cents(income_ytd),
        "per_asset": per_asset,
        # Saving if every candidate were sold: the most this year can give
        "max_saving": _cents(-_tax_delta(gains_ytd, income_ytd, -every)),
        "selection": {
            "loss": _cents(chosen),
            "tax_saving": _cents(-_tax_delta(gains_ytd, income_ytd, -chosen)),
            "loss_offset": {k: _cents(v) for k, v in loss_offset(gains_ytd, income_ytd, chosen).items()},
        },
    }
