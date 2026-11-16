import logging
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Min

from apps.assets.models import Asset

from .models import StockSplit, Transaction

logger = logging.getLogger(__name__)

RATIO_Q = Decimal("0.000001")


def _fetch_yahoo_splits(ticker):
    """Return [(date, ratio)] from Yahoo Finance. ratio = new shares per old share."""
    import yfinance as yf

    series = yf.Ticker(ticker).splits
    return [(ts.date(), float(ratio)) for ts, ratio in series.items() if ratio and ratio > 0]


def ratio_parts(ratio):
    """Convert a Yahoo split ratio into (ratio_from, ratio_to).

    4.0 → (1, 4) for a 4:1 split; 0.1 → (10, 1) for a 1:10 reverse split.
    """
    if ratio >= 1:
        return Decimal("1"), Decimal(str(ratio)).quantize(RATIO_Q, rounding=ROUND_HALF_UP)
    return Decimal(str(1 / ratio)).quantize(RATIO_Q, rounding=ROUND_HALF_UP), Decimal("1")


def _held_quantity(user, asset, before, yahoo_splits):
    """Shares of `asset` held just before `before`.

    Replays BUY/GIFT/SELL in order and applies every earlier Yahoo split, so a
    sale entered in post-split shares is not compared against pre-split buys.
    """
    splits = sorted((d, Decimal(str(r))) for d, r in yahoo_splits if d < before)
    qty = Decimal("0")
    i = 0
    for tx_date, tx_type, quantity in (
        Transaction.objects.filter(owner=user, asset=asset, date__lt=before)
        .order_by("date", "created_at")
        .values_list("date", "type", "quantity")
    ):
        while i < len(splits) and splits[i][0] <= tx_date:
            qty *= splits[i][1]
            i += 1
        qty += -quantity if tx_type == Transaction.TransactionType.SELL else quantity
    return qty


def detect_splits(user):
    """Create PENDING StockSplit suggestions for Yahoo splits not yet recorded.

    Only considers AUTO-priced assets with a ticker, splits after the first
    transaction of the asset, and dates where the user actually held shares.
    Splits already recorded for the same asset and date (in any status,
    including DISMISSED) are never suggested again. Returns the created splits.
    """
    first_dates = dict(
        Transaction.objects.filter(owner=user)
        .values("asset_id")
        .annotate(first=Min("date"))
        .values_list("asset_id", "first")
    )
    assets = (
        Asset.objects.filter(owner=user, price_mode=Asset.PriceMode.AUTO, id__in=first_dates)
        .exclude(ticker__isnull=True)
        .exclude(ticker="")
    )
    known = set(StockSplit.objects.filter(owner=user).values_list("asset_id", "date"))

    created = []
    for asset in assets:
        try:
            yahoo_splits = _fetch_yahoo_splits(asset.ticker)
        except Exception as exc:
            logger.warning("Split lookup failed for %s: %s", asset.ticker, exc)
            continue

        for split_date, ratio in yahoo_splits:
            if split_date <= first_dates[asset.id] or (asset.id, split_date) in known:
                continue
            if _held_quantity(user, asset, split_date, yahoo_splits) <= 0:
                continue
            ratio_from, ratio_to = ratio_parts(ratio)
            created.append(
                StockSplit.objects.create(
                    owner=user,
                    asset=asset,
                    date=split_date,
                    ratio_from=ratio_from,
                    ratio_to=ratio_to,
                    status=StockSplit.Status.PENDING,
                    source=StockSplit.Source.AUTO,
                )
            )
            known.add((asset.id, split_date))

    return created
