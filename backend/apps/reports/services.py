from collections import defaultdict
from decimal import Decimal
from django.db.models import Sum
from django.db.models.functions import ExtractYear
from apps.transactions.models import Dividend, Interest
from apps.portfolio.services import calculate_realized_pnl


def _default_year(y):
    return {
        "year": y,
        "dividends_gross": "0", "dividends_tax": "0", "dividends_net": "0",
        "interests_gross": "0", "interests_net": "0",
        "sales_pnl": "0",
        "total_net": "0",
    }


def year_summary():
    dividend_by_year = (
        Dividend.objects.annotate(year=ExtractYear("date"))
        .values("year")
        .annotate(
            total_gross=Sum("gross"),
            total_tax=Sum("tax"),
            total_net=Sum("net"),
        )
        .order_by("year")
    )

    interest_by_year = (
        Interest.objects.annotate(year=ExtractYear("date"))
        .values("year")
        .annotate(
            total_gross=Sum("gross"),
            total_net=Sum("net"),
        )
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

    # Realized sales P&L grouped by year
    realized = calculate_realized_pnl()
    sales_by_year = {}
    for sale in realized["realized_sales"]:
        y = int(sale["date"][:4])
        sales_by_year.setdefault(y, Decimal("0"))
        sales_by_year[y] += Decimal(sale["realized_pnl"])

    for y, pnl in sales_by_year.items():
        years.setdefault(y, _default_year(y))
        years[y]["sales_pnl"] = str(pnl)

    for y in years.values():
        y["total_net"] = str(
            Decimal(y["dividends_net"]) + Decimal(y["interests_net"]) + Decimal(y["sales_pnl"])
        )

    return sorted(years.values(), key=lambda x: x["year"])


def patrimonio_evolution():
    from apps.assets.models import AccountSnapshot, PriceSnapshot
    from apps.transactions.models import Transaction

    # --- Cash evolution (account snapshots) ---
    snapshots = AccountSnapshot.objects.order_by("date").values_list(
        "account_id", "date", "balance"
    )

    account_balances = {}  # account_id -> latest known balance
    monthly_cash_updates = defaultdict(dict)  # "YYYY-MM" -> {account_id: balance}

    for account_id, date, balance in snapshots:
        month_key = date.strftime("%Y-%m")
        monthly_cash_updates[month_key][account_id] = balance

    # --- Investment evolution (transactions + price snapshots) ---
    transactions = Transaction.objects.order_by("date").values_list(
        "date", "type", "asset_id", "quantity"
    )

    # Build monthly cumulative holdings: {asset_id: quantity}
    holdings = defaultdict(Decimal)  # asset_id -> running qty
    monthly_holdings_updates = defaultdict(dict)  # "YYYY-MM" -> {asset_id: qty_delta}

    for date, tx_type, asset_id, quantity in transactions:
        month_key = date.strftime("%Y-%m")
        if tx_type == "BUY":
            holdings[asset_id] += quantity
        elif tx_type in ("SELL", "GIFT"):
            holdings[asset_id] -= quantity
        monthly_holdings_updates[month_key][asset_id] = holdings[asset_id]

    # Build price lookup: last snapshot per asset per month
    price_snapshots = PriceSnapshot.objects.order_by("date").values_list(
        "asset_id", "date", "price"
    )
    monthly_price_updates = defaultdict(dict)  # "YYYY-MM" -> {asset_id: price}
    for asset_id, date, price in price_snapshots:
        month_key = date.strftime("%Y-%m")
        monthly_price_updates[month_key][asset_id] = price

    # Collect all months from both sources
    all_months = sorted(
        set(monthly_cash_updates.keys())
        | set(monthly_holdings_updates.keys())
        | set(monthly_price_updates.keys())
    )

    if not all_months:
        return []

    asset_holdings = defaultdict(Decimal)  # asset_id -> current qty
    asset_prices = {}  # asset_id -> latest known price
    result = []

    for month in all_months:
        # Update cash
        account_balances.update(monthly_cash_updates.get(month, {}))
        total_cash = sum(account_balances.values(), Decimal("0"))

        # Update holdings
        asset_holdings.update(monthly_holdings_updates.get(month, {}))

        # Update prices (carry forward from previous months)
        asset_prices.update(monthly_price_updates.get(month, {}))

        # Calculate investment value
        total_investments = Decimal("0")
        for asset_id, qty in asset_holdings.items():
            if qty > 0 and asset_id in asset_prices:
                total_investments += qty * asset_prices[asset_id]

        result.append({
            "month": month,
            "cash": str(total_cash),
            "investments": str(total_investments),
        })

    return result
