"""Pure aggregations over Fintrack API rows (no I/O), so they are easy to test."""

from __future__ import annotations

from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

CENT = Decimal("0.01")
PAYROLL_TYPES = ("MONTHLY", "BONUS", "ATRASOS", "OTHER")


def _d(value: Any) -> Decimal:
    return Decimal(str(value)) if value not in (None, "") else Decimal("0")


def _money(value: Decimal) -> str:
    return str(value.quantize(CENT, rounding=ROUND_HALF_UP))


def _pct(part: Decimal, whole: Decimal) -> str | None:
    return _money(part / whole * 100) if whole else None


def payroll_summary(payrolls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Per-year totals of the payslips, split by payroll type (year of ``period_end``).

    ``bonus_vs_monthly_pct`` is BONUS gross over MONTHLY gross — how most pay
    packages quote the variable part ("15 % bonus on base salary").
    """
    years: dict[int, dict[str, Any]] = {}
    for p in payrolls:
        year = int(p["period_end"][:4])
        y = years.setdefault(
            year,
            {
                "gross": Decimal(0),
                "net": Decimal(0),
                "ss": Decimal(0),
                "irpf": Decimal(0),
                "count": 0,
                "employers": set(),
                "by_type": {t: {"gross": Decimal(0), "net": Decimal(0), "count": 0} for t in PAYROLL_TYPES},
            },
        )
        gross, net = _d(p.get("gross")), _d(p.get("net"))
        y["gross"] += gross
        y["net"] += net
        y["ss"] += _d(p.get("ss_employee"))
        y["irpf"] += _d(p.get("irpf_withholding"))
        y["count"] += 1
        if p.get("employer_name"):
            y["employers"].add(p["employer_name"])
        bucket = y["by_type"].setdefault(
            p.get("payroll_type") or "MONTHLY", {"gross": Decimal(0), "net": Decimal(0), "count": 0}
        )
        bucket["gross"] += gross
        bucket["net"] += net
        bucket["count"] += 1

    result = []
    for year in sorted(years):
        y = years[year]
        monthly, bonus = y["by_type"]["MONTHLY"]["gross"], y["by_type"]["BONUS"]["gross"]
        result.append(
            {
                "year": year,
                "payslips": y["count"],
                "gross": _money(y["gross"]),
                "net": _money(y["net"]),
                "social_security": _money(y["ss"]),
                "irpf_withheld": _money(y["irpf"]),
                "effective_irpf_pct": _pct(y["irpf"], y["gross"]),
                "bonus_gross": _money(bonus),
                "bonus_vs_monthly_pct": _pct(bonus, monthly),
                "by_type": {
                    t: {"gross": _money(v["gross"]), "net": _money(v["net"]), "payslips": v["count"]}
                    for t, v in y["by_type"].items()
                    if v["count"]
                },
                "employers": sorted(y["employers"]),
            }
        )
    return result


def _months_between(first: str, last: str) -> int:
    (y1, m1), (y2, m2) = (int(first[:4]), int(first[5:7])), (int(last[:4]), int(last[5:7]))
    return (y2 - y1) * 12 + (m2 - m1) + 1


def investment_flows(
    transactions: list[dict[str, Any]],
    assets: dict[str, dict[str, Any]],
    group_by: str = "month",
) -> dict[str, Any]:
    """Money put into (BUY) and taken out of (SELL) investments.

    BUY cash = quantity × price + commission + tax; SELL cash = quantity × price
    − commission − tax; GIFTs move shares but no cash. ``net_invested`` = bought
    − sold. Amounts are in each asset's currency: ``currencies`` lists them so
    mixed totals can be flagged.
    """
    groups: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"bought": Decimal(0), "sold": Decimal(0), "operations": 0, "first": None, "last": None}
    )
    currencies: set[str] = set()
    bought_total = sold_total = Decimal(0)
    dates: list[str] = []

    for tx in transactions:
        asset = assets.get(tx["asset"], {})
        qty, price = _d(tx.get("quantity")), _d(tx.get("price"))
        fees = _d(tx.get("commission")) + _d(tx.get("tax"))
        if group_by == "asset":
            key = tx["asset"]
        elif group_by == "type":
            key = asset.get("type") or "UNKNOWN"
        else:
            key = tx["date"][:7]
        g = groups[key]
        if tx["type"] == "BUY":
            cash = qty * price + fees
            g["bought"] += cash
            bought_total += cash
        elif tx["type"] == "SELL":
            cash = qty * price - fees
            g["sold"] += cash
            sold_total += cash
        g["operations"] += 1
        g["first"] = min(filter(None, (g["first"], tx["date"])))
        g["last"] = max(filter(None, (g["last"], tx["date"])))
        dates.append(tx["date"])
        if asset.get("currency"):
            currencies.add(asset["currency"])

    rows = []
    for key, g in groups.items():
        row: dict[str, Any] = {
            "bought": _money(g["bought"]),
            "sold": _money(g["sold"]),
            "net_invested": _money(g["bought"] - g["sold"]),
            "operations": g["operations"],
        }
        if group_by == "asset":
            a = assets.get(key, {})
            row = {
                "asset": a.get("name"),
                "ticker": a.get("ticker"),
                "type": a.get("type"),
                "currency": a.get("currency"),
                **row,
                "first_operation": g["first"],
                "last_operation": g["last"],
            }
        elif group_by == "type":
            row = {"type": key, **row}
        else:
            row = {"month": key, **row}
        rows.append(row)

    if group_by == "month":
        rows.sort(key=lambda r: r["month"])
    else:
        rows.sort(key=lambda r: Decimal(r["net_invested"]), reverse=True)

    net = bought_total - sold_total
    months = _months_between(min(dates), max(dates)) if dates else 0
    return {
        "group_by": group_by,
        "totals": {
            "bought": _money(bought_total),
            "sold": _money(sold_total),
            "net_invested": _money(net),
            "first_operation": min(dates) if dates else None,
            "last_operation": max(dates) if dates else None,
            "months_in_period": months,
            "average_monthly_net_invested": _money(net / months) if months else "0.00",
        },
        "currencies": sorted(currencies),
        "mixed_currencies": len(currencies) > 1,
        "groups": rows,
    }


def other_income_totals(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Totals of other-income rows: overall, declared vs not, per type and per month (YYYY-MM)."""
    total, declared = Decimal(0), Decimal(0)
    by_category: dict[str, Decimal] = defaultdict(Decimal)
    by_month: dict[str, Decimal] = defaultdict(Decimal)
    for r in rows:
        amount = _d(r.get("amount"))
        total += amount
        if r.get("declared"):
            declared += amount
        by_category[r.get("category") or "OTHER"] += amount
        by_month[(r.get("date") or "")[:7]] += amount
    return {
        "total": _money(total),
        "declared": _money(declared),
        "not_declared": _money(total - declared),
        "by_category": {k: _money(v) for k, v in sorted(by_category.items())},
        "by_month": {k: _money(v) for k, v in sorted(by_month.items())},
        "average_per_month_with_income": _money(total / len(by_month)) if by_month else "0.00",
    }
