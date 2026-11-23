"""Rebuild the portfolio history from the operations: one PortfolioSnapshot per past trading day without one.

Fintrack only photographs the portfolio from the day it starts doing so, so the equity chart, the index comparison
and the net worth evolution have nothing before that. Each missing day is rebuilt from:

- the shares and cost held that day (``holdings_timeline`` with the user's cost basis method, splits applied),
- the asset's Yahoo close that day for Yahoo-priced assets (Yahoo adjusts old closes for later splits; they are
  scaled back with the applied splits so they match the shares held then),
- otherwise the price of the asset's last operation on or before that day, or its average cost.

It only adds snapshots on days that have none and never changes or deletes existing ones. All rows of one run
share a ``batch_id``.
"""

import datetime
import logging
import uuid
from bisect import bisect_right
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from apps.assets.models import Asset, PortfolioSnapshot, Settings
from apps.assets.services import fetch_daily_closes
from apps.core.cache import FINANCIAL_NAMESPACES, invalidate_user_cache
from apps.transactions.models import StockSplit, Transaction

from .services import holdings_timeline

logger = logging.getLogger(__name__)

# Rebuilt snapshots are dated at the close of the European session, local time
CAPTURE_TIME = datetime.time(18, 0)


class _Prices:
    """Price of one asset on any day: Yahoo close (split-scaled), last operation price or average cost."""

    def __init__(self, asset, closes, trades, splits):
        self.asset = asset
        self.closes = closes  # [(date, float)] oldest first
        self.trades = trades  # [(date, Decimal)] oldest first
        self.splits = splits  # [(date, factor)] applied, oldest first
        self.source = "YAHOO" if closes else "OPERATIONS"

    def _factor(self, after, until=None):
        """Product of the split factors dated after ``after`` (and up to ``until``)."""
        f = Decimal("1")
        for day, factor in self.splits:
            if day > after and (until is None or day <= until):
                f *= factor
        return f

    def on(self, day, qty, cost):
        if self.closes and self.closes[0][0] <= day:
            i = bisect_right(self.closes, day, key=lambda c: c[0])
            # Yahoo's close is in today's shares: scale it back to the shares held that day
            return Decimal(str(self.closes[i - 1][1])) * self._factor(day)
        i = bisect_right(self.trades, day, key=lambda t: t[0])
        if i:
            trade_day, price = self.trades[i - 1]
            return price / self._factor(trade_day, day)
        return cost / qty


def _prices(user, asset_ids, first):
    assets = Asset.objects.filter(owner=user, id__in=asset_ids)
    trades, splits = {}, {}
    for tx in (
        Transaction.objects.filter(owner=user, asset_id__in=asset_ids, price__gt=0)
        .order_by("date", "created_at")
        .values("asset_id", "date", "price")
    ):
        trades.setdefault(tx["asset_id"], []).append((tx["date"], tx["price"]))
    for sp in StockSplit.objects.filter(owner=user, asset_id__in=asset_ids, status=StockSplit.Status.APPLIED).order_by(
        "date"
    ):
        splits.setdefault(sp.asset_id, []).append((sp.date, sp.factor))

    prices = {}
    for asset in assets:
        closes = []
        if asset.price_source == Asset.PriceSource.YAHOO and asset.ticker:
            try:
                closes = fetch_daily_closes(asset.ticker, first)
            except Exception as exc:  # network, delisted ticker: fall back to the operations' prices
                logger.warning("History for %s unavailable: %s", asset.ticker, exc)
        prices[asset.id] = _Prices(asset, closes, trades.get(asset.id, []), splits.get(asset.id, []))
    return prices


def _plan(user, today):
    settings = Settings.load(user)
    money_exp = Decimal(10) ** -settings.rounding_money
    qty_exp = Decimal(10) ** -settings.rounding_qty
    timeline = holdings_timeline(user, settings.cost_basis_method)
    last_day = today - datetime.timedelta(days=1)  # today is photographed by the regular task
    if not timeline or timeline[0][0] > last_day:
        return settings, [], {}

    first = timeline[0][0]
    asset_ids = {aid for _, held in timeline for aid in held}
    prices = _prices(user, asset_ids, first)

    # Trading days from Yahoo; weekdays when no asset has Yahoo prices
    days = sorted({d for p in prices.values() for d, _ in p.closes if first <= d <= last_day})
    if not days:
        days = [
            first + datetime.timedelta(days=n)
            for n in range((last_day - first).days + 1)
            if (first + datetime.timedelta(days=n)).weekday() < 5
        ]
    photographed = {
        timezone.localtime(c).date()
        for c in PortfolioSnapshot.objects.filter(owner=user).values_list("captured_at", flat=True)
    }
    timeline_days = [d for d, _ in timeline]

    rows = []
    for day in days:
        if day in photographed:
            continue
        i = bisect_right(timeline_days, day)
        held = timeline[i - 1][1] if i else {}
        if not held:
            continue
        value = cost = Decimal("0")
        for aid, (qty, asset_cost) in held.items():
            price = prices[aid].on(day, qty, asset_cost)
            value += (qty.quantize(qty_exp, rounding=ROUND_HALF_UP) * price).quantize(money_exp, rounding=ROUND_HALF_UP)
            cost += asset_cost.quantize(money_exp, rounding=ROUND_HALF_UP)
        rows.append((day, value, cost))
    return settings, rows, prices


def _summary(settings, rows, prices, today):
    lowest = min(rows, key=lambda r: (r[1] - r[2]) / r[2] if r[2] else Decimal("0"), default=None)
    retention = settings.data_retention_days if settings.purge_portfolio_snapshots else None
    return {
        "method": settings.cost_basis_method,
        "days": len(rows),
        "first_date": rows[0][0].isoformat() if rows else None,
        "last_date": rows[-1][0].isoformat() if rows else None,
        "lowest": (
            {
                "date": lowest[0].isoformat(),
                "market_value": str(lowest[1]),
                "cost": str(lowest[2]),
                "pnl_pct": str(((lowest[1] - lowest[2]) / lowest[2] * 100).quantize(Decimal("0.01")))
                if lowest[2]
                else "0.00",
            }
            if lowest
            else None
        ),
        "assets": sorted(
            (
                {
                    "asset_id": str(p.asset.id),
                    "asset_name": p.asset.name,
                    "asset_ticker": p.asset.ticker,
                    "source": p.source,
                }
                for p in prices.values()
            ),
            key=lambda a: (a["source"] != "OPERATIONS", a["asset_name"]),
        ),
        # Snapshots older than this are deleted by the retention purge, rebuilt ones too
        "purged_before": (today - datetime.timedelta(days=retention)).isoformat() if retention else None,
    }


def preview_rebuild(user, today=None):
    """What a rebuild would add, without writing anything."""
    today = today or timezone.localdate()
    settings, rows, prices = _plan(user, today)
    return {**_summary(settings, rows, prices, today), "created": 0, "batch_id": None}


def rebuild_history(user, today=None):
    """Add the missing snapshots. Days that already have one are left as they are."""
    today = today or timezone.localdate()
    settings, rows, prices = _plan(user, today)
    batch_id = uuid.uuid4()
    tz = timezone.get_current_timezone()
    with transaction.atomic():
        PortfolioSnapshot.objects.bulk_create(
            [
                PortfolioSnapshot(
                    owner=user,
                    captured_at=datetime.datetime.combine(day, CAPTURE_TIME, tzinfo=tz),
                    batch_id=batch_id,
                    total_market_value=value,
                    total_cost=cost,
                    total_unrealized_pnl=value - cost,
                )
                for day, value, cost in rows
            ],
            batch_size=500,
        )
    invalidate_user_cache(user.pk, *FINANCIAL_NAMESPACES)
    return {
        **_summary(settings, rows, prices, today),
        "created": len(rows),
        "batch_id": str(batch_id) if rows else None,
    }
