"""Money-weighted returns (XIRR) of the portfolio and of each asset, and a benchmark "ghost portfolio".

Cash flows, from the investor's side (negative = money put in, positive = money taken out):
- BUY: −(quantity × price + commission + tax)
- GIFT: −(quantity × price), the value the shares came in with (no cash moved, but it is capital)
- SELL: +(quantity × price − commission − tax)
- Dividend: +net
- Today: +market value of what is still held

The benchmark replays the same money in an accumulating index ETF: each buy or gift buys index units
for the same amount on that day, each sale sells units for the same proceeds. Dividends are not replayed:
an accumulating ETF already reinvests its own, so comparing the user's flows (dividends included) with
the ETF's is like for like.

Rates are floats (they are ratios, not money); amounts stay Decimal.
"""

import datetime
import logging
from decimal import ROUND_HALF_UP, Decimal

from django.core.cache import cache

from apps.assets.models import Settings
from apps.transactions.models import Dividend, Transaction

from .services import calculate_portfolio

logger = logging.getLogger(__name__)

# Accumulating ETFs quoted in EUR on Xetra: their price already includes reinvested dividends
BENCHMARKS = {
    "msci_world": {"name": "MSCI World", "ticker": "EUNL.DE"},
    "sp500": {"name": "S&P 500", "ticker": "SXR8.DE"},
    "all_world": {"name": "FTSE All-World", "ticker": "VWCE.DE"},
}
DEFAULT_BENCHMARK = "msci_world"

# Annualizing a few weeks gives meaningless figures (+300 %/year): below a year the rate is flagged
MIN_DAYS_RELIABLE = 365


def xirr(flows: list[tuple[datetime.date, float]]) -> float | None:
    """Annual rate r with sum(amount / (1 + r) ** (days / 365)) == 0, or None if it has no solution.

    Needs money both in and out. Solved by bisection on (-0.9999, 100): the present value decreases
    monotonically in r when the flows start with money in, which is always the case here.
    """
    flows = [(d, a) for d, a in flows if a]
    if not flows or all(a > 0 for _, a in flows) or all(a < 0 for _, a in flows):
        return None
    start = min(d for d, _ in flows)

    def npv(rate: float) -> float:
        return sum(a / (1 + rate) ** ((d - start).days / 365) for d, a in flows)

    lo, hi = -0.9999, 100.0
    f_lo, f_hi = npv(lo), npv(hi)
    if f_lo * f_hi > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        f_mid = npv(mid)
        if abs(f_mid) < 1e-7:
            break
        if (f_mid > 0) == (f_lo > 0):
            lo, f_lo = mid, f_mid
        else:
            hi = mid
    return (lo + hi) / 2


def _pct(rate: float | None) -> str | None:
    return None if rate is None else str(Decimal(str(rate * 100)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _trade_flows(user):
    """(date, asset_id, amount) per operation, from the investor's side."""
    flows = []
    for tx in Transaction.objects.filter(owner=user).order_by("date", "created_at"):
        gross = tx.quantity * (tx.price or Decimal("0"))
        if tx.type == Transaction.TransactionType.BUY:
            amount = -(gross + tx.commission + tx.tax)
        elif tx.type == Transaction.TransactionType.GIFT:
            amount = -gross
        else:  # SELL
            amount = gross - tx.commission - tx.tax
        flows.append((tx.date, tx.asset_id, amount))
    return flows


def _summary(flows, market_value, today, money_exp):
    """Totals and XIRR of one set of (date, amount) flows plus today's market value."""
    invested = sum((-a for _, a in flows if a < 0), Decimal("0"))
    returned = sum((a for _, a in flows if a > 0), Decimal("0"))
    gain = market_value + returned - invested
    first = min((d for d, _ in flows), default=None)
    rate = xirr([(d, float(a)) for d, a in flows] + [(today, float(market_value))]) if flows else None
    return {
        "first_date": first.isoformat() if first else None,
        "invested": str(invested.quantize(money_exp, rounding=ROUND_HALF_UP)),
        "returned": str(returned.quantize(money_exp, rounding=ROUND_HALF_UP)),
        "market_value": str(market_value.quantize(money_exp, rounding=ROUND_HALF_UP)),
        "total_gain": str(gain.quantize(money_exp, rounding=ROUND_HALF_UP)),
        "xirr_pct": _pct(rate),
        "reliable": bool(first and (today - first).days >= MIN_DAYS_RELIABLE),
    }


def fetch_benchmark_closes(ticker: str, start: datetime.date) -> list[tuple[datetime.date, float]]:
    """Daily closes of a public index ETF since ``start``, oldest first. Cached for everyone (public data)."""
    key = f"benchmark:{ticker}:{start.isoformat()}:{datetime.date.today().isoformat()}"
    cached = cache.get(key)
    if cached is not None:
        return cached
    import yfinance as yf

    data = yf.download(ticker, start=start - datetime.timedelta(days=10), progress=False, auto_adjust=False)
    closes = []
    if not data.empty:
        col = data["Close"]
        if hasattr(col, "columns"):
            col = col[ticker]
        closes = [(idx.date(), float(v)) for idx, v in col.dropna().items()]
    cache.set(key, closes, 6 * 3600)
    return closes


def _close_on(closes, day):
    """Close of ``day`` or the last one before it (weekends, holidays); the first close if ``day`` is earlier."""
    price = closes[0][1]
    for d, close in closes:
        if d > day:
            break
        price = close
    return price


def _benchmark(flows, today, key, money_exp):
    """Replays the operations' money in the benchmark ETF. None if its prices are unavailable."""
    bench = BENCHMARKS[key]
    if not flows:
        return None
    first = min(d for d, _ in flows)
    try:
        closes = fetch_benchmark_closes(bench["ticker"], first)
    except Exception as exc:  # network, Yahoo changes: the comparison is optional
        logger.warning("Benchmark %s unavailable: %s", bench["ticker"], exc)
        return None
    if not closes:
        return None

    units = Decimal("0")
    replayed = []
    for day, amount in flows:
        price = Decimal(str(_close_on(closes, day)))
        if amount < 0:
            units += -amount / price
            replayed.append((day, amount))
        else:
            # Same proceeds as the real sale, never more units than held
            sold = min(units, amount / price)
            units -= sold
            replayed.append((day, sold * price))
    market_value = units * Decimal(str(closes[-1][1]))
    data = _summary(replayed, market_value, today, money_exp)
    data.update(
        {
            "key": key,
            "name": bench["name"],
            "ticker": bench["ticker"],
            "price_date": closes[-1][0].isoformat(),
            # Flows before the ETF existed were priced at its first close
            "starts_late": closes[0][0] > first,
        }
    )
    return data


def calculate_returns(user, benchmark: str | None = DEFAULT_BENCHMARK, today: datetime.date | None = None):
    today = today or datetime.date.today()
    settings = Settings.load(user)
    money_exp = Decimal(10) ** -settings.rounding_money

    trades = _trade_flows(user)
    dividends = list(Dividend.objects.filter(owner=user).values_list("date", "asset_id", "net"))
    portfolio = calculate_portfolio(user)
    values = {p["asset_id"]: Decimal(p["market_value"]) for p in portfolio["positions"]}
    total_value = Decimal(portfolio["totals"]["total_market_value"])

    all_flows = [(d, a) for d, _, a in trades] + [(d, n) for d, _, n in dividends]
    all_flows.sort(key=lambda f: f[0])

    names = {}
    for tx in Transaction.objects.filter(owner=user).select_related("asset"):
        names[tx.asset_id] = (tx.asset.name, tx.asset.ticker)
    assets = []
    for asset_id, (name, ticker) in names.items():
        flows = [(d, a) for d, aid, a in trades if aid == asset_id]
        flows += [(d, n) for d, aid, n in dividends if aid == asset_id]
        flows.sort(key=lambda f: f[0])
        value = values.get(str(asset_id), Decimal("0"))
        row = _summary(flows, value, today, money_exp)
        row.update({"asset_id": str(asset_id), "asset_name": name, "asset_ticker": ticker, "is_open": value > 0})
        assets.append(row)
    assets.sort(key=lambda r: Decimal(r["xirr_pct"]) if r["xirr_pct"] is not None else Decimal("-1e9"), reverse=True)

    trade_flows = [(d, a) for d, _, a in trades]
    return {
        "as_of": today.isoformat(),
        "portfolio": _summary(all_flows, total_value, today, money_exp),
        "assets": assets,
        "benchmark": _benchmark(trade_flows, today, benchmark, money_exp) if benchmark in BENCHMARKS else None,
        "benchmarks": [{"key": k, "name": v["name"], "ticker": v["ticker"]} for k, v in BENCHMARKS.items()],
    }
