"""What-if sale of part of a position: which lots go out, the gain to declare and, when the user's fiscal
country has an adapter for it, the estimated tax. Read-only: nothing is recorded.

Lots come from the cost engine with the user's *fiscal* cost method (FIFO by default, mandatory in Spain for
homogeneous securities), the same one the tax views use, so the simulated gain matches what would be declared.
"""

import datetime
from decimal import ROUND_HALF_UP, Decimal

from apps.assets.models import Asset, Settings

from .services import _process_transactions


class SaleSimulationError(ValueError):
    """Invalid request (unknown asset, nothing held, bad quantity); the message is shown to the user."""


def simulate_sale(
    user,
    asset_id,
    quantity: Decimal,
    price: Decimal | None = None,
    commission: Decimal = Decimal("0"),
    today: datetime.date | None = None,
) -> dict:
    today = today or datetime.date.today()
    settings = Settings.load(user)
    money_exp = Decimal(10) ** -settings.rounding_money
    q = lambda v: v.quantize(money_exp, rounding=ROUND_HALF_UP)  # noqa: E731

    asset = Asset.objects.filter(owner=user, pk=asset_id).first()
    if asset is None:
        raise SaleSimulationError("Unknown asset.")
    method = settings.fiscal_cost_method
    lots, _, _, _ = _process_transactions(user, method=method)
    open_lots = [lot for lot in lots.get(asset.pk, ()) if lot["qty"] > 0]
    held = sum((lot["qty"] for lot in open_lots), Decimal("0"))
    if held <= 0:
        raise SaleSimulationError("No shares of this asset are held.")
    if quantity <= 0 or quantity > held:
        raise SaleSimulationError(f"Quantity must be between 0 and the {held} shares held.")
    if price is None:
        price = asset.current_price or Decimal("0")
    if price < 0 or commission < 0:
        raise SaleSimulationError("Price and commission cannot be negative.")

    # Oldest first for FIFO (and WAC, a single averaged lot); newest first for LIFO
    ordered = list(reversed(open_lots)) if method == Settings.CostBasisMethod.LIFO else open_lots
    remaining = quantity
    rows, cost_basis = [], Decimal("0")
    for lot in ordered:
        sold = min(remaining, lot["qty"])
        remaining -= sold
        cost = sold * lot["price_per_unit"]
        cost_basis += cost
        # The sale commission is shared among the lots by the shares each one gives
        lot_commission = commission * sold / quantity if sold else Decimal("0")
        rows.append(
            {
                "date": lot["date"].isoformat() if lot.get("date") else None,
                "quantity_held": str(lot["qty"]),
                "quantity_sold": str(sold),
                "unit_cost": str(q(lot["price_per_unit"])),
                "cost": str(q(cost)),
                "gain": str(q(sold * price - cost - lot_commission)) if sold else "0",
            }
        )
    proceeds = quantity * price - commission
    gain = proceeds - cost_basis

    data = {
        "asset": {
            "id": str(asset.pk),
            "name": asset.name,
            "ticker": asset.ticker,
            "currency": asset.currency,
            "held": str(held),
            "current_price": str(asset.current_price) if asset.current_price is not None else None,
        },
        "method": method,
        "date": today.isoformat(),
        "quantity": str(quantity),
        "price": str(price),
        "commission": str(q(commission)),
        "proceeds": str(q(proceeds)),
        "cost_basis": str(q(cost_basis)),
        "gain": str(q(gain)),
        "lots": rows,
        "tax": None,
    }

    from apps.reports.tax_adapters import get_adapter

    adapter = get_adapter(settings.tax_country)
    estimate = getattr(adapter, "estimate_sale_tax", None)
    if estimate is not None:
        data["tax"] = estimate(user, asset, gain, today)
    return data
