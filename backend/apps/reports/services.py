from collections import defaultdict, deque
from decimal import Decimal
from django.db.models import Sum
from django.db.models.functions import ExtractYear
from django.utils import timezone
from apps.transactions.models import Dividend, Interest
from apps.portfolio.services import calculate_realized_pnl_fiscal


def _default_year(y):
    return {
        "year": y,
        "dividends_gross": "0", "dividends_tax": "0", "dividends_net": "0",
        "interests_gross": "0", "interests_net": "0",
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
        .annotate(year=ExtractYear("date"))
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
        y["total_income"] = str(
            Decimal(y["dividends_net"]) + Decimal(y["interests_net"]) + Decimal(y["realized_pnl"])
        )

    return sorted(years.values(), key=lambda x: x["year"])


def rv_evolution(user):
    from apps.assets.models import PortfolioSnapshot

    snapshots = (
        PortfolioSnapshot.objects.filter(owner=user)
        .order_by("captured_at")
        .values("captured_at", "total_market_value")
    )

    return [
        {
            "captured_at": snap["captured_at"].isoformat(),
            "value": str(snap["total_market_value"]),
        }
        for snap in snapshots
        if snap["total_market_value"] > 0
    ]


def patrimonio_evolution(user):
    from apps.assets.models import AccountSnapshot, Asset, PortfolioSnapshot, PositionSnapshot
    from apps.transactions.models import Transaction
    from apps.portfolio.services import calculate_portfolio

    EQUITY_TYPES = {"STOCK", "ETF", "CRYPTO"}
    asset_type_map = dict(Asset.objects.filter(owner=user).values_list("id", "type"))

    account_balances = {}
    monthly_cash = {}

    for snap in AccountSnapshot.objects.filter(owner=user).order_by("date").values("account_id", "date", "balance"):
        month_key = snap["date"].strftime("%Y-%m")
        account_balances[snap["account_id"]] = snap["balance"]
        monthly_cash[month_key] = sum(account_balances.values(), Decimal("0"))

    monthly_portfolio = {}
    for snap in PortfolioSnapshot.objects.filter(owner=user).order_by("captured_at").values(
        "captured_at", "batch_id", "total_market_value"
    ):
        month_key = snap["captured_at"].strftime("%Y-%m")
        monthly_portfolio[month_key] = snap

    if not monthly_portfolio and not monthly_cash:
        return []

    running_cost = Decimal("0")
    tx_cost_by_month = {}

    for tx in Transaction.objects.filter(owner=user).order_by("date", "created_at").values(
        "date", "type", "quantity", "price", "commission"
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

    selected_batch_ids = {snap["batch_id"] for snap in monthly_portfolio.values()}
    batch_rv = defaultdict(Decimal)
    batch_rf = defaultdict(Decimal)

    for pos in PositionSnapshot.objects.filter(owner=user, batch_id__in=selected_batch_ids).values(
        "batch_id", "asset_id", "market_value"
    ):
        asset_type = asset_type_map.get(pos["asset_id"], "")
        if asset_type in EQUITY_TYPES:
            batch_rv[pos["batch_id"]] += pos["market_value"]
        else:
            batch_rf[pos["batch_id"]] += pos["market_value"]

    live_total = Decimal("0")
    live_rv = Decimal("0")
    live_rf = Decimal("0")
    try:
        live_portfolio = calculate_portfolio(user)
        live_total = Decimal(live_portfolio["totals"]["total_market_value"])
        for pos in live_portfolio["positions"]:
            mv = Decimal(pos["market_value"])
            if pos["asset_type"] in EQUITY_TYPES:
                live_rv += mv
            else:
                live_rf += mv
    except Exception:
        live_total = Decimal("0")

    current_month = timezone.now().strftime("%Y-%m")

    all_months_set = (
        set(monthly_cash.keys())
        | set(monthly_portfolio.keys())
        | set(tx_cost_by_month.keys())
    )
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
            rv = live_rv
            rf = live_rf
        elif month in monthly_portfolio:
            portfolio = monthly_portfolio[month]
            total_investments = Decimal(str(portfolio["total_market_value"]))
            bid = portfolio["batch_id"]
            rv = batch_rv.get(bid, Decimal("0"))
            rf = batch_rf.get(bid, Decimal("0"))
        else:
            total_investments = max(last_tx_cost, Decimal("0"))
            rv = Decimal("0")
            rf = Decimal("0")

        result.append({
            "month": month,
            "cash": str(last_cash),
            "investments": str(total_investments),
            "renta_variable": str(rv),
            "renta_fija": str(rf),
        })

    return result


def _compute_savings_stats(months_data):
    if not months_data:
        return None

    delta_entries = [
        (Decimal(m["real_savings"]), m)
        for m in months_data
        if m.get("real_savings") is not None
    ]

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
    from apps.assets.models import AccountSnapshot, Settings
    from apps.transactions.models import Transaction

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
        monthly_comments[month_key].append({
            "account_name": snap["account__name"],
            "date": snap["date"].isoformat(),
            "note": snap["note"],
        })

    settings = Settings.load(user)
    fiscal_method = settings.fiscal_cost_method
    use_wac = fiscal_method == "WAC"
    use_lifo = fiscal_method == "LIFO"
    lots = {}
    wac_state = {}
    running_inv_cost = Decimal("0")
    inv_cost_by_month = {}

    for tx in Transaction.objects.filter(owner=user).order_by("date", "created_at").values(
        "date", "type", "asset_id", "quantity", "price", "commission", "tax"
    ):
        month_key = tx["date"].strftime("%Y-%m")
        aid = tx["asset_id"]
        qty = tx["quantity"] or Decimal("0")
        price = tx["price"] or Decimal("0")
        commission = tx["commission"] or Decimal("0")
        tax = tx["tax"] or Decimal("0")

        if tx["type"] == "BUY":
            ppu = price + (commission + tax) / qty if qty else Decimal("0")
            running_inv_cost += qty * ppu
            if use_wac:
                if aid not in wac_state:
                    wac_state[aid] = {"total_qty": Decimal("0"), "total_cost": Decimal("0")}
                wac_state[aid]["total_qty"] += qty
                wac_state[aid]["total_cost"] += qty * ppu
            else:
                if aid not in lots:
                    lots[aid] = deque()
                lots[aid].append({"qty": qty, "ppu": ppu})

        elif tx["type"] == "GIFT":
            ppu = price if settings.gift_cost_mode == "MARKET" else Decimal("0")
            running_inv_cost += qty * ppu
            if use_wac:
                if aid not in wac_state:
                    wac_state[aid] = {"total_qty": Decimal("0"), "total_cost": Decimal("0")}
                wac_state[aid]["total_qty"] += qty
                wac_state[aid]["total_cost"] += qty * ppu
            else:
                if aid not in lots:
                    lots[aid] = deque()
                lots[aid].append({"qty": qty, "ppu": ppu})

        elif tx["type"] == "SELL":
            if use_wac:
                state = wac_state.get(aid)
                if state and state["total_qty"] > 0:
                    avg = state["total_cost"] / state["total_qty"]
                    running_inv_cost -= avg * qty
                    state["total_qty"] -= qty
                    state["total_cost"] -= avg * qty
                    if state["total_qty"] <= 0:
                        state["total_qty"] = Decimal("0")
                        state["total_cost"] = Decimal("0")
            else:
                if aid not in lots:
                    lots[aid] = deque()
                remaining = qty
                while remaining > 0 and lots.get(aid):
                    lot = lots[aid][-1] if use_lifo else lots[aid][0]
                    consumed = min(remaining, lot["qty"])
                    running_inv_cost -= consumed * lot["ppu"]
                    lot["qty"] -= consumed
                    remaining -= consumed
                    if lot["qty"] <= 0:
                        lots[aid].pop() if use_lifo else lots[aid].popleft()

        inv_cost_by_month[month_key] = running_inv_cost

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

        months_data.append({
            "month": month,
            "cash_end": str(cash_end),
            "cash_delta": str(cash_delta) if cash_delta is not None else None,
            "investment_cost_end": str(inv_cost_end),
            "investment_cost_delta": str(inv_cost_delta) if inv_cost_delta is not None else None,
            "real_savings": str(real_savings) if real_savings is not None else None,
            "comments": monthly_comments.get(month, []),
        })

        prev_cash = cash_end
        prev_inv_cost = inv_cost_end

    return {"months": months_data, "stats": _compute_savings_stats(months_data)}
