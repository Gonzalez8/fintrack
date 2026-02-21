import math
from datetime import date
from decimal import Decimal, InvalidOperation
from django.utils import timezone
from .models import Asset, PriceSnapshot


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
            # Single ticker: Close is a simple Series
            col = data["Close"]
            val = col.dropna().iloc[-1]
            close = float(val)
            if not math.isnan(close):
                prices[ticker] = close
        except (IndexError, KeyError, TypeError, ValueError):
            pass
    else:
        # Multiple tickers: Close is a DataFrame with ticker columns
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


def update_prices():
    import yfinance as yf

    assets = list(
        Asset.objects.exclude(ticker__isnull=True)
        .exclude(ticker="")
    )
    if not assets:
        return {"updated": 0, "errors": [], "prices": []}

    ticker_map = {a.ticker: a for a in assets}
    tickers = list(ticker_map.keys())

    results = {"updated": 0, "errors": [], "prices": []}

    # First attempt: batch with 5d period
    prices = _fetch_batch(tickers, period="5d")

    # Second attempt: individually fetch missing ones with 1mo period
    missing = [t for t in tickers if t not in prices]
    if missing:
        for ticker in missing:
            fallback = _fetch_batch([ticker], period="1mo")
            prices.update(fallback)

    # Third attempt: use Ticker.history() for still-missing (crypto, forex, etc.)
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
    for ticker, asset in ticker_map.items():
        if ticker in prices:
            try:
                price = Decimal(str(round(prices[ticker], 6)))
                asset.current_price = price
                asset.price_status = Asset.PriceStatus.OK
                asset.price_updated_at = now
                asset.save(update_fields=[
                    "current_price", "price_status", "price_updated_at", "updated_at",
                ])
                PriceSnapshot.objects.update_or_create(
                    asset=asset, date=date.today(),
                    defaults={"price": price, "source": "YAHOO"},
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
