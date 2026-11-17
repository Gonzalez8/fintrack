import logging
from collections import deque
from decimal import ROUND_HALF_UP, Decimal

from apps.assets.models import Account, Settings
from apps.transactions.models import StockSplit, Transaction

logger = logging.getLogger(__name__)


def _fetch_transactions(user):
    return Transaction.objects.filter(owner=user).select_related("asset").order_by("date", "created_at")


def _applied_splits(user):
    """APPLIED splits as plain dicts, oldest first."""
    return [
        {
            "date": sp.date,
            "asset_id": sp.asset_id,
            "factor": sp.factor,
            "ratio_from": sp.ratio_from,
            "ratio_to": sp.ratio_to,
        }
        for sp in StockSplit.objects.filter(owner=user, status=StockSplit.Status.APPLIED).order_by("date")
    ]


def _with_splits(transactions, splits, get_date):
    """Interleave transactions and splits chronologically.

    Yields ``("split", split)`` or ``("tx", tx)``. A split is yielded before any
    transaction on its own date, since trades on the split date already happen
    at post-split prices.
    """
    i = 0
    for tx in transactions:
        while i < len(splits) and splits[i]["date"] <= get_date(tx):
            yield "split", splits[i]
            i += 1
        yield "tx", tx
    for split in splits[i:]:
        yield "split", split


def _split_lots(asset_lots, factor, price_key="price_per_unit"):
    """Scale open lots by a split factor: more shares, same total cost."""
    for lot in asset_lots:
        lot["qty"] *= factor
        lot[price_key] /= factor


def _split_wac(state, factor):
    """Scale a WAC state by a split factor: more shares, same total cost."""
    state["total_qty"] *= factor
    for acct_id in state.get("acct_qty", {}):
        state["acct_qty"][acct_id] *= factor


def position_history(user, asset):
    """Chronological operations and splits of `asset` with the running share count.

    The share count does not depend on the cost method (FIFO/LIFO/WAC hold the
    same shares). A sale larger than the position stops at zero, as the engine
    does with oversells. PENDING splits are listed for context but only APPLIED
    ones change the quantity; DISMISSED ones are left out.
    """
    settings = Settings.load(user)
    qty_exp = Decimal(10) ** -settings.rounding_qty

    transactions = (
        Transaction.objects.filter(owner=user, asset=asset).select_related("account").order_by("date", "created_at")
    )
    splits = [
        {"date": sp.date, "asset_id": sp.asset_id, "factor": sp.factor, "split": sp}
        for sp in StockSplit.objects.filter(owner=user, asset=asset)
        .exclude(status=StockSplit.Status.DISMISSED)
        .order_by("date")
    ]

    qty = Decimal("0")
    events = []
    for kind, item in _with_splits(transactions, splits, lambda t: t.date):
        if kind == "split":
            sp = item["split"]
            if sp.status == StockSplit.Status.APPLIED:
                qty *= item["factor"]
            events.append(
                {
                    "kind": "SPLIT",
                    "id": str(sp.id),
                    "date": sp.date.isoformat(),
                    "status": sp.status,
                    "ratio_from": str(sp.ratio_from),
                    "ratio_to": str(sp.ratio_to),
                    "quantity_after": str(qty.quantize(qty_exp, rounding=ROUND_HALF_UP)),
                }
            )
            continue

        tx = item
        change = -tx.quantity if tx.type == Transaction.TransactionType.SELL else tx.quantity
        qty = max(qty + change, Decimal("0"))
        events.append(
            {
                "kind": tx.type,
                "id": str(tx.id),
                "date": tx.date.isoformat(),
                "account_name": tx.account.name,
                "quantity": str(tx.quantity),
                "price": str(tx.price) if tx.price is not None else None,
                "quantity_after": str(qty.quantize(qty_exp, rounding=ROUND_HALF_UP)),
            }
        )

    return {"quantity": str(qty.quantize(qty_exp, rounding=ROUND_HALF_UP)), "events": events}


def compute_investment_cost_by_month(user):
    """Compute running investment cost at end of each month.

    Uses the user's fiscal_cost_method (FIFO/LIFO/WAC) to track lots.
    Returns dict mapping "YYYY-MM" → Decimal running investment cost.
    """
    return {day.strftime("%Y-%m"): cost for day, cost in investment_cost_timeline(user)}


def investment_cost_timeline(user):
    """Running investment cost after each day with operations: ``[(date, Decimal), …]`` in date order.

    Uses the user's fiscal_cost_method (FIFO/LIFO/WAC) to track lots, with splits applied. The cost on any date
    is the last entry on or before it.
    """
    settings = Settings.load(user)
    method = settings.fiscal_cost_method
    use_wac = method == "WAC"
    use_lifo = method == "LIFO"
    gift_market = settings.gift_cost_mode == "MARKET"

    lots: dict = {}
    wac_state: dict = {}
    running_cost = Decimal("0")
    cost_by_day: dict = {}

    transactions = (
        Transaction.objects.filter(owner=user)
        .order_by("date", "created_at")
        .values("date", "type", "asset_id", "quantity", "price", "commission", "tax")
    )
    for kind, tx in _with_splits(transactions, _applied_splits(user), lambda t: t["date"]):
        if kind == "split":
            if use_wac:
                if tx["asset_id"] in wac_state:
                    _split_wac(wac_state[tx["asset_id"]], tx["factor"])
            else:
                _split_lots(lots.get(tx["asset_id"], ()), tx["factor"], price_key="ppu")
            continue

        aid = tx["asset_id"]
        qty = tx["quantity"] or Decimal("0")
        price = tx["price"] or Decimal("0")
        commission = tx["commission"] or Decimal("0")
        tax = tx["tax"] or Decimal("0")

        if tx["type"] == "BUY":
            ppu = price + (commission + tax) / qty if qty else Decimal("0")
            running_cost += qty * ppu
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
            ppu = price if gift_market else Decimal("0")
            running_cost += qty * ppu
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
                    running_cost -= avg * qty
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
                    running_cost -= consumed * lot["ppu"]
                    lot["qty"] -= consumed
                    remaining -= consumed
                    if lot["qty"] <= 0:
                        lots[aid].pop() if use_lifo else lots[aid].popleft()

        cost_by_day[tx["date"]] = running_cost

    return sorted(cost_by_day.items())


def _process_lot_based(user, lifo=False):
    settings = Settings.load(user)
    money_exp = Decimal(10) ** -settings.rounding_money

    lots = {}
    asset_map = {}
    realized_sales = []

    for kind, tx in _with_splits(_fetch_transactions(user), _applied_splits(user), lambda t: t.date):
        if kind == "split":
            _split_lots(lots.get(tx["asset_id"], ()), tx["factor"])
            continue

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
                lot = lots[aid][-1] if lifo else lots[aid][0]
                consumed = min(remaining, lot["qty"])
                cost_basis += lot["price_per_unit"] * consumed
                lot["qty"] -= consumed
                remaining -= consumed
                if lot["qty"] <= 0:
                    lots[aid].pop() if lifo else lots[aid].popleft()

            if remaining > 0:
                logger.warning(
                    "Oversell detected for asset %s: %s shares not covered by lots",
                    aid,
                    remaining,
                )

            total_cost_basis = cost_basis.quantize(money_exp, rounding=ROUND_HALF_UP)
            sell_total = (sell_price * tx.quantity - tx.commission - tx.tax).quantize(money_exp, rounding=ROUND_HALF_UP)
            pnl = (sell_total - total_cost_basis).quantize(money_exp, rounding=ROUND_HALF_UP)

            realized_sales.append(
                {
                    "date": tx.date.isoformat(),
                    "asset_name": tx.asset.name,
                    "asset_ticker": tx.asset.ticker,
                    "quantity": str(tx.quantity),
                    "sell_price": str(sell_price.quantize(money_exp, rounding=ROUND_HALF_UP)),
                    "cost_basis": str(total_cost_basis),
                    "proceeds": str(sell_total),
                    "realized_pnl": str(pnl),
                    "oversell_quantity": str(remaining),
                }
            )

    return lots, realized_sales, asset_map, settings


def _process_wac(user):
    settings = Settings.load(user)
    money_exp = Decimal(10) ** -settings.rounding_money

    wac_state = {}
    asset_map = {}
    realized_sales = []

    for kind, tx in _with_splits(_fetch_transactions(user), _applied_splits(user), lambda t: t.date):
        if kind == "split":
            if tx["asset_id"] in wac_state:
                _split_wac(wac_state[tx["asset_id"]], tx["factor"])
            continue

        aid = tx.asset_id
        if aid not in wac_state:
            wac_state[aid] = {"total_qty": Decimal("0"), "total_cost": Decimal("0"), "acct_qty": {}}
        asset_map[aid] = tx.asset
        state = wac_state[aid]

        if tx.type == Transaction.TransactionType.BUY:
            price = tx.price or Decimal("0")
            price_per_unit = price + (tx.commission + tx.tax) / tx.quantity if tx.quantity else Decimal("0")
            state["total_qty"] += tx.quantity
            state["total_cost"] += price_per_unit * tx.quantity
            state["acct_qty"][tx.account_id] = state["acct_qty"].get(tx.account_id, Decimal("0")) + tx.quantity

        elif tx.type == Transaction.TransactionType.GIFT:
            if settings.gift_cost_mode == Settings.GiftCostMode.MARKET:
                price_per_unit = tx.price or Decimal("0")
            else:
                price_per_unit = Decimal("0")
            state["total_qty"] += tx.quantity
            state["total_cost"] += price_per_unit * tx.quantity
            state["acct_qty"][tx.account_id] = state["acct_qty"].get(tx.account_id, Decimal("0")) + tx.quantity

        elif tx.type == Transaction.TransactionType.SELL:
            sell_price = tx.price or Decimal("0")
            avg_price = (state["total_cost"] / state["total_qty"]) if state["total_qty"] > 0 else Decimal("0")
            oversell_qty = max(Decimal("0"), tx.quantity - state["total_qty"])
            covered_qty = tx.quantity - oversell_qty
            cost_basis = (avg_price * covered_qty).quantize(money_exp, rounding=ROUND_HALF_UP)

            if oversell_qty > 0:
                logger.warning(
                    "Oversell detected for asset %s (WAC): %s shares not covered",
                    aid,
                    oversell_qty,
                )

            state["total_qty"] -= tx.quantity
            state["total_cost"] -= avg_price * covered_qty
            if state["total_qty"] <= 0:
                state["total_qty"] = Decimal("0")
                state["total_cost"] = Decimal("0")

            sell_total = (sell_price * tx.quantity - tx.commission - tx.tax).quantize(money_exp, rounding=ROUND_HALF_UP)
            pnl = (sell_total - cost_basis).quantize(money_exp, rounding=ROUND_HALF_UP)

            realized_sales.append(
                {
                    "date": tx.date.isoformat(),
                    "asset_name": tx.asset.name,
                    "asset_ticker": tx.asset.ticker,
                    "quantity": str(tx.quantity),
                    "sell_price": str(sell_price.quantize(money_exp, rounding=ROUND_HALF_UP)),
                    "cost_basis": str(cost_basis),
                    "proceeds": str(sell_total),
                    "realized_pnl": str(pnl),
                    "oversell_quantity": str(oversell_qty),
                }
            )

            for acct_id in list(state["acct_qty"]):
                if state["acct_qty"][acct_id] > 0:
                    state["acct_qty"][acct_id] -= tx.quantity
                    if state["acct_qty"][acct_id] <= 0:
                        del state["acct_qty"][acct_id]
                    break

    lots = {}
    for aid, state in wac_state.items():
        if state["total_qty"] > 0:
            avg_price = state["total_cost"] / state["total_qty"]
            primary_account = max(state["acct_qty"], key=state["acct_qty"].get) if state["acct_qty"] else None
            lots[aid] = deque([{"qty": state["total_qty"], "price_per_unit": avg_price, "account_id": primary_account}])
        else:
            lots[aid] = deque()

    return lots, realized_sales, asset_map, settings


def _process_transactions(user, method=None):
    if method is None:
        settings = Settings.load(user)
        method = settings.cost_basis_method
    if method == Settings.CostBasisMethod.WAC:
        return _process_wac(user)
    if method == Settings.CostBasisMethod.LIFO:
        return _process_lot_based(user, lifo=True)
    return _process_lot_based(user, lifo=False)


def calculate_realized_pnl(user):
    _, realized_sales, _, settings = _process_transactions(user)
    money_exp = Decimal(10) ** -settings.rounding_money
    total = sum((Decimal(s["realized_pnl"]) for s in realized_sales), Decimal("0"))
    return {
        "realized_pnl_total": str(total.quantize(money_exp, rounding=ROUND_HALF_UP)),
        "realized_sales": realized_sales,
    }


def calculate_realized_pnl_fiscal(user):
    settings = Settings.load(user)
    _, realized_sales, _, settings = _process_transactions(user, method=settings.fiscal_cost_method)
    money_exp = Decimal(10) ** -settings.rounding_money
    total = sum((Decimal(s["realized_pnl"]) for s in realized_sales), Decimal("0"))
    return {
        "realized_pnl_total": str(total.quantize(money_exp, rounding=ROUND_HALF_UP)),
        "realized_sales": realized_sales,
    }


def _build_portfolio(lots, asset_map, money_exp, qty_exp, user):
    positions = []
    total_market_value = Decimal("0")

    splits_by_asset = {}
    for sp in _applied_splits(user):
        splits_by_asset.setdefault(sp["asset_id"], []).append(sp)

    for aid, asset_lots in lots.items():
        qty = sum((lot["qty"] for lot in asset_lots), Decimal("0"))
        cost_total = sum((lot["qty"] * lot["price_per_unit"] for lot in asset_lots), Decimal("0"))

        if qty.quantize(qty_exp, rounding=ROUND_HALF_UP) <= 0:
            continue
        asset = asset_map[aid]
        if not asset.current_price:
            continue

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
            if cost_total_r > 0
            else Decimal("0")
        )
        total_market_value += market_value

        positions.append(
            {
                "asset_id": str(aid),
                "asset_name": asset.name,
                "asset_ticker": asset.ticker,
                "asset_type": asset.type,
                "currency": asset.currency,
                "account_id": str(primary_account_id) if primary_account_id else None,
                "quantity": str(quantity),
                "avg_cost": str(avg_cost),
                "cost_basis": str(cost_total_r),
                "current_price": str(current_price),
                "market_value": str(market_value),
                "unrealized_pnl": str(unrealized_pnl),
                "unrealized_pnl_pct": str(unrealized_pnl_pct),
                "weight": "0",
                "splits": [
                    {
                        "date": sp["date"].isoformat(),
                        "ratio_from": str(sp["ratio_from"]),
                        "ratio_to": str(sp["ratio_to"]),
                    }
                    for sp in splits_by_asset.get(aid, [])
                ],
            }
        )

    if total_market_value > 0:
        for p in positions:
            weight = (Decimal(p["market_value"]) / total_market_value * 100).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            p["weight"] = str(weight)

    positions.sort(key=lambda p: Decimal(p["market_value"]), reverse=True)

    total_cost = sum((Decimal(p["cost_basis"]) for p in positions), Decimal("0"))
    total_pnl = sum((Decimal(p["unrealized_pnl"]) for p in positions), Decimal("0"))

    accounts = []
    total_cash = Decimal("0")
    for acc in Account.objects.filter(owner=user):
        bal = acc.balance or Decimal("0")
        if bal != 0:
            total_cash += bal
            accounts.append(
                {
                    "account_id": str(acc.id),
                    "account_name": acc.name,
                    "account_type": acc.type,
                    "balance": str(bal.quantize(money_exp, rounding=ROUND_HALF_UP)),
                }
            )

    grand_total = total_market_value + total_cash
    total_unrealized_pnl_pct = (
        (total_pnl / total_cost * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if total_cost > 0
        else Decimal("0")
    )

    return {
        "totals": {
            "total_market_value": str(total_market_value.quantize(money_exp, rounding=ROUND_HALF_UP)),
            "total_cost": str(total_cost.quantize(money_exp, rounding=ROUND_HALF_UP)),
            "total_unrealized_pnl": str(total_pnl.quantize(money_exp, rounding=ROUND_HALF_UP)),
            "total_unrealized_pnl_pct": str(total_unrealized_pnl_pct),
            "total_realized_pnl": "0.00",
            "total_cash": str(total_cash.quantize(money_exp, rounding=ROUND_HALF_UP)),
            "grand_total": str(grand_total.quantize(money_exp, rounding=ROUND_HALF_UP)),
        },
        "accounts": accounts,
        "positions": positions,
    }


def calculate_portfolio(user):
    lots, _, asset_map, settings = _process_transactions(user)
    money_exp = Decimal(10) ** -settings.rounding_money
    qty_exp = Decimal(10) ** -settings.rounding_qty
    return _build_portfolio(lots, asset_map, money_exp, qty_exp, user)


def calculate_portfolio_full(user):
    lots, realized_sales, asset_map, settings = _process_transactions(user)
    money_exp = Decimal(10) ** -settings.rounding_money
    qty_exp = Decimal(10) ** -settings.rounding_qty

    data = _build_portfolio(lots, asset_map, money_exp, qty_exp, user)

    total_realized = sum((Decimal(s["realized_pnl"]) for s in realized_sales), Decimal("0"))
    data["totals"]["total_realized_pnl"] = str(total_realized.quantize(money_exp, rounding=ROUND_HALF_UP))
    data["realized_sales"] = realized_sales

    return data
