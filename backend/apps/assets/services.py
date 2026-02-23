import math
import uuid
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from .models import Asset, PortfolioSnapshot, PositionSnapshot


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
    """Create a PortfolioSnapshot and one PositionSnapshot per open position.

    Skips creation if portfolio totals are identical to the last snapshot,
    which avoids storing redundant data during nights and weekends when
    market prices do not change.

    Wrapped in a single atomic transaction so PortfolioSnapshot and all its
    PositionSnapshots are always committed together or not at all, regardless
    of the call site (scheduler, management command, view, test, shell).
    """
    from apps.portfolio.services import calculate_portfolio

    data = calculate_portfolio()

    # Abort if positions exist but total is 0: prices are missing or broken.
    # Allow 0 only when there are genuinely no open positions (empty portfolio).
    has_positions = len(data["positions"]) > 0
    if has_positions and Decimal(data["total_market_value"]) <= 0:
        return

    # Skip if totals are identical to the last snapshot (prices unchanged).
    new_market_value = Decimal(data["total_market_value"])
    new_cost = Decimal(data["total_cost"])
    new_pnl = Decimal(data["total_unrealized_pnl"])
    last = PortfolioSnapshot.objects.order_by("-captured_at").first()
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
            captured_at=now,
            batch_id=batch_id,
            total_market_value=new_market_value,
            total_cost=new_cost,
            total_unrealized_pnl=new_pnl,
        )

        position_snapshots = [
            PositionSnapshot(
                batch_id=batch_id,
                captured_at=now,
                asset_id=pos["asset_id"],
                quantity=Decimal(pos["quantity"]),
                cost_basis=Decimal(pos["cost_total"]),
                market_value=Decimal(pos["market_value"]),
                unrealized_pnl=Decimal(pos["unrealized_pnl"]),
                unrealized_pnl_pct=Decimal(pos["unrealized_pnl_pct"]),
            )
            for pos in data["positions"]
        ]
        if position_snapshots:
            PositionSnapshot.objects.bulk_create(position_snapshots)


def update_prices():
    """Fetch latest prices from Yahoo Finance and update Asset.current_price.

    Does NOT create any snapshots — snapshot creation is handled exclusively
    by the background scheduler via create_portfolio_snapshot_now().
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

    now = timezone.now()

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
