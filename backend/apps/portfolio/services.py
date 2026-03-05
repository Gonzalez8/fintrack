from collections import deque
from decimal import Decimal, ROUND_HALF_UP
from apps.assets.models import Account, Settings
from apps.transactions.models import Transaction


def _process_fifo(user):
    """Single FIFO pass over all transactions belonging to `user`.

    Returns (lots, realized_sales, asset_map, settings) where:
    - lots: dict[asset_id] -> deque of remaining lots [{qty, price_per_unit, account_id}]
    - realized_sales: list of sale dicts
    - asset_map: dict[asset_id] -> Asset instance
    - settings: Settings for this user
    """
    settings = Settings.load(user)
    money_exp = Decimal(10) ** -settings.rounding_money

    transactions = (
        Transaction.objects.filter(owner=user)
        .select_related("asset")
        .order_by("date", "created_at")
    )

    lots = {}        # asset_id -> deque of [{qty, price_per_unit, account_id}]
    asset_map = {}   # asset_id -> Asset
    realized_sales = []

    for tx in transactions:
        aid = tx.asset_id
        if aid not in lots:
            lots[aid] = deque()
        asset_map[aid] = tx.asset

        if tx.type == Transaction.TransactionType.BUY:
            price = tx.price or Decimal("0")
            price_per_unit = price + (tx.commission + tx.tax) / tx.quantity if tx.quantity else Decimal("0")
            lots[aid].append({"qty": tx.quantity, "price_per_unit": price_per_unit, "account_id": tx.account_id})

        elif tx.type == Transaction.TransactionType.GIFT:
            if settings.gift_cost_mode == Settings.GiftCostMode.MARKET:
                price_per_unit = tx.price or Decimal("0")
            else:
                price_per_unit = Decimal("0")
            lots[aid].append({"qty": tx.quantity, "price_per_unit": price_per_unit, "account_id": tx.account_id})

        elif tx.type == Transaction.TransactionType.SELL:
            sell_price = tx.price or Decimal("0")
            remaining = tx.quantity
            cost_basis = Decimal("0")

            while remaining > 0 and lots[aid]:
                lot = lots[aid][0]
                consumed = min(remaining, lot["qty"])
                cost_basis += lot["price_per_unit"] * consumed
                lot["qty"] -= consumed
                remaining -= consumed
                if lot["qty"] <= 0:
                    lots[aid].popleft()

            total_cost_basis = cost_basis.quantize(money_exp, rounding=ROUND_HALF_UP)
            sell_total = (sell_price * tx.quantity - tx.commission - tx.tax).quantize(money_exp, rounding=ROUND_HALF_UP)
            pnl = (sell_total - total_cost_basis).quantize(money_exp, rounding=ROUND_HALF_UP)
            pnl_pct = (
                (pnl / total_cost_basis * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                if total_cost_basis > 0 else Decimal("0")
            )

            realized_sales.append({
                "date": tx.date.isoformat(),
                "asset_name": tx.asset.name,
                "asset_ticker": tx.asset.ticker,
                "quantity": str(tx.quantity),
                "cost_basis": str(total_cost_basis),
                "sell_total": str(sell_total),
                "realized_pnl": str(pnl),
                "realized_pnl_pct": str(pnl_pct),
            })

    return lots, realized_sales, asset_map, settings


def calculate_realized_pnl(user):
    """Calculate realized P&L using FIFO (First In, First Out) method."""
    _, realized_sales, _, settings = _process_fifo(user)
    money_exp = Decimal(10) ** -settings.rounding_money
    total = sum((Decimal(s["realized_pnl"]) for s in realized_sales), Decimal("0"))

    return {
        "realized_pnl_total": str(total.quantize(money_exp, rounding=ROUND_HALF_UP)),
        "realized_sales": realized_sales,
    }


def _build_portfolio(lots, asset_map, money_exp, qty_exp, user):
    """Build portfolio dict from remaining FIFO lots for a given user."""
    positions = []
    total_market_value = Decimal("0")

    for aid, asset_lots in lots.items():
        qty = sum((lot["qty"] for lot in asset_lots), Decimal("0"))
        cost_total = sum((lot["qty"] * lot["price_per_unit"] for lot in asset_lots), Decimal("0"))

        if qty.quantize(qty_exp, rounding=ROUND_HALF_UP) <= 0:
            continue
        asset = asset_map[aid]
        if not asset.ticker or not asset.current_price:
            continue

        # Determine primary account (the one holding the most shares)
        acct_qty = {}
        for lot in asset_lots:
            if lot["qty"] > 0:
                acct_qty[lot["account_id"]] = acct_qty.get(lot["account_id"], Decimal("0")) + lot["qty"]
        primary_account_id = max(acct_qty, key=acct_qty.get) if acct_qty else None

        quantity = qty.quantize(qty_exp, rounding=ROUND_HALF_UP)
        cost_total_r = cost_total.quantize(money_exp, rounding=ROUND_HALF_UP)
        avg_cost = (cost_total / qty).quantize(money_exp, rounding=ROUND_HALF_UP)
        current_price = asset.current_price or Decimal("0")
        market_value = (quantity * current_price).quantize(money_exp, rounding=ROUND_HALF_UP)
        unrealized_pnl = (market_value - cost_total_r).quantize(money_exp, rounding=ROUND_HALF_UP)
        unrealized_pnl_pct = (
            (unrealized_pnl / cost_total_r * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if cost_total_r > 0 else Decimal("0")
        )
        total_market_value += market_value

        positions.append({
            "asset_id": str(aid),
            "asset_name": asset.name,
            "asset_ticker": asset.ticker,
            "asset_type": asset.type,
            "account_id": str(primary_account_id) if primary_account_id else None,
            "quantity": str(quantity),
            "avg_cost": str(avg_cost),
            "cost_total": str(cost_total_r),
            "current_price": str(current_price),
            "market_value": str(market_value),
            "unrealized_pnl": str(unrealized_pnl),
            "unrealized_pnl_pct": str(unrealized_pnl_pct),
            "weight_pct": "0",
        })

    if total_market_value > 0:
        for p in positions:
            weight = (Decimal(p["market_value"]) / total_market_value * 100).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            p["weight_pct"] = str(weight)

    positions.sort(key=lambda p: Decimal(p["market_value"]), reverse=True)

    total_cost = sum((Decimal(p["cost_total"]) for p in positions), Decimal("0"))
    total_pnl = sum((Decimal(p["unrealized_pnl"]) for p in positions), Decimal("0"))

    accounts = []
    total_cash = Decimal("0")
    for acc in Account.objects.filter(owner=user):
        bal = acc.balance or Decimal("0")
        if bal != 0:
            total_cash += bal
            accounts.append({
                "account_id": str(acc.id),
                "account_name": acc.name,
                "account_type": acc.type,
                "balance": str(bal.quantize(money_exp, rounding=ROUND_HALF_UP)),
            })

    grand_total = total_market_value + total_cash

    return {
        "total_market_value": str(total_market_value.quantize(money_exp, rounding=ROUND_HALF_UP)),
        "total_cost": str(total_cost.quantize(money_exp, rounding=ROUND_HALF_UP)),
        "total_unrealized_pnl": str(total_pnl.quantize(money_exp, rounding=ROUND_HALF_UP)),
        "total_cash": str(total_cash.quantize(money_exp, rounding=ROUND_HALF_UP)),
        "grand_total": str(grand_total.quantize(money_exp, rounding=ROUND_HALF_UP)),
        "accounts": accounts,
        "positions": positions,
    }


def calculate_portfolio(user):
    lots, _, asset_map, settings = _process_fifo(user)
    money_exp = Decimal(10) ** -settings.rounding_money
    qty_exp = Decimal(10) ** -settings.rounding_qty
    return _build_portfolio(lots, asset_map, money_exp, qty_exp, user)


def calculate_portfolio_full(user):
    """Single FIFO pass returning both portfolio positions and realized sales."""
    lots, realized_sales, asset_map, settings = _process_fifo(user)
    money_exp = Decimal(10) ** -settings.rounding_money
    qty_exp = Decimal(10) ** -settings.rounding_qty

    data = _build_portfolio(lots, asset_map, money_exp, qty_exp, user)

    total_realized = sum((Decimal(s["realized_pnl"]) for s in realized_sales), Decimal("0"))
    data["realized_pnl_total"] = str(total_realized.quantize(money_exp, rounding=ROUND_HALF_UP))
    data["realized_sales"] = realized_sales

    return data
