import logging
from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import ExtractYear
from django.utils import timezone

from apps.portfolio.services import calculate_realized_pnl_fiscal
from apps.transactions.models import Dividend, Interest

logger = logging.getLogger(__name__)


def _default_year(y):
    return {
        "year": y,
        "dividends_gross": "0",
        "dividends_tax": "0",
        "dividends_net": "0",
        "interests_gross": "0",
        "interests_net": "0",
        "realized_pnl": "0",
        "total_income": "0",
    }


def year_summary(user):
    dividend_by_year = (
        Dividend.objects.filter(owner=user)
        .annotate(year=ExtractYear("date"))
        .values("year")
        .annotate(total_gross=Sum("gross"), total_tax=Sum("tax"), total_net=Sum("net"))
        .order_by("year")
    )

    interest_by_year = (
        Interest.objects.filter(owner=user)
        .annotate(year=ExtractYear("date_end"))
        .values("year")
        .annotate(total_gross=Sum("gross"), total_net=Sum("net"))
        .order_by("year")
    )

    years = {}
    for d in dividend_by_year:
        y = d["year"]
        years.setdefault(y, _default_year(y))
        years[y]["dividends_gross"] = str(d["total_gross"] or Decimal("0"))
        years[y]["dividends_tax"] = str(d["total_tax"] or Decimal("0"))
        years[y]["dividends_net"] = str(d["total_net"] or Decimal("0"))

    for i in interest_by_year:
        y = i["year"]
        years.setdefault(y, _default_year(y))
        years[y]["interests_gross"] = str(i["total_gross"] or Decimal("0"))
        years[y]["interests_net"] = str(i["total_net"] or Decimal("0"))

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
        y["total_income"] = str(Decimal(y["dividends_net"]) + Decimal(y["interests_net"]) + Decimal(y["realized_pnl"]))

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


def patrimonio_evolution(user):
    from apps.assets.models import AccountSnapshot, PortfolioSnapshot
    from apps.portfolio.services import calculate_portfolio
    from apps.transactions.models import Transaction

    EQUITY_TYPES = {"STOCK", "ETF", "CRYPTO"}

    account_balances = {}
    monthly_cash = {}

    for snap in AccountSnapshot.objects.filter(owner=user).order_by("date").values("account_id", "date", "balance"):
        month_key = snap["date"].strftime("%Y-%m")
        account_balances[snap["account_id"]] = snap["balance"]
        monthly_cash[month_key] = sum(account_balances.values(), Decimal("0"))

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

    for tx in (
        Transaction.objects.filter(owner=user)
        .order_by("date", "created_at")
        .values("date", "type", "quantity", "price", "commission")
    ):
        month_key = tx["date"].strftime("%Y-%m")
        qty = tx["quantity"] or Decimal("0")
        price = tx["price"] or Decimal("0")
        commission = tx["commission"] or Decimal("0")
        if tx["type"] in ("BUY", "GIFT"):
            running_cost += qty * price + commission
        elif tx["type"] == "SELL":
            running_cost -= qty * price - commission
        tx_cost_by_month[month_key] = running_cost

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

    current_month = timezone.now().strftime("%Y-%m")

    all_months_set = set(monthly_cash.keys()) | set(monthly_portfolio.keys()) | set(tx_cost_by_month.keys())
    if monthly_portfolio or live_total > 0:
        all_months_set.add(current_month)
    all_months = sorted(all_months_set)

    last_cash = Decimal("0")
    last_tx_cost = Decimal("0")
    result = []

    for month in all_months:
        if month in monthly_cash:
            last_cash = monthly_cash[month]
        if month in tx_cost_by_month:
            last_tx_cost = tx_cost_by_month[month]

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
                "cash": str(last_cash),
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


def monthly_savings(user, start_date=None, end_date=None):
    from apps.assets.models import AccountSnapshot

    account_balances = {}
    monthly_cash = {}

    for snap in AccountSnapshot.objects.filter(owner=user).order_by("date").values("account_id", "date", "balance"):
        month_key = snap["date"].strftime("%Y-%m")
        account_balances[snap["account_id"]] = snap["balance"]
        monthly_cash[month_key] = sum(account_balances.values(), Decimal("0"))

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

    from apps.portfolio.services import compute_investment_cost_by_month

    inv_cost_by_month = compute_investment_cost_by_month(user)

    sorted_tx_months = sorted(inv_cost_by_month.keys())
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
        while tx_idx < len(sorted_tx_months) and sorted_tx_months[tx_idx] <= month:
            last_inv_cost = inv_cost_by_month[sorted_tx_months[tx_idx]]
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
            }
        entry = years[year]
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
# Tax declaration (Modo Renta) — maps Fintrack data to the Spanish Renta Web
# casillas. Output is grouped in blocks ready to copy into the IRPF form.
# ---------------------------------------------------------------------------

DEFAULT_TREATY_RATE = Decimal("0.15")
NET_MISMATCH_TOLERANCE = Decimal("0.02")
MONEY_Q = Decimal("0.01")


def _q(value):
    return (value or Decimal("0")).quantize(MONEY_Q)


def _interest_withholding(interest):
    """Return the withholding amount for a given Interest row.

    `tax` is the WITHHOLDING TAX in origin (not a rate).
      - tax IS NOT NULL → respect literally (even if Decimal("0") = "no withholding").
      - tax IS NULL     → not informed, infer from gross - net - commission (clamped to 0).
    """
    if interest.tax is not None:
        return interest.tax
    inferred = interest.gross - interest.net - (interest.commission or Decimal("0"))
    return inferred if inferred > Decimal("0") else Decimal("0")


def _is_es_dividend(asset):
    """True when the dividend is treated as Spanish (ES) for tax purposes."""
    if asset.withholding_country:
        return asset.withholding_country.upper() == "ES"
    if asset.issuer_country:
        return asset.issuer_country.upper() == "ES"
    return False


def _country_of(asset):
    """Best-effort country for a dividend's foreign tax classification."""
    return (asset.withholding_country or asset.issuer_country or "").upper() or None


def tax_declaration(user, year):
    """Return a dict with the data ready to fill in the Spanish Renta Web form
    for the given fiscal year.

    See plan: /Users/quintela/.claude/plans/quiero-que-a-adas-a-encapsulated-diffie.md
    """
    from apps.assets.models import Settings as UserSettings

    user_settings = UserSettings.load(user)
    treaty_limits = user_settings.tax_treaty_limits or {}

    warnings: list[dict] = []
    infos: list[dict] = []

    # ----- INTERESES ---------------------------------------------------------
    interests_qs = (
        Interest.objects.filter(owner=user, date_end__year=year)
        .select_related("account")
        .order_by("account__name", "date_end")
    )
    int_by_acct: dict[str, dict[str, Decimal]] = {}
    int_gross = int_with = int_comm = int_net = Decimal("0")
    for i in interests_qs:
        acct = i.account.name if i.account else "—"
        bucket = int_by_acct.setdefault(
            acct,
            {"gross": Decimal("0"), "withholding": Decimal("0"), "commission": Decimal("0"), "net": Decimal("0")},
        )
        wh = _interest_withholding(i)
        comm = i.commission or Decimal("0")
        bucket["gross"] += i.gross
        bucket["withholding"] += wh
        bucket["commission"] += comm
        bucket["net"] += i.net
        int_gross += i.gross
        int_with += wh
        int_comm += comm
        int_net += i.net

        # Net mismatch (interests): only when tax is informed (otherwise it's tautological).
        if i.tax is not None:
            expected = i.gross - i.tax - comm
            if abs(expected - i.net) > NET_MISMATCH_TOLERANCE:
                warnings.append(
                    {
                        "kind": "net_mismatch",
                        "scope": "interest",
                        "message": (
                            f"Descuadre en interés de '{acct}' ({i.date_end}): "
                            f"bruto {i.gross} − retención {i.tax} − comisión {comm} ≠ neto {i.net}"
                        ),
                    }
                )

    interests_block = {
        "casilla": "Rendimientos del capital mobiliario · Intereses de cuentas, depósitos y activos financieros",
        "gross": str(_q(int_gross)),
        "withholding": str(_q(int_with)),
        "commission": str(_q(int_comm)),
        "net": str(_q(int_net)),
        "by_entity": [
            {
                "name": name,
                "gross": str(_q(b["gross"])),
                "withholding": str(_q(b["withholding"])),
                "commission": str(_q(b["commission"])),
                "net": str(_q(b["net"])),
            }
            for name, b in sorted(int_by_acct.items(), key=lambda x: x[0].lower())
        ],
    }

    # ----- DIVIDENDOS --------------------------------------------------------
    dividends_qs = Dividend.objects.filter(owner=user, date__year=year).select_related("asset").order_by("date")

    div_gross = div_tax_es = div_tax_total = div_comm = div_net = Decimal("0")
    by_country_entity: dict[tuple, dict] = {}
    foreign_by_country: dict[str, dict[str, Decimal]] = {}
    seen_missing_country = False

    for d in dividends_qs:
        is_es = _is_es_dividend(d.asset)
        country = _country_of(d.asset)
        comm = d.commission or Decimal("0")

        div_gross += d.gross
        div_tax_total += d.tax
        div_comm += comm
        div_net += d.net
        if is_es:
            div_tax_es += d.tax

        # Net mismatch (dividends): always check, since fields are non-null.
        expected = d.gross - d.tax - comm
        if abs(expected - d.net) > NET_MISMATCH_TOLERANCE:
            warnings.append(
                {
                    "kind": "net_mismatch",
                    "scope": "dividend",
                    "message": (
                        f"Descuadre en dividendo de '{d.asset.name}' ({d.date}): "
                        f"bruto {d.gross} − retención {d.tax} − comisión {comm} ≠ neto {d.net}"
                    ),
                }
            )

        # Group by (country_for_display, asset.name).
        country_key = country or "—"
        ce_key = (country_key, d.asset.name)
        ce = by_country_entity.setdefault(
            ce_key,
            {
                "country": country_key,
                "entity": d.asset.name,
                "is_es": is_es,
                "gross": Decimal("0"),
                "withholding": Decimal("0"),
                "commission": Decimal("0"),
                "net": Decimal("0"),
            },
        )
        ce["gross"] += d.gross
        ce["withholding"] += d.tax
        ce["commission"] += comm
        ce["net"] += d.net

        # Track missing-country only for non-ES rows that have withholding (otherwise irrelevant).
        if not country and not is_es:
            seen_missing_country = True

        if not is_es and country:
            fbc = foreign_by_country.setdefault(country, {"gross": Decimal("0"), "withholding": Decimal("0")})
            fbc["gross"] += d.gross
            fbc["withholding"] += d.tax

    dividends_block = {
        "casilla": "Rendimientos del capital mobiliario · Dividendos y rendimientos por participación en fondos propios",
        "gross_total": str(_q(div_gross)),
        "withholding_es": str(_q(div_tax_es)),
        "withholding_total": str(_q(div_tax_total)),
        "commission": str(_q(div_comm)),
        "net_informative": str(_q(div_net)),
        "by_country_entity": [
            {
                "country": v["country"],
                "entity": v["entity"],
                "is_es": v["is_es"],
                "gross": str(_q(v["gross"])),
                "withholding": str(_q(v["withholding"])),
                "commission": str(_q(v["commission"])),
                "net": str(_q(v["net"])),
            }
            for v in sorted(
                by_country_entity.values(),
                key=lambda x: (x["country"], x["entity"].lower()),
            )
        ],
    }

    if seen_missing_country:
        warnings.append(
            {
                "kind": "missing_tax_country",
                "scope": "dividend",
                "message": (
                    "Hay dividendos sin país fiscal asignado (ni withholding_country ni issuer_country). "
                    "Sin esto no se pueden clasificar como ES vs extranjeros ni aplicar doble imposición."
                ),
            }
        )

    # ----- DOBLE IMPOSICIÓN INTERNACIONAL -----------------------------------
    foreign_gross_total = Decimal("0")
    deductible_total = Decimal("0")
    by_country_rows = []
    foreign_uncomputed_with_tax = False

    for country, agg in sorted(foreign_by_country.items()):
        rate_raw = treaty_limits.get(country)
        if rate_raw is not None:
            try:
                rate = Decimal(str(rate_raw))
                is_default = False
            except Exception:
                rate = DEFAULT_TREATY_RATE
                is_default = True
        else:
            rate = DEFAULT_TREATY_RATE
            is_default = True

        gross = agg["gross"]
        withholding = agg["withholding"]
        limit = gross * rate
        deductible = min(withholding, limit)

        foreign_gross_total += gross
        deductible_total += deductible

        if withholding > Decimal("0") and deductible <= Decimal("0") and rate > Decimal("0"):
            foreign_uncomputed_with_tax = True

        by_country_rows.append(
            {
                "country": country,
                "gross": str(_q(gross)),
                "withholding": str(_q(withholding)),
                "rate_applied": str(rate),
                "is_default_rate": is_default,
                "limit": str(_q(limit)),
                "deductible": str(_q(deductible)),
            }
        )

    double_taxation_block = {
        "casilla": "Deducción por doble imposición internacional · Rendimientos obtenidos en el extranjero",
        "foreign_gross_total": str(_q(foreign_gross_total)),
        "deductible_total": str(_q(deductible_total)),
        "by_country": by_country_rows,
    }

    if foreign_uncomputed_with_tax:
        warnings.append(
            {
                "kind": "foreign_with_uncomputed_deduction",
                "scope": "double_taxation",
                "message": (
                    "Existe retención extranjera con deducción 0 sin que el motivo sea un tipo 0 % "
                    "configurado en Settings.tax_treaty_limits. Revisa los datos del país afectado."
                ),
            }
        )

    if foreign_gross_total > Decimal("0"):
        infos.append(
            {
                "kind": "double_taxation_applied",
                "message": (
                    f"Se ha calculado deducción por doble imposición de "
                    f"{_q(deductible_total)} € sobre rendimientos extranjeros de "
                    f"{_q(foreign_gross_total)} €."
                ),
            }
        )

    # ----- VENTAS (Ganancias y pérdidas patrimoniales) ----------------------
    realized = calculate_realized_pnl_fiscal(user)
    sales_rows = []
    transmission_total = Decimal("0")
    acquisition_total = Decimal("0")
    total_gains = Decimal("0")
    total_losses = Decimal("0")
    net_pnl = Decimal("0")
    sale_without_cost_basis_count = 0

    for s in realized["realized_sales"]:
        sale_year = int(s["date"][:4])
        if sale_year != year:
            continue
        proceeds = Decimal(s["proceeds"])
        cost_basis = Decimal(s["cost_basis"])
        pnl = Decimal(s["realized_pnl"])
        oversell = Decimal(s.get("oversell_quantity", "0"))

        transmission_total += proceeds
        acquisition_total += cost_basis
        net_pnl += pnl
        if pnl >= 0:
            total_gains += pnl
        else:
            total_losses += pnl

        if oversell > Decimal("0") or cost_basis <= Decimal("0"):
            sale_without_cost_basis_count += 1

        sales_rows.append(
            {
                "date": s["date"],
                "asset_name": s["asset_name"],
                "asset_ticker": s.get("asset_ticker", ""),
                "quantity": s["quantity"],
                "transmission": str(_q(proceeds)),
                "acquisition": str(_q(cost_basis)),
                "pnl": str(_q(pnl)),
                "oversell_quantity": s.get("oversell_quantity", "0"),
            }
        )

    capital_gains_block = {
        "casilla": ("Ganancias y pérdidas patrimoniales · Transmisiones de acciones admitidas a negociación"),
        "transmission_total": str(_q(transmission_total)),
        "acquisition_total": str(_q(acquisition_total)),
        "total_gains": str(_q(total_gains)),
        "total_losses": str(_q(total_losses)),
        "net_result": str(_q(net_pnl)),
        "rows": sales_rows,
    }

    if sale_without_cost_basis_count > 0:
        warnings.append(
            {
                "kind": "sale_without_cost_basis",
                "scope": "capital_gains",
                "message": (
                    f"{sale_without_cost_basis_count} venta(s) sin valor de adquisición "
                    "completo (oversell o cost basis 0). Verifica el histórico de compras."
                ),
            }
        )

    # ----- SUMMARY -----------------------------------------------------------
    summary = {
        "interests_gross": interests_block["gross"],
        "interests_withholding": interests_block["withholding"],
        "dividends_gross": dividends_block["gross_total"],
        "dividends_withholding_es": dividends_block["withholding_es"],
        "dividends_commission": dividends_block["commission"],
        "double_taxation_foreign_gross": double_taxation_block["foreign_gross_total"],
        "double_taxation_deductible": double_taxation_block["deductible_total"],
        "sales_transmission": capital_gains_block["transmission_total"],
        "sales_acquisition": capital_gains_block["acquisition_total"],
        "sales_net": capital_gains_block["net_result"],
    }

    return {
        "year": year,
        "interests": interests_block,
        "dividends": dividends_block,
        "double_taxation": double_taxation_block,
        "capital_gains": capital_gains_block,
        "summary": summary,
        "warnings": warnings,
        "infos": infos,
    }
