import calendar
import logging
from bisect import bisect_right
from datetime import date
from decimal import Decimal

from django.db.models import F, Sum
from django.db.models.functions import Coalesce, ExtractYear
from django.utils import timezone

from apps.payroll.models import Payroll
from apps.portfolio.services import calculate_realized_pnl_fiscal
from apps.transactions.models import Dividend, Interest, OtherIncome

logger = logging.getLogger(__name__)


def _default_year(y):
    return {
        "year": y,
        "dividends_gross": "0",
        "dividends_tax": "0",
        "dividends_tax_domestic": "0",
        "dividends_net": "0",
        "interests_gross": "0",
        "interests_net": "0",
        "realized_pnl": "0",
        "payroll_gross": "0",
        "payroll_net": "0",
        "total_income": "0",
        "total_with_payroll": "0",
    }


def year_summary(user):
    dividend_by_year = (
        Dividend.objects.filter(owner=user)
        .annotate(year=ExtractYear("date"))
        .values("year")
        .annotate(
            total_gross=Sum("gross"),
            total_tax=Sum("tax"),
            total_domestic=Sum("domestic_tax"),
            total_net=Sum("net"),
        )
        .order_by("year")
    )

    interest_by_year = (
        Interest.objects.filter(owner=user)
        .annotate(year=ExtractYear("date_end"))
        .values("year")
        .annotate(total_gross=Sum("gross"), total_net=Sum("net"))
        .order_by("year")
    )

    # Mirror the Modo Renta / fiscal-tab convention: "gross subject" is
    # base_irpf when present, otherwise gross. That's what AEAT considers
    # rendimientos dinerarios sujetos for the Renta.
    payroll_by_year = (
        Payroll.objects.filter(owner=user)
        .annotate(year=ExtractYear("period_end"))
        .values("year")
        .annotate(
            total_gross=Sum(Coalesce(F("base_irpf"), F("gross"))),
            total_net=Sum("net"),
        )
        .order_by("year")
    )

    years = {}
    for d in dividend_by_year:
        y = d["year"]
        years.setdefault(y, _default_year(y))
        years[y]["dividends_gross"] = str(d["total_gross"] or Decimal("0"))
        # dividends_tax is everything withheld (origin + domestic); the domestic part is also reported apart
        domestic = d["total_domestic"] or Decimal("0")
        years[y]["dividends_tax"] = str((d["total_tax"] or Decimal("0")) + domestic)
        years[y]["dividends_tax_domestic"] = str(domestic)
        years[y]["dividends_net"] = str(d["total_net"] or Decimal("0"))

    for i in interest_by_year:
        y = i["year"]
        years.setdefault(y, _default_year(y))
        years[y]["interests_gross"] = str(i["total_gross"] or Decimal("0"))
        years[y]["interests_net"] = str(i["total_net"] or Decimal("0"))

    for p in payroll_by_year:
        y = p["year"]
        years.setdefault(y, _default_year(y))
        years[y]["payroll_gross"] = str(p["total_gross"] or Decimal("0"))
        years[y]["payroll_net"] = str(p["total_net"] or Decimal("0"))

    realized = calculate_realized_pnl_fiscal(user)
    sales_by_year = {}
    for sale in realized["realized_sales"]:
        y = int(sale["date"][:4])
        sales_by_year.setdefault(y, Decimal("0"))
        sales_by_year[y] += Decimal(sale["realized_pnl"])

    for y, pnl in sales_by_year.items():
        years.setdefault(y, _default_year(y))
        years[y]["realized_pnl"] = str(pnl)

    for y in years.values():
        investments = Decimal(y["dividends_net"]) + Decimal(y["interests_net"]) + Decimal(y["realized_pnl"])
        y["total_income"] = str(investments)
        y["total_with_payroll"] = str(investments + Decimal(y["payroll_net"]))

    return sorted(years.values(), key=lambda x: x["year"])


def rv_evolution(user):
    from apps.assets.models import PortfolioSnapshot

    snapshots = (
        PortfolioSnapshot.objects.filter(owner=user)
        .order_by("captured_at")
        .values("captured_at", "total_market_value", "total_cost", "total_unrealized_pnl")
    )

    return [
        {
            "captured_at": snap["captured_at"].isoformat(),
            "value": str(snap["total_market_value"]),
            "cost": str(snap["total_cost"] or 0),
            "pnl": str(snap["total_unrealized_pnl"] or 0),
        }
        for snap in snapshots
        if snap["total_market_value"] > 0
    ]


def investment_cost_evolution(user):
    """Money invested (cost of open positions) at the end of each month, from the first operation to today.

    ``delta`` is the change in the month: buys add their cost, sales remove the cost of the lots sold.
    ``market_value`` is what those positions were worth then: the month's last portfolio snapshot (today's value
    for the current month), null for months without one.
    """
    from apps.assets.models import PortfolioSnapshot
    from apps.portfolio.services import calculate_portfolio, investment_cost_timeline

    timeline = investment_cost_timeline(user)
    if not timeline:
        return []

    value_by_month = {}
    for captured_at, value in (
        PortfolioSnapshot.objects.filter(owner=user)
        .order_by("captured_at")
        .values_list("captured_at", "total_market_value")
    ):
        value_by_month[timezone.localtime(captured_at).strftime("%Y-%m")] = value  # the month's last one wins

    cents = Decimal("0.01")
    cost_by_month = {day.strftime("%Y-%m"): cost for day, cost in timeline}
    today = timezone.localdate()
    year, month = timeline[0][0].year, timeline[0][0].month
    cost = Decimal("0")
    previous = Decimal("0")
    points = []
    while (year, month) <= (today.year, today.month):
        key = f"{year:04d}-{month:02d}"
        cost = cost_by_month.get(key, cost)
        if (year, month) == (today.year, today.month):
            value = Decimal(calculate_portfolio(user)["totals"]["total_market_value"])
        else:
            value = value_by_month.get(key)
        points.append(
            {
                "month": key,
                "cost": str(cost.quantize(cents)),
                "delta": str((cost - previous).quantize(cents)),
                "market_value": None if value is None else str(value.quantize(cents)),
            }
        )
        previous = cost
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return points


def patrimonio_evolution(user):
    from apps.assets.models import AccountSnapshot, PortfolioSnapshot
    from apps.portfolio.services import calculate_portfolio
    from apps.transactions.models import Transaction

    EQUITY_TYPES = {"STOCK", "ETF", "CRYPTO"}

    account_balances = {}
    monthly_cash = {}
    photo_dates = {}

    for snap in AccountSnapshot.objects.filter(owner=user).order_by("date").values("account_id", "date", "balance"):
        month_key = snap["date"].strftime("%Y-%m")
        account_balances[snap["account_id"]] = snap["balance"]
        monthly_cash[month_key] = sum(account_balances.values(), Decimal("0"))
        photo_dates[month_key] = snap["date"]

    monthly_portfolio = {}
    for snap in (
        PortfolioSnapshot.objects.filter(owner=user)
        .order_by("captured_at")
        .values("captured_at", "batch_id", "total_market_value", "total_cost", "total_unrealized_pnl")
    ):
        month_key = snap["captured_at"].strftime("%Y-%m")
        monthly_portfolio[month_key] = snap

    if not monthly_portfolio and not monthly_cash:
        return []

    running_cost = Decimal("0")
    tx_cost_by_month = {}
    # Cash that operations moved into (+) or out of (−) investments, cumulative per day
    invested_cash = Decimal("0")
    flow_dates: list = []
    flow_totals: list = []

    for tx in (
        Transaction.objects.filter(owner=user)
        .order_by("date", "created_at")
        .values("date", "type", "quantity", "price", "commission", "tax")
    ):
        month_key = tx["date"].strftime("%Y-%m")
        qty = tx["quantity"] or Decimal("0")
        price = tx["price"] or Decimal("0")
        commission = tx["commission"] or Decimal("0")
        tax = tx["tax"] or Decimal("0")
        if tx["type"] in ("BUY", "GIFT"):
            running_cost += qty * price + commission
        elif tx["type"] == "SELL":
            running_cost -= qty * price - commission
        tx_cost_by_month[month_key] = running_cost
        if tx["type"] == "BUY":
            invested_cash += qty * price + commission + tax
        elif tx["type"] == "SELL":
            invested_cash -= qty * price - commission - tax
        if flow_dates and flow_dates[-1] == tx["date"]:
            flow_totals[-1] = invested_cash
        else:
            flow_dates.append(tx["date"])
            flow_totals.append(invested_cash)

    def invested_cash_until(day):
        idx = bisect_right(flow_dates, day)
        return flow_totals[idx - 1] if idx else Decimal("0")

    live_total = Decimal("0")
    live_pnl = Decimal("0")
    live_rv = Decimal("0")
    live_rf = Decimal("0")
    try:
        live_portfolio = calculate_portfolio(user)
        live_total = Decimal(live_portfolio["totals"]["total_market_value"])
        live_pnl = Decimal(live_portfolio["totals"]["total_unrealized_pnl"])
        for pos in live_portfolio["positions"]:
            mv = Decimal(pos["market_value"])
            if pos["asset_type"] in EQUITY_TYPES:
                live_rv += mv
            else:
                live_rf += mv
    except (KeyError, ValueError, TypeError, ZeroDivisionError):
        logger.exception("Failed to calculate live portfolio for user %s", user.pk)
        live_total = Decimal("0")

    today = timezone.localdate()
    current_month = today.strftime("%Y-%m")

    all_months_set = set(monthly_cash.keys()) | set(monthly_portfolio.keys()) | set(tx_cost_by_month.keys())
    if monthly_portfolio or live_total > 0:
        all_months_set.add(current_month)
    all_months = sorted(all_months_set)

    last_cash = Decimal("0")
    last_photo = None
    last_tx_cost = Decimal("0")
    result = []

    for month in all_months:
        if month in monthly_cash:
            last_cash = monthly_cash[month]
            last_photo = photo_dates[month]
        if month in tx_cost_by_month:
            last_tx_cost = tx_cost_by_month[month]

        # Investments are valued later than the cash photo (month end, the portfolio snapshot or today): money
        # moved into investments after the photo would count twice, still as cash and already as investment
        if month == current_month:
            valued_on = today
        elif month in monthly_portfolio:
            valued_on = monthly_portfolio[month]["captured_at"].date()
        else:
            year, mon = int(month[:4]), int(month[5:])
            valued_on = date(year, mon, calendar.monthrange(year, mon)[1])
        moved = (
            invested_cash_until(valued_on) - invested_cash_until(last_photo)
            if last_photo is not None and valued_on > last_photo
            else Decimal("0")
        )
        cash = last_cash - moved

        if month == current_month:
            total_investments = live_total
            investment_pnl = live_pnl
            rv = live_rv
            rf = live_rf
        elif month in monthly_portfolio:
            portfolio = monthly_portfolio[month]
            total_investments = Decimal(str(portfolio["total_market_value"]))
            investment_pnl = Decimal(str(portfolio["total_unrealized_pnl"] or 0))
            # Per-type breakdown not available for historical snapshots
            rv = Decimal("0")
            rf = Decimal("0")
        else:
            total_investments = max(last_tx_cost, Decimal("0"))
            investment_pnl = Decimal("0")
            rv = Decimal("0")
            rf = Decimal("0")

        result.append(
            {
                "month": month,
                "cash": str(cash),
                "cash_snapshot": str(last_cash),
                "investments": str(total_investments),
                "investment_pnl": str(investment_pnl),
                "renta_variable": str(rv),
                "renta_fija": str(rf),
            }
        )

    return result


def _compute_savings_stats(months_data):
    if not months_data:
        return None

    delta_entries = [(Decimal(m["real_savings"]), m) for m in months_data if m.get("real_savings") is not None]

    if delta_entries:
        deltas = [d for d, _ in delta_entries]
        avg_delta = sum(deltas) / Decimal(str(len(deltas)))
        best_month = max(delta_entries, key=lambda x: x[0])[1]
        worst_month = min(delta_entries, key=lambda x: x[0])[1]
    else:
        avg_delta = None
        best_month = None
        worst_month = None

    last = months_data[-1]
    return {
        "current_cash": last["cash_end"],
        "last_month_delta": last.get("real_savings"),
        "avg_monthly_delta": str(avg_delta.quantize(Decimal("0.01"))) if avg_delta is not None else None,
        "best_month": best_month,
        "worst_month": worst_month,
    }


INCOME_KINDS = ("payroll", "other", "investment")


def _income_events(user):
    """Money received, summed per day and kind: net payslips (paid at period end), other income, net dividends and
    interests (at period end). Sorted by date."""
    sources = (
        ("payroll", Payroll.objects.filter(owner=user), "period_end", "net"),
        ("other", OtherIncome.objects.filter(owner=user), "date", "amount"),
        ("investment", Dividend.objects.filter(owner=user), "date", "net"),
        ("investment", Interest.objects.filter(owner=user), "date_end", "net"),
    )
    events = []
    for kind, queryset, date_field, amount_field in sources:
        for row in queryset.values(date_field).annotate(total=Sum(amount_field)):
            events.append((row[date_field], kind, row["total"] or Decimal("0")))
    return sorted(events, key=lambda e: e[0])


def _income_by_snapshot_period(events, month_end_dates):
    """Income of each savings month: what was received between the previous month's last snapshot (excluded) and
    this month's last snapshot (included) — the same span the cash change measures. Snapshots taken on the 1st of
    a month therefore collect the previous month's payslip, as the balance they record already includes it."""
    periods: dict[str, dict[str, Decimal]] = {}
    idx = 0
    prev_end = None
    for month in sorted(month_end_dates):
        end = month_end_dates[month]
        totals = dict.fromkeys(INCOME_KINDS, Decimal("0"))
        while idx < len(events) and events[idx][0] <= end:
            day, kind, amount = events[idx]
            if prev_end is not None and day > prev_end:
                totals[kind] += amount
            idx += 1
        periods[month] = totals
        prev_end = end
    return periods


def _income_fields(income, real_savings):
    """Income of a month and the spending it implies: what came in minus what was saved."""
    total = sum(income.values(), Decimal("0"))
    spending = total - real_savings if real_savings is not None and total > 0 else None
    cents = Decimal("0.01")
    return {
        "income_payroll": str(income["payroll"].quantize(cents)),
        "income_other": str(income["other"].quantize(cents)),
        "income_investment": str(income["investment"].quantize(cents)),
        "income_total": str(total.quantize(cents)),
        "estimated_spending": str(spending.quantize(cents)) if spending is not None else None,
    }


def monthly_savings(user, start_date=None, end_date=None):
    from apps.assets.models import AccountSnapshot

    account_balances = {}
    monthly_cash = {}
    month_end_dates = {}

    for snap in AccountSnapshot.objects.filter(owner=user).order_by("date").values("account_id", "date", "balance"):
        month_key = snap["date"].strftime("%Y-%m")
        account_balances[snap["account_id"]] = snap["balance"]
        monthly_cash[month_key] = sum(account_balances.values(), Decimal("0"))
        month_end_dates[month_key] = snap["date"]

    if not monthly_cash:
        return {"months": [], "stats": None}

    monthly_comments: dict = {}
    for snap in (
        AccountSnapshot.objects.filter(owner=user, note__isnull=False)
        .exclude(note="")
        .order_by("date")
        .values("date", "note", "account__name")
    ):
        month_key = snap["date"].strftime("%Y-%m")
        if month_key not in monthly_comments:
            monthly_comments[month_key] = []
        monthly_comments[month_key].append(
            {
                "account_name": snap["account__name"],
                "date": snap["date"].isoformat(),
                "note": snap["note"],
            }
        )

    from apps.portfolio.services import investment_cost_timeline

    # Both the cash and the money invested are measured at the month's last snapshot: an operation made after
    # that snapshot belongs to the next month, together with the cash it moves
    cost_timeline = investment_cost_timeline(user)
    income_by_month = _income_by_snapshot_period(_income_events(user), month_end_dates)

    tx_idx = 0
    last_inv_cost = Decimal("0")

    months_data = []
    prev_cash = None
    prev_inv_cost = None

    cash_months = sorted(monthly_cash.keys())
    if start_date:
        cash_months = [m for m in cash_months if m >= start_date]
    if end_date:
        cash_months = [m for m in cash_months if m <= end_date]

    for month in cash_months:
        while tx_idx < len(cost_timeline) and cost_timeline[tx_idx][0] <= month_end_dates[month]:
            last_inv_cost = cost_timeline[tx_idx][1]
            tx_idx += 1

        cash_end = monthly_cash[month]
        inv_cost_end = last_inv_cost

        cash_delta = (cash_end - prev_cash) if prev_cash is not None else None
        inv_cost_delta = (inv_cost_end - prev_inv_cost) if prev_inv_cost is not None else None
        real_savings = (cash_delta + inv_cost_delta) if cash_delta is not None and inv_cost_delta is not None else None

        months_data.append(
            {
                "month": month,
                "cash_end": str(cash_end),
                "cash_delta": str(cash_delta) if cash_delta is not None else None,
                "investment_cost_end": str(inv_cost_end),
                "investment_cost_delta": str(inv_cost_delta) if inv_cost_delta is not None else None,
                "real_savings": str(real_savings) if real_savings is not None else None,
                **_income_fields(income_by_month[month], real_savings),
                "comments": monthly_comments.get(month, []),
            }
        )

        prev_cash = cash_end
        prev_inv_cost = inv_cost_end

    return {"months": months_data, "stats": _compute_savings_stats(months_data)}


# ── Annual Savings ────────────────────────────────────────────────


def annual_savings(user):
    """Aggregate monthly savings + patrimonio evolution by year."""
    savings_result = monthly_savings(user)
    months_data = savings_result["months"]
    patrimonio_data = patrimonio_evolution(user)

    # Build patrimonio lookup by month
    patrimonio_by_month = {}
    for p in patrimonio_data:
        patrimonio_by_month[p["month"]] = p

    # Group monthly savings by year
    years: dict[int, dict] = {}
    for m in months_data:
        year = int(m["month"][:4])
        if year not in years:
            years[year] = {
                "year": year,
                "total_real_savings": Decimal("0"),
                "total_cash_delta": Decimal("0"),
                "total_investment_cost_delta": Decimal("0"),
                "cash_end": Decimal("0"),
                "investment_cost_end": Decimal("0"),
                "months_count": 0,
                "_last_month": m["month"],
                **{f"income_{kind}": Decimal("0") for kind in INCOME_KINDS},
                "total_income": Decimal("0"),
                "total_estimated_spending": None,
            }
        entry = years[year]
        for kind in INCOME_KINDS:
            entry[f"income_{kind}"] += Decimal(m[f"income_{kind}"])
        entry["total_income"] += Decimal(m["income_total"])
        if m["estimated_spending"] is not None:
            entry["total_estimated_spending"] = (entry["total_estimated_spending"] or Decimal("0")) + Decimal(
                m["estimated_spending"]
            )
        if m["real_savings"] is not None:
            entry["total_real_savings"] += Decimal(m["real_savings"])
        if m["cash_delta"] is not None:
            entry["total_cash_delta"] += Decimal(m["cash_delta"])
        if m["investment_cost_delta"] is not None:
            entry["total_investment_cost_delta"] += Decimal(m["investment_cost_delta"])
        entry["cash_end"] = Decimal(m["cash_end"])
        entry["investment_cost_end"] = Decimal(m["investment_cost_end"])
        entry["months_count"] += 1
        entry["_last_month"] = m["month"]

    # Attach patrimony from patrimonio_evolution (year-end value)
    for _year, entry in years.items():
        p = patrimonio_by_month.get(entry["_last_month"])
        if p:
            entry["patrimony"] = Decimal(p["cash"]) + Decimal(p["investments"])
        else:
            entry["patrimony"] = entry["cash_end"] + entry["investment_cost_end"]

    # Compute year-over-year growth
    sorted_years = sorted(years.values(), key=lambda x: x["year"])
    prev_patrimony = None
    result = []
    for entry in sorted_years:
        if prev_patrimony is not None and prev_patrimony != Decimal("0"):
            growth = entry["patrimony"] - prev_patrimony
            growth_pct = (growth / prev_patrimony * Decimal("100")).quantize(Decimal("0.1"))
        elif prev_patrimony is not None:
            growth = entry["patrimony"] - prev_patrimony
            growth_pct = Decimal("0")
        else:
            growth = None
            growth_pct = None
        prev_patrimony = entry["patrimony"]

        result.append(
            {
                "year": entry["year"],
                "total_real_savings": str(entry["total_real_savings"].quantize(Decimal("0.01"))),
                "total_cash_delta": str(entry["total_cash_delta"].quantize(Decimal("0.01"))),
                "total_investment_cost_delta": str(entry["total_investment_cost_delta"].quantize(Decimal("0.01"))),
                "cash_end": str(entry["cash_end"]),
                "investment_cost_end": str(entry["investment_cost_end"]),
                "patrimony": str(entry["patrimony"].quantize(Decimal("0.01"))),
                "patrimony_growth": str(growth.quantize(Decimal("0.01"))) if growth is not None else None,
                "patrimony_growth_pct": str(growth_pct) if growth_pct is not None else None,
                "months_count": entry["months_count"],
                **{f"income_{kind}": str(entry[f"income_{kind}"].quantize(Decimal("0.01"))) for kind in INCOME_KINDS},
                "total_income": str(entry["total_income"].quantize(Decimal("0.01"))),
                "total_estimated_spending": (
                    str(entry["total_estimated_spending"].quantize(Decimal("0.01")))
                    if entry["total_estimated_spending"] is not None
                    else None
                ),
            }
        )

    return result


# ── Savings Projection ────────────────────────────────────────────


def savings_projection(user, goal_id):
    """Calculate projection scenarios for reaching a savings goal."""
    import math

    from dateutil.relativedelta import relativedelta

    from .models import SavingsGoal

    goal = SavingsGoal.objects.get(pk=goal_id, owner=user)

    # Get monthly savings data for trimmed mean
    savings_result = monthly_savings(user)
    months_data = savings_result["months"]

    deltas = sorted(Decimal(m["real_savings"]) for m in months_data if m["real_savings"] is not None)

    # Trimmed mean (exclude top/bottom 10%)
    if len(deltas) >= 10:
        trim = max(1, len(deltas) // 10)
        trimmed = deltas[trim:-trim]
    else:
        trimmed = deltas

    avg_monthly = (sum(trimmed) / Decimal(str(len(trimmed))) if trimmed else Decimal("0")).quantize(Decimal("0.01"))

    # Get current patrimony based on base_type
    patrimonio_data = patrimonio_evolution(user)
    if patrimonio_data:
        last = patrimonio_data[-1]
        if goal.base_type == "CASH":
            current_patrimony = Decimal(last["cash"])
        else:
            current_patrimony = Decimal(last["cash"]) + Decimal(last["investments"])
    else:
        current_patrimony = Decimal("0")

    remaining = goal.target_amount - current_patrimony
    if remaining < 0:
        remaining = Decimal("0")

    now = timezone.now().date()

    def _scenario(rate):
        if rate <= 0:
            return {"monthly_rate": str(rate), "months_to_goal": None, "target_date": None}
        months = math.ceil(float(remaining / rate)) if remaining > 0 else 0
        target = now + relativedelta(months=months)
        return {
            "monthly_rate": str(rate.quantize(Decimal("0.01"))),
            "months_to_goal": months,
            "target_date": target.strftime("%Y-%m"),
        }

    conservative_rate = (avg_monthly * Decimal("0.7")).quantize(Decimal("0.01"))
    optimistic_rate = (avg_monthly * Decimal("1.3")).quantize(Decimal("0.01"))

    scenarios = {
        "conservative": _scenario(conservative_rate),
        "average": _scenario(avg_monthly),
        "optimistic": _scenario(optimistic_rate),
    }

    # On-track check against deadline
    on_track = None
    deadline_shortfall = None
    if goal.deadline:
        avg_scenario = scenarios["average"]
        if avg_scenario["target_date"]:
            on_track = avg_scenario["target_date"] <= goal.deadline.strftime("%Y-%m")
            if not on_track:
                months_to_deadline = (goal.deadline.year - now.year) * 12 + goal.deadline.month - now.month
                if months_to_deadline > 0:
                    needed_rate = remaining / Decimal(str(months_to_deadline))
                    deadline_shortfall = str((needed_rate - avg_monthly).quantize(Decimal("0.01")))
                else:
                    deadline_shortfall = str(remaining.quantize(Decimal("0.01")))

    from .serializers import SavingsGoalSerializer

    goal_data = SavingsGoalSerializer(goal).data

    return {
        "goal": goal_data,
        "current_patrimony": str(current_patrimony.quantize(Decimal("0.01"))),
        "remaining": str(remaining.quantize(Decimal("0.01"))),
        "avg_monthly_savings": str(avg_monthly),
        "scenarios": scenarios,
        "on_track": on_track,
        "deadline_shortfall": deadline_shortfall,
    }


# ---------------------------------------------------------------------------
# Tax declaration — country-specific logic now lives in
# ``apps.reports.tax_adapters``. The view dispatches on the user's
# ``Settings.tax_country`` to the right adapter; this module only keeps the
# generic services above.
# ---------------------------------------------------------------------------
