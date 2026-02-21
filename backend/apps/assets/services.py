import math
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation

from django.utils import timezone

from .models import Asset, PortfolioSnapshot, PriceSnapshot


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


def create_portfolio_snapshot_now() -> None:
    """Create a PortfolioSnapshot using the current FIFO-computed portfolio value.

    Called by the background scheduler according to snapshot_frequency.
    Uses the same calculation engine as the portfolio page to ensure consistency.
    """
    from apps.portfolio.services import calculate_portfolio

    data = calculate_portfolio()
    now = timezone.now()

    PortfolioSnapshot.objects.create(
        captured_at=now,
        batch_id=uuid.uuid4(),
        total_market_value=Decimal(data["total_market_value"]),
        total_cost=Decimal(data["total_cost"]),
        total_unrealized_pnl=Decimal(data["total_unrealized_pnl"]),
    )


def update_prices():
    """Fetch latest prices from Yahoo Finance and update Asset.current_price.

    Also saves a PriceSnapshot per asset for historical price tracking.
    Does NOT create PortfolioSnapshot — that is handled by the background scheduler.
    """
    import yfinance as yf

    assets = list(
        Asset.objects.filter(price_mode=Asset.PriceMode.AUTO)
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

    batch_id = uuid.uuid4()
    now = timezone.now()
    today = now.date()

    for ticker, asset in ticker_map.items():
        if ticker in prices:
            try:
                price = Decimal(str(round(prices[ticker], 6)))
                asset.current_price = price
                asset.price_source = Asset.PriceSource.YAHOO
                asset.price_status = Asset.PriceStatus.OK
                asset.price_updated_at = now
                asset.save(update_fields=[
                    "current_price", "price_source", "price_status",
                    "price_updated_at", "updated_at",
                ])
                PriceSnapshot.objects.create(
                    asset=asset,
                    date=today,
                    price=price,
                    source="YAHOO",
                    captured_at=now,
                    batch_id=batch_id,
                )
                results["updated"] += 1
                results["prices"].append({
                    "ticker": ticker,
                    "name": asset.name,
                    "price": str(price),
                })
            except (InvalidOperation, ValueError) as e:
                asset.price_status = Asset.PriceStatus.ERROR
                asset.price_updated_at = now
                asset.save(update_fields=["price_status", "price_updated_at", "updated_at"])
                results["errors"].append(f"{ticker}: {str(e)}")
        else:
            asset.price_status = Asset.PriceStatus.ERROR
            asset.price_updated_at = now
            asset.save(update_fields=["price_status", "price_updated_at", "updated_at"])
            results["errors"].append(f"{ticker}: no price data found")

    return results
