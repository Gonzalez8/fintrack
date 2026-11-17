import logging
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Min

from apps.assets.models import Asset

from .models import Dividend, DividendSuggestion, StockSplit, Transaction

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


# ---------------------------------------------------------------------------
# Dividend drafts
# ---------------------------------------------------------------------------

MONEY_Q = Decimal("0.01")
# A recorded dividend covers a Yahoo event if dated from a few days before its
# ex-date up to the next ex-date (payment comes days or weeks after the ex-date).
MATCH_MARGIN = timedelta(days=7)
LAST_EVENT_WINDOW = timedelta(days=120)
# Assets without any recorded dividend only look back this far (unless backfilling).
FIRST_RUN_LOOKBACK = timedelta(days=365)
WITHHOLDING_SAMPLE = 4


def _fetch_yahoo_dividend_data(ticker):
    """Return (dividends, splits, currency) from Yahoo.

    Dividends are ``[(ex_date, amount)]`` with amounts adjusted for later splits,
    as Yahoo reports them; splits are ``[(date, ratio)]``.
    """
    import yfinance as yf

    tk = yf.Ticker(ticker)
    dividends = sorted((ts.date(), float(v)) for ts, v in tk.dividends.items() if v and v > 0)
    splits = sorted((ts.date(), float(r)) for ts, r in tk.splits.items() if r and r > 0)
    try:
        currency = tk.fast_info.get("currency")
    except Exception:
        currency = None
    return dividends, splits, currency


def uncovered_events(events, recorded_dates):
    """Yahoo dividend events with no recorded dividend matching them.

    ``events`` are ``[(ex_date, amount)]`` sorted by date. Each recorded
    dividend covers at most one event: the first one whose window
    ``[ex_date − 7 days, next ex_date)`` contains it, so monthly or quarterly
    payers do not get crossed matches.
    """
    available = sorted(recorded_dates)
    uncovered = []
    for i, (ex_date, amount) in enumerate(events):
        end = events[i + 1][0] if i + 1 < len(events) else ex_date + LAST_EVENT_WINDOW
        match = next((d for d in available if ex_date - MATCH_MARGIN <= d < end), None)
        if match is None:
            uncovered.append((ex_date, amount))
        else:
            available.remove(match)
    return uncovered


def _withholding_rates(user, asset):
    """Origin and domestic withholding of the user's latest dividends of `asset` (over gross), or (None, None)."""
    recent = Dividend.objects.filter(owner=user, asset=asset, gross__gt=0).order_by("-date")[:WITHHOLDING_SAMPLE]
    gross = sum((d.gross for d in recent), Decimal("0"))
    if gross <= 0:
        return None, None
    tax = sum((d.tax for d in recent), Decimal("0")) / gross
    domestic = sum((d.domestic_tax for d in recent), Decimal("0")) / gross
    return tax, domestic or None


def detect_dividends(user, asset=None, backfill=False, today=None):
    """Create PENDING DividendSuggestion drafts for Yahoo dividends not yet recorded.

    Rules, per AUTO-priced asset with a ticker and transactions:

    1. Only ex-dates after the user's latest recorded dividend of the asset.
       Assets without any recorded dividend look back one year at most.
       ``backfill=True`` drops this rule (from the first purchase on).
    2. Skip events already covered by a recorded dividend (see
       ``uncovered_events``) or already suggested in any status.
    3. Only when shares were held on the ex-date.

    Shares are those held on the ex-date (splits applied); the amount per share
    is Yahoo's split-adjusted figure scaled back to that date. Pending drafts
    that a recorded dividend now covers are dismissed. Returns the new drafts.
    """
    today = today or date.today()
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
    if asset is not None:
        assets = assets.filter(pk=asset.pk)

    created = []
    for a in assets:
        try:
            dividends, splits, currency = _fetch_yahoo_dividend_data(a.ticker)
        except Exception as exc:
            logger.warning("Dividend lookup failed for %s: %s", a.ticker, exc)
            continue

        first_date = first_dates[a.id]
        events = [(d, amt) for d, amt in dividends if d > first_date]
        recorded = list(Dividend.objects.filter(owner=user, asset=a).values_list("date", flat=True))
        missing = uncovered_events(events, recorded)
        missing_dates = {d for d, _ in missing}

        DividendSuggestion.objects.filter(
            owner=user,
            asset=a,
            status=DividendSuggestion.Status.PENDING,
            ex_date__in=[d for d, _ in events if d not in missing_dates],
        ).update(status=DividendSuggestion.Status.DISMISSED)

        if backfill:
            lower = first_date
        elif recorded:
            lower = max(recorded)
        else:
            lower = max(first_date, today - FIRST_RUN_LOOKBACK)
        known = set(DividendSuggestion.objects.filter(owner=user, asset=a).values_list("ex_date", flat=True))
        rate, domestic_rate = _withholding_rates(user, a)

        for ex_date, adjusted_amount in missing:
            if ex_date <= lower or ex_date in known:
                continue
            shares = _held_quantity(user, a, ex_date, splits)
            if shares <= 0:
                continue
            factor = Decimal("1")
            for split_date, ratio in splits:
                if split_date >= ex_date:
                    factor *= Decimal(str(ratio))
            amount = (Decimal(str(adjusted_amount)) * factor).quantize(RATIO_Q, rounding=ROUND_HALF_UP)
            gross = (shares * amount).quantize(MONEY_Q, rounding=ROUND_HALF_UP)
            created.append(
                DividendSuggestion.objects.create(
                    owner=user,
                    asset=a,
                    ex_date=ex_date,
                    amount_per_share=amount,
                    currency=(currency or a.currency or "")[:3].upper(),
                    shares=shares,
                    gross=gross,
                    tax=(gross * rate).quantize(MONEY_Q, rounding=ROUND_HALF_UP) if rate is not None else None,
                    domestic_tax=(
                        (gross * domestic_rate).quantize(MONEY_Q, rounding=ROUND_HALF_UP) if domestic_rate else None
                    ),
                )
            )
    return created
