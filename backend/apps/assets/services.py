import math
import uuid
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from .models import Asset, PortfolioSnapshot


def _fetch_batch(tickers, period="5d"):
    """Fetch latest closing prices for a list of tickers. Returns {ticker: float}."""
    import yfinance as yf

    if not tickers:
        return {}

    data = yf.download(tickers, period=period, progress=False, threads=True)
    if data.empty:
        return {}

    prices = {}

    if len(tickers) == 1:
        ticker = tickers[0]
        try:
            col = data["Close"]
            val = col.dropna().iloc[-1]
            close = float(val)
            if not math.isnan(close):
                prices[ticker] = close
        except (IndexError, KeyError, TypeError, ValueError):
            pass
    else:
        close_df = data["Close"]
        for ticker in tickers:
            try:
                col = close_df[ticker].dropna()
                if col.empty:
                    continue
                close = float(col.iloc[-1])
                if not math.isnan(close):
                    prices[ticker] = close
            except (IndexError, KeyError, TypeError, ValueError):
                pass

    return prices


def create_portfolio_snapshot_now(user) -> None:
    """Create a PortfolioSnapshot for `user`.

    Skips creation if portfolio totals are identical to the last snapshot.
    """
    from apps.portfolio.services import calculate_portfolio

    data = calculate_portfolio(user)

    totals = data["totals"]
    has_positions = len(data["positions"]) > 0
    if has_positions and Decimal(totals["total_market_value"]) <= 0:
        return

    new_market_value = Decimal(totals["total_market_value"])
    new_cost = Decimal(totals["total_cost"])
    new_pnl = Decimal(totals["total_unrealized_pnl"])
    last = PortfolioSnapshot.objects.filter(owner=user).order_by("-captured_at").first()
    if (
        last is not None
        and last.total_market_value == new_market_value
        and last.total_cost == new_cost
        and last.total_unrealized_pnl == new_pnl
    ):
        return

    now = timezone.now()
    batch_id = uuid.uuid4()

    with transaction.atomic():
        PortfolioSnapshot.objects.create(
            owner=user,
            captured_at=now,
            batch_id=batch_id,
            total_market_value=new_market_value,
            total_cost=new_cost,
            total_unrealized_pnl=new_pnl,
        )


def update_prices(user):
    """Fetch latest prices from Yahoo Finance for all AUTO-mode assets of `user`."""
    import yfinance as yf

    assets = list(
        Asset.objects.filter(owner=user, price_mode=Asset.PriceMode.AUTO)
        .exclude(ticker__isnull=True)
        .exclude(ticker="")
    )
    if not assets:
        return {"updated": 0, "errors": [], "prices": []}

    ticker_map = {a.ticker: a for a in assets}
    tickers = list(ticker_map.keys())
    results = {"updated": 0, "errors": [], "prices": []}

    prices = _fetch_batch(tickers, period="5d")

    missing = [t for t in tickers if t not in prices]
    if missing:
        for ticker in missing:
            fallback = _fetch_batch([ticker], period="1mo")
            prices.update(fallback)

    still_missing = [t for t in tickers if t not in prices]
    if still_missing:
        for ticker in still_missing:
            try:
                t = yf.Ticker(ticker)
                h = t.history(period="5d")
                if not h.empty:
                    close = float(h["Close"].dropna().iloc[-1])
                    if not math.isnan(close):
                        prices[ticker] = close
            except Exception:
                pass

    now = timezone.now()
    updated_assets = []
    error_assets = []

    for ticker, asset in ticker_map.items():
        if ticker in prices:
            try:
                price = Decimal(str(round(prices[ticker], 6)))
                asset.current_price = price
                asset.price_source = Asset.PriceSource.YAHOO
                asset.price_status = Asset.PriceStatus.OK
                asset.price_updated_at = now
                updated_assets.append(asset)
                results["updated"] += 1
                results["prices"].append(
                    {
                        "ticker": ticker,
                        "name": asset.name,
                        "price": str(price),
                    }
                )
            except (InvalidOperation, ValueError) as e:
                asset.price_status = Asset.PriceStatus.ERROR
                asset.price_updated_at = now
                error_assets.append(asset)
                results["errors"].append(f"{ticker}: {str(e)}")
        else:
            asset.price_status = Asset.PriceStatus.ERROR
            asset.price_updated_at = now
            error_assets.append(asset)
            results["errors"].append(f"{ticker}: no price data found")

    update_fields = ["current_price", "price_source", "price_status", "price_updated_at", "updated_at"]
    if updated_assets:
        Asset.objects.bulk_update(updated_assets, update_fields, batch_size=100)
    if error_assets:
        Asset.objects.bulk_update(error_assets, ["price_status", "price_updated_at", "updated_at"], batch_size=100)

    return results
