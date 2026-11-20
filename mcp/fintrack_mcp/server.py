"""Fintrack MCP server: lets an AI assistant review and add records in a self-hosted Fintrack.

Runs locally over stdio and talks to the Fintrack REST API with a personal
access token (Fintrack → Settings → AI access). What the assistant may do is
bounded by the token: READ tokens only read; WRITE tokens can also create
records. No token can delete data or touch account settings.
"""

from __future__ import annotations

import logging
import os
import re
import sys
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Annotated, Any, Literal

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field

from .client import FintrackClient, FintrackError
from .insights import investment_flows, other_income_totals, payroll_summary

INSTRUCTIONS = """\
Fintrack is the user's personal finance tracker: investments (stocks, ETFs, funds, crypto), cash accounts,
dividends, interests, payslips, savings goals and real estate. Amounts are money in the asset's or account's
currency (check fintrack_get_settings for the base currency); quantities are shares.

Where to look:
- Investments now: fintrack_get_portfolio (positions, cost, value, unrealized P&L, weight; realized sales on request).
  How a position was built: fintrack_get_position_history. Money put in per month / asset / type:
  fintrack_get_investment_flows (e.g. "how much did I invest in the S&P 500" → group_by="asset", search="S&P").
- Income: fintrack_get_payroll_summary (per year: gross, net, social security, effective IRPF, bonus and its share
  of the fixed salary) and fintrack_list_payrolls for single payslips. Payroll types: MONTHLY (regular salary),
  BONUS (pagas extra, variable, incentives), ATRASOS (back pay / regularizations), OTHER (settlements, severance).
  Dividends: fintrack_list_dividends; interests: fintrack_list_interests; tax view: fintrack_get_year_summary and
  fintrack_get_tax_declaration. Money received outside payslips (rent, freelance, side jobs, gifts):
  fintrack_list_other_income.
- Savings: fintrack_get_monthly_savings / fintrack_get_annual_savings. Real savings = change in cash + money newly
  invested (investment cost delta), so investing does not count as spending. Each month/year also carries its income
  (net payslips, other income, net dividends and interests) and estimated_spending = income − real savings.
  Before saying savings "don't add up" with the salary, add other income. Goals: fintrack_list_savings_goals.
- Accounts and balance history: fintrack_list_accounts, fintrack_list_account_snapshots. Net worth over time:
  fintrack_get_net_worth_evolution. Real estate and mortgages: fintrack_list_properties. Renting out a property
  (Spain): fintrack_get_rental_summary gives leases, rent, expenses, the taxable net rent and an income-tax estimate
  up to today and projected to year end; record rent with fintrack_record_rent_payment and costs with
  fintrack_create_rental_expense.

Rules:
- Positions, costs and P&L come from Fintrack's own FIFO/LIFO/WAC engine with stock splits applied: report them as
  given rather than recomputing.
- Assets and accounts can be referenced by ticker, name or id.
- Write tools create real records. Always show the user exactly what you are about to record and get their
  confirmation first. Nothing can be deleted through this server; mistakes are fixed by the user in the app.
- New assets (fintrack_create_asset) need the Yahoo Finance ticker for automatic prices (e.g. APC.F Frankfurt,
  VWCE.DE Xetra); check it with the user. fintrack_update_asset changes only the fields given.
- "These are my balances today / on the 1st": fintrack_record_account_balances saves one snapshot per account on that
  date (replacing one already there) and returns the previous balance of each so you can show the change.
- Dividend drafts are suggestions detected from Yahoo Finance: the ex-dividend date is not the payment date and
  amounts are in the quote currency, so ask the user for the figures from their broker before accepting one.
- For opinions or recommendations you need the user's profile (horizon, risk tolerance, goals, emergency fund,
  preferences): use the one saved from earlier sessions if your client keeps memory, and ask only for what is
  missing. Never ask for figures Fintrack has (salary, savings, balances). This is analysis of the user's own data,
  not regulated advice.
"""

READ = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)
WRITE = ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False)
# Overwrites existing values (asset fields, the snapshot of the same account and date) but never deletes a record
EDIT = ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=True, openWorldHint=False)

SPLIT_PAYMENT_WINDOW_DAYS = 120

UUID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")
DEFAULT_LIMIT = 50
MAX_LIMIT = 200

Limit = Annotated[int, Field(ge=1, le=MAX_LIMIT, description="Items per page (1-200).")]
Page = Annotated[int, Field(ge=1, description="Page number, starting at 1.")]
DateStr = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="Date as YYYY-MM-DD.")]
Money = Annotated[str, Field(description='Decimal amount as a string, e.g. "12.50".')]
AssetRef = Annotated[str, Field(description="Asset ticker (e.g. AAPL, BY6.F), name or id.")]
AccountRef = Annotated[str, Field(description="Account name or id.")]
AssetType = Literal["STOCK", "ETF", "FUND", "CRYPTO"]
PriceMode = Literal["AUTO", "MANUAL"]
OtherIncomeCategory = Literal["RENTAL", "SELF_EMPLOYMENT", "SIDE_JOB", "GIFT", "OTHER"]
RentalExpenseCategory = Literal[
    "TAXES", "COMMUNITY", "INSURANCE", "REPAIRS", "FINANCING", "UTILITIES", "SERVICES", "IMPROVEMENT", "OTHER"
]
PropertyRef = Annotated[str, Field(description="Property name or id.")]
Country = Annotated[str | None, Field(description="ISO 3166-1 alpha-2 code, e.g. US, ES, IE.")]


class AccountBalance(BaseModel):
    account: AccountRef
    balance: Money
    note: str = ""


def _country(value: str | None, field: str) -> str | None:
    value = (value or "").strip().upper()
    if value and not re.fullmatch(r"[A-Z]{2}", value):
        raise ToolError(f'"{field}" must be a two-letter country code such as US or ES, got {value!r}.')
    return value or None


def _decimal(value: str | None, field: str) -> str | None:
    if value is None or value == "":
        return None
    try:
        return str(Decimal(str(value).replace(",", ".")))
    except InvalidOperation as exc:
        raise ToolError(f'"{field}" must be a number, got {value!r}.') from exc


def _today() -> str:
    return date.today().isoformat()


def _days_between(start: str, end: str) -> int:
    return (date.fromisoformat(end[:10]) - date.fromisoformat(start[:10])).days


def _page(data: Any, page: int, limit: int) -> dict[str, Any]:
    """Normalise a DRF page into the MCP pagination shape."""
    if isinstance(data, list):
        return {"total": len(data), "page": 1, "has_more": False, "items": data}
    return {
        "total": data.get("count"),
        "page": page,
        "page_size": limit,
        "has_more": bool(data.get("next")),
        "items": data.get("results", []),
    }


def create_server(client: FintrackClient) -> MCPServer:
    mcp = MCPServer("fintrack_mcp", instructions=INSTRUCTIONS)

    async def call(method: str, path: str, **kwargs: Any) -> Any:
        try:
            return await getattr(client, method)(path, **kwargs)
        except FintrackError as exc:
            raise ToolError(str(exc)) from exc

    async def resolve_asset(ref: str) -> dict[str, Any]:
        ref = ref.strip()
        if UUID_RE.match(ref):
            return await call("get", f"assets/{ref}/")
        data = await call("get", "assets/", params={"search": ref, "page_size": MAX_LIMIT})
        rows = data["results"] if isinstance(data, dict) else data
        low = ref.lower()
        for key in ("ticker", "name"):
            exact = [a for a in rows if (a.get(key) or "").lower() == low]
            if len(exact) == 1:
                return exact[0]
        if len(rows) == 1:
            return rows[0]
        if not rows:
            raise ToolError(f'No asset matches "{ref}". Use fintrack_list_assets to see the available ones.')
        options = ", ".join(f"{a['name']} ({a.get('ticker') or 'no ticker'})" for a in rows[:10])
        raise ToolError(f'"{ref}" matches several assets: {options}. Use the exact ticker or the id.')

    async def fetch_all(path: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """Every row of a paginated list endpoint."""
        rows: list[dict[str, Any]] = []
        page = 1
        while True:
            data = await call("get", path, params={**(params or {}), "page": page, "page_size": 1000})
            if isinstance(data, list):
                return data
            rows.extend(data.get("results", []))
            if not data.get("next"):
                return rows
            page += 1

    async def list_accounts() -> list[dict[str, Any]]:
        data = await call("get", "accounts/", params={"page_size": MAX_LIMIT})
        return data["results"] if isinstance(data, dict) else data

    def match_account(rows: list[dict[str, Any]], ref: str) -> dict[str, Any]:
        ref = ref.strip()
        matches = [a for a in rows if a["id"] == ref or a["name"].lower() == ref.lower()]
        if not matches:
            matches = [a for a in rows if ref.lower() in a["name"].lower()]
        if len(matches) == 1:
            return matches[0]
        names = ", ".join(a["name"] for a in rows)
        if not matches:
            raise ToolError(f'No account matches "{ref}". Accounts: {names}.')
        raise ToolError(f'"{ref}" matches several accounts. Accounts: {names}.')

    async def resolve_account(ref: str) -> dict[str, Any]:
        return match_account(await list_accounts(), ref)

    async def set_manual_price(asset: dict[str, Any], price: str) -> dict[str, Any]:
        return await call("post", f"assets/{asset['id']}/set-price/", json={"price": _decimal(price, "price")})

    # ------------------------------------------------------------------ read

    @mcp.tool(annotations=READ)
    async def fintrack_get_portfolio(
        include_realized_sales: Annotated[bool, Field(description="Also return every realized sale.")] = False,
    ) -> dict[str, Any]:
        """Current portfolio: totals, open positions (quantity, cost, value, unrealized P&L, weight) and cash
        accounts. Optionally the realized sales with their gains."""
        data = await call("get", "portfolio/")
        if not include_realized_sales:
            data.pop("realized_sales", None)
        return data

    @mcp.tool(annotations=READ)
    async def fintrack_list_assets(
        search: Annotated[str | None, Field(description="Filter by name or ticker.")] = None,
        limit: Limit = DEFAULT_LIMIT,
        page: Page = 1,
    ) -> dict[str, Any]:
        """List assets (stocks, ETFs, funds, crypto) with ticker, type, currency, current price and countries."""
        data = await call("get", "assets/", params={"search": search, "page": page, "page_size": limit})
        return _page(data, page, limit)

    @mcp.tool(annotations=READ)
    async def fintrack_list_accounts() -> dict[str, Any]:
        """List accounts (brokers, checking, savings, deposits) with type, currency and balance."""
        data = await call("get", "accounts/", params={"page_size": MAX_LIMIT})
        return _page(data, 1, MAX_LIMIT)

    @mcp.tool(annotations=READ)
    async def fintrack_get_position_history(asset: AssetRef) -> dict[str, Any]:
        """Every operation and stock split of one asset in date order, with the shares held after each step.
        Use it to explain how the current quantity was reached or to reconcile with the broker."""
        a = await resolve_asset(asset)
        history = await call("get", f"assets/{a['id']}/position-history/")
        return {"asset": {"id": a["id"], "name": a["name"], "ticker": a.get("ticker")}, **history}

    @mcp.tool(annotations=READ)
    async def fintrack_list_transactions(
        search: Annotated[str | None, Field(description="Filter by asset name or ticker.")] = None,
        type: Annotated[Literal["BUY", "SELL", "GIFT"] | None, Field(description="Operation type.")] = None,
        from_date: Annotated[str | None, Field(description="From date, YYYY-MM-DD.")] = None,
        to_date: Annotated[str | None, Field(description="To date, YYYY-MM-DD.")] = None,
        account: Annotated[str | None, Field(description="Account name or id.")] = None,
        limit: Limit = DEFAULT_LIMIT,
        page: Page = 1,
    ) -> dict[str, Any]:
        """List buy/sell/gift operations, newest first. Each one includes split_factor: shares today =
        quantity × split_factor when later splits apply."""
        account_id = (await resolve_account(account))["id"] if account else None
        params = {
            "search": search,
            "type": type,
            "from_date": from_date,
            "to_date": to_date,
            "account_id": account_id,
            "page": page,
            "page_size": limit,
        }
        return _page(await call("get", "transactions/", params=params), page, limit)

    @mcp.tool(annotations=READ)
    async def fintrack_list_dividends(
        year: Annotated[int | None, Field(description="Payment year.")] = None,
        search: Annotated[str | None, Field(description="Filter by asset name or ticker.")] = None,
        limit: Limit = DEFAULT_LIMIT,
        page: Page = 1,
    ) -> dict[str, Any]:
        """List recorded dividends, newest first: date, asset, shares, gross, withholding at source (tax), domestic
        retention (domestic_tax, e.g. the Spanish 19 %), net and rate (tax over gross)."""
        params = {"year": year, "search": search, "page": page, "page_size": limit}
        return _page(await call("get", "dividends/", params=params), page, limit)

    @mcp.tool(annotations=READ)
    async def fintrack_list_interests(
        year: Annotated[int | None, Field(description="Year of the period end.")] = None,
        search: Annotated[str | None, Field(description="Filter by account name.")] = None,
        limit: Limit = DEFAULT_LIMIT,
        page: Page = 1,
    ) -> dict[str, Any]:
        """List interest income from accounts: period, gross, withholding and net."""
        params = {"year": year, "search": search, "page": page, "page_size": limit}
        return _page(await call("get", "interests/", params=params), page, limit)

    @mcp.tool(annotations=READ)
    async def fintrack_list_other_income(
        year: Annotated[int | None, Field(description="Year of the income date.")] = None,
        category: Annotated[OtherIncomeCategory | None, Field(description="Only this type.")] = None,
        search: Annotated[str | None, Field(description="Text in the description or notes.")] = None,
    ) -> dict[str, Any]:
        """Money received outside payslips, dividends and interests: rent, self-employment, side jobs, gifts or
        other. Each row has date, type, description, amount received and account. Returns the rows plus totals per
        type and per month. It is real money for savings and spending, not a tax figure (the tax views ignore it)."""
        rows = await fetch_all("other-incomes/", {"year": year, "category": category, "search": search})
        return {"items": rows, **other_income_totals(rows)}

    @mcp.tool(annotations=READ)
    async def fintrack_get_year_summary() -> dict[str, Any]:
        """Year-by-year fiscal summary: dividends, interests, realized gains and payroll totals.

        payroll_gross here is the taxable base (base IRPF when the payslip has it, otherwise gross), so it can differ
        from the gross in fintrack_get_payroll_summary."""
        return {"years": await call("get", "reports/year-summary/")}

    @mcp.tool(annotations=READ)
    async def fintrack_get_net_worth_evolution() -> dict[str, Any]:
        """Monthly net worth split into cash and investments. Cash comes from account balance snapshots (months
        before the first snapshot show 0 cash, not a real zero) minus the money moved into investments after the
        month's photo, so a purchase is never counted as cash and investment at once; cash_snapshot is the raw
        photo. The current month values investments today."""
        return {"months": await call("get", "reports/patrimonio-evolution/")}

    @mcp.tool(annotations=READ)
    async def fintrack_get_invested_capital_evolution() -> dict[str, Any]:
        """Money invested (cost of the open positions, user's cost method) at the end of every month from the first
        operation to today. delta is the change in the month: buys add their cost, sales remove the cost of the lots
        sold. The last month equals the portfolio's total_cost."""
        return {"months": await call("get", "reports/investment-cost-evolution/")}

    @mcp.tool(annotations=READ)
    async def fintrack_get_tax_declaration(year: Annotated[int, Field(description="Fiscal year.")]) -> dict[str, Any]:
        """Tax-declaration helper for the user's fiscal country (Spain: Renta Web boxes for employment income,
        interests, dividends, double-taxation deduction and capital gains)."""
        return await call("get", "reports/tax-declaration/", params={"year": year})

    @mcp.tool(annotations=READ)
    async def fintrack_list_pending_reviews() -> dict[str, Any]:
        """Items waiting for the user's decision: dividend drafts detected from Yahoo and detected stock splits."""
        drafts = await call("get", "dividend-suggestions/", params={"status": "PENDING", "page_size": MAX_LIMIT})
        splits = await call("get", "splits/", params={"status": "PENDING", "page_size": MAX_LIMIT})
        return {"dividend_drafts": _page(drafts, 1, MAX_LIMIT)["items"], "splits": _page(splits, 1, MAX_LIMIT)["items"]}

    @mcp.tool(annotations=READ)
    async def fintrack_check_dividend_shares(
        asset: Annotated[str | None, Field(description="Limit to one asset (ticker, name or id).")] = None,
    ) -> dict[str, Any]:
        """Find dividends whose recorded share count differs from the shares the operations give on that date.
        A mismatch usually means a missing or wrong operation (e.g. a gift or fractional buy never recorded).
        Dividends paid shortly after a split on the pre-split shares are listed apart as explained_by_split."""
        params: dict[str, Any] = {"page_size": 1000}
        if asset:
            a = await resolve_asset(asset)
            params["asset_id"] = a["id"]
        dividends = _page(await call("get", "dividends/", params=params), 1, 1000)["items"]
        by_asset: dict[str, list[dict[str, Any]]] = {}
        for d in dividends:
            if d.get("shares"):
                by_asset.setdefault(d["asset"], []).append(d)

        mismatches, explained = [], []
        for asset_id, rows in by_asset.items():
            events = (await call("get", f"assets/{asset_id}/position-history/"))["events"]
            for d in rows:
                held = Decimal("0")
                before_splits: list[tuple[str, Decimal]] = []  # (split date, shares held just before it)
                for e in events:  # events are in date order
                    if e["date"] > d["date"]:
                        break
                    if e["kind"] == "SPLIT":
                        if e.get("status") == "APPLIED":
                            before_splits.append((e["date"], held))
                            held = Decimal(e["quantity_after"])
                    else:
                        held = Decimal(e["quantity_after"])
                shares = Decimal(d["shares"])
                if abs(shares - held) <= Decimal("0.0001"):
                    continue
                row = {
                    "asset": d.get("asset_name"),
                    "ticker": d.get("asset_ticker"),
                    "dividend_date": d["date"],
                    "dividend_shares": d["shares"],
                    "shares_from_operations": str(held),
                    "difference": str(shares - held),
                }
                # Recorded on the payment date, but entitlement was fixed at the ex-date, which can fall before a
                # split (e.g. BYD 2025: ex-date and 3:1 split on 10 June, paid on pre-split shares in July)
                split = next(
                    (
                        (sd, q)
                        for sd, q in reversed(before_splits)
                        if _days_between(sd, d["date"]) <= SPLIT_PAYMENT_WINDOW_DAYS
                        and abs(shares - q) <= Decimal("0.0001")
                    ),
                    None,
                )
                if split:
                    explained.append({**row, "reason": f"paid on the shares held before the split of {split[0]}"})
                else:
                    mismatches.append(row)
        mismatches.sort(key=lambda m: (m["asset"] or "", m["dividend_date"]))
        return {
            "checked_dividends": sum(len(r) for r in by_asset.values()),
            "mismatches": mismatches,
            "explained_by_split": explained,
        }

    @mcp.tool(annotations=READ)
    async def fintrack_get_settings() -> dict[str, Any]:
        """User settings: base currency, cost-basis methods (portfolio and fiscal), gift cost mode, rounding and
        fiscal country."""
        return await call("get", "settings/")

    @mcp.tool(annotations=READ)
    async def fintrack_list_payrolls(
        year: Annotated[int | None, Field(description="Year of the period end.")] = None,
        month: Annotated[int | None, Field(ge=1, le=12, description="Month of the period end.")] = None,
        payroll_type: Annotated[
            Literal["MONTHLY", "BONUS", "ATRASOS", "OTHER"] | None,
            Field(description="MONTHLY salary, BONUS (extra pays, variable), ATRASOS (back pay), OTHER."),
        ] = None,
        limit: Limit = DEFAULT_LIMIT,
        page: Page = 1,
    ) -> dict[str, Any]:
        """List payslips, newest first: period, type, employer, gross, social security, IRPF withheld and rate, net."""
        params = {
            "year": year,
            "month": month,
            "payroll_type": payroll_type,
            "page": page,
            "page_size": limit,
            "ordering": "-period_end",
        }
        return _page(await call("get", "payrolls/", params=params), page, limit)

    @mcp.tool(annotations=READ)
    async def fintrack_get_payroll_summary(
        from_year: Annotated[int | None, Field(description="First year to include.")] = None,
        to_year: Annotated[int | None, Field(description="Last year to include.")] = None,
    ) -> dict[str, Any]:
        """Income from payslips per year: gross, net, social security, IRPF withheld and effective rate, totals by
        type (MONTHLY / BONUS / ATRASOS / OTHER), bonus amount and bonus as % of the fixed monthly salary."""
        years = payroll_summary(await fetch_all("payrolls/"))
        years = [
            y
            for y in years
            if (from_year is None or y["year"] >= from_year) and (to_year is None or y["year"] <= to_year)
        ]
        return {"years": years}

    @mcp.tool(annotations=READ)
    async def fintrack_get_monthly_savings(
        from_month: Annotated[str | None, Field(pattern=r"^\d{4}-\d{2}$", description="First month, YYYY-MM.")] = None,
        to_month: Annotated[str | None, Field(pattern=r"^\d{4}-\d{2}$", description="Last month, YYYY-MM.")] = None,
    ) -> dict[str, Any]:
        """Month-by-month savings: cash at the month's last snapshot and its change, money newly invested up to that
        same snapshot date (investment cost delta) and real savings = cash change + invested. Each month also has
        the income received since the previous month's snapshot (income_payroll = net payslips, income_other = other
        income, income_investment = net dividends and interests, income_total) and estimated_spending =
        income_total − real_savings (null without income or a previous month; approximate).
        Includes stats (average, best and worst month)."""
        return await call("get", "reports/monthly-savings/", params={"from": from_month, "to": to_month})

    @mcp.tool(annotations=READ)
    async def fintrack_get_annual_savings() -> dict[str, Any]:
        """Savings per year: total real savings, cash change, money invested, year-end balances, income (net
        payslips, other income, dividends and interests, total_income) and total_estimated_spending."""
        return {"years": await call("get", "reports/annual-savings/")}

    @mcp.tool(annotations=READ)
    async def fintrack_get_investment_flows(
        group_by: Annotated[
            Literal["month", "asset", "type"], Field(description="Group by month, asset or asset type.")
        ] = "month",
        from_date: Annotated[str | None, Field(description="From date, YYYY-MM-DD.")] = None,
        to_date: Annotated[str | None, Field(description="To date, YYYY-MM-DD.")] = None,
        asset: Annotated[str | None, Field(description="Only this asset (ticker, name or id).")] = None,
        search: Annotated[
            str | None, Field(description='Only assets whose name or ticker contains this text, e.g. "S&P 500".')
        ] = None,
    ) -> dict[str, Any]:
        """Money invested over time: bought, sold and net invested per month, asset or asset type, with totals and
        the average monthly net investment. Answers "how much do I invest each month" or "how much have I put into
        the S&P 500" (search by name; check the matched assets in the result)."""
        params: dict[str, Any] = {"from_date": from_date, "to_date": to_date, "search": search}
        if asset:
            params["search"] = None
            asset_id = (await resolve_asset(asset))["id"]
        else:
            asset_id = None
        transactions = await fetch_all("transactions/", params)
        if asset_id:
            transactions = [t for t in transactions if t["asset"] == asset_id]
        assets = {a["id"]: a for a in await fetch_all("assets/")}
        return investment_flows(transactions, assets, group_by)

    @mcp.tool(annotations=READ)
    async def fintrack_list_account_snapshots(
        account: AccountRef,
        from_date: Annotated[str | None, Field(description="From date, YYYY-MM-DD.")] = None,
        to_date: Annotated[str | None, Field(description="To date, YYYY-MM-DD.")] = None,
    ) -> dict[str, Any]:
        """Balance history of one account (one row per recorded snapshot), newest first."""
        acc = await resolve_account(account)
        rows = await fetch_all("account-snapshots/", {"account": acc["id"], "ordering": "-date"})
        rows = [r for r in rows if (not from_date or r["date"] >= from_date) and (not to_date or r["date"] <= to_date)]
        return {"account": acc["name"], "snapshots": rows}

    @mcp.tool(annotations=READ)
    async def fintrack_list_savings_goals(
        include_projection: Annotated[bool, Field(description="Also project when each goal is reached.")] = True,
    ) -> dict[str, Any]:
        """Savings goals (target, deadline, what they are measured against) with conservative / average /
        optimistic projections of when they are reached."""
        goals = await fetch_all("savings-goals/")
        if include_projection:
            for g in goals:
                g["projection"] = await call("get", f"savings-goals/{g['id']}/projection/")
        return {"goals": goals}

    @mcp.tool(annotations=READ)
    async def fintrack_list_properties() -> dict[str, Any]:
        """Real estate: current value, purchase price, net equity and mortgage as of today.

        mortgage_status is NONE, ACTIVE or FINISHED (paid off, early amortizations included); use it or
        has_active_mortgage to know whether there is debt — has_mortgage only means mortgage data exists.
        outstanding_balance and current_monthly_payment are today's values; months_paid counts payments made (it
        stops when the mortgage ends) and months_elapsed the calendar months since the start; monthly_payment is
        the original payment; mortgage_end_date is when the last payment falls (or fell); extra_amortizations is the
        sum of early repayments."""
        return {"properties": await fetch_all("properties/")}

    async def resolve_property(ref: str) -> dict[str, Any]:
        ref = ref.strip()
        rows = await fetch_all("properties/")
        matches = [p for p in rows if p["id"] == ref or p["name"].lower() == ref.lower()]
        if not matches:
            matches = [p for p in rows if ref.lower() in p["name"].lower()]
        if len(matches) == 1:
            return matches[0]
        names = ", ".join(p["name"] for p in rows) or "none"
        if not matches:
            raise ToolError(f'No property matches "{ref}". Properties: {names}.')
        raise ToolError(f'"{ref}" matches several properties. Properties: {names}.')

    @mcp.tool(annotations=READ)
    async def fintrack_get_rental_summary(
        year: Annotated[int | None, Field(description="Fiscal year; the current one if omitted.")] = None,
    ) -> dict[str, Any]:
        """Rented properties in a year (Spanish tax rules): leases, months without a recorded payment and two
        scenarios, to_date and projected (rest of the year from the lease and last year's recurring costs). Each has
        the inputs (rent, expenses, depreciation base, reduction %, payslip base) and the result: net rent,
        reduction, reduced net rent (what goes to the tax return), empty-days imputation, estimated extra income tax
        (approximate combined scale on top of the payslip base) and cash_result = rent − expenses paid − tax.
        Report the figures as given and present the tax as an estimate (regional scales differ)."""
        params = {"year": year} if year else None
        return await call("get", "rental/overview/", params=params)

    # ---------------------------------------------------------------- prompts

    @mcp.prompt(title="Monthly review")
    def fintrack_monthly_review(month: str = "") -> str:
        """Review a month: savings, investments made, income and anything pending."""
        target = month or "the last complete month"
        return (
            f"Do my monthly financial review for {target} using Fintrack. Cover: savings that month and versus my "
            "average (fintrack_get_monthly_savings), what I invested and in what (fintrack_get_investment_flows), "
            "payslips received (fintrack_list_payrolls), dividends and interests received, how the portfolio moved, "
            "and anything waiting for review (fintrack_list_pending_reviews). Finish with three short takeaways."
        )

    @mcp.prompt(title="Payroll and bonus review")
    def fintrack_payroll_review(year: str = "") -> str:
        """Income review from payslips: salary, bonus, IRPF and year-over-year change."""
        target = f"for {year}" if year else "for the last full year"
        return (
            f"Analyse my payslips {target} with Fintrack (fintrack_get_payroll_summary, fintrack_list_payrolls). "
            "Give gross and net income, fixed salary vs bonus (amount and % of the fixed salary), effective IRPF, "
            "social security, change versus the previous year, and anything unusual (back pay, settlements, "
            "missing months)."
        )

    @mcp.prompt(title="Portfolio analysis")
    def fintrack_portfolio_analysis() -> str:
        """Analyse the portfolio and each investment, with recommendations for my profile."""
        return (
            "Analyse my investments with Fintrack and give me recommendations. Use my saved investor profile if you "
            "keep one (age, horizon, risk tolerance, goals, emergency fund, preferences) and ask me only for what is "
            "missing. Then review the whole portfolio (fintrack_get_portfolio, "
            "fintrack_get_investment_flows, fintrack_get_monthly_savings) and each position: weight, concentration, "
            "diversification by region/sector/currency, overlapping funds, costs, performance and fit with my "
            "profile. If the fintrack-advisor skill is available, follow it."
        )

    # ----------------------------------------------------------------- write

    @mcp.tool(annotations=WRITE)
    async def fintrack_create_transaction(
        type: Annotated[Literal["BUY", "SELL", "GIFT"], Field(description="BUY, SELL or GIFT (shares received free).")],
        asset: AssetRef,
        account: AccountRef,
        date: DateStr,
        quantity: Annotated[str, Field(description='Shares, e.g. "1.271132".')],
        price: Annotated[str | None, Field(description="Price per share; optional for GIFT.")] = None,
        commission: Money = "0",
        tax: Money = "0",
        notes: str = "",
    ) -> dict[str, Any]:
        """Record a buy, sell or gift of shares. Confirm the details with the user before calling."""
        a, acc = await resolve_asset(asset), await resolve_account(account)
        payload = {
            "type": type,
            "asset": a["id"],
            "account": acc["id"],
            "date": date,
            "quantity": _decimal(quantity, "quantity"),
            "price": _decimal(price, "price"),
            "commission": _decimal(commission, "commission") or "0",
            "tax": _decimal(tax, "tax") or "0",
            "notes": notes,
        }
        return await call("post", "transactions/", json=payload)

    @mcp.tool(annotations=WRITE)
    async def fintrack_create_dividend(
        asset: AssetRef,
        date: Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="Payment date, YYYY-MM-DD.")],
        gross: Money,
        tax: Annotated[str, Field(description="Withholding tax at source (abroad for foreign assets).")] = "0",
        domestic_tax: Annotated[
            str,
            Field(
                description="Retention added by a bank/broker of the user's country of residence (in Spain the 19 % "
                "on top of the foreign withholding). Declared as a domestic withholding, not as double taxation."
            ),
        ] = "0",
        commission: Money = "0",
        net: Annotated[
            str | None, Field(description="Net received; defaults to gross − tax − domestic_tax − commission.")
        ] = None,
        shares: Annotated[str | None, Field(description="Shares that received the dividend.")] = None,
    ) -> dict[str, Any]:
        """Record a dividend payment. Confirm the details with the user before calling."""
        a = await resolve_asset(asset)
        g, t, dt, c = (
            Decimal(_decimal(v, f))
            for v, f in (
                (gross, "gross"),
                (tax or "0", "tax"),
                (domestic_tax or "0", "domestic_tax"),
                (commission or "0", "commission"),
            )
        )
        payload = {
            "asset": a["id"],
            "date": date,
            "gross": str(g),
            "tax": str(t),
            "domestic_tax": str(dt),
            "commission": str(c),
            "net": _decimal(net, "net") or str(g - t - dt - c),
            "shares": _decimal(shares, "shares"),
        }
        return await call("post", "dividends/", json=payload)

    @mcp.tool(annotations=WRITE)
    async def fintrack_create_interest(
        account: AccountRef,
        date_start: DateStr,
        date_end: DateStr,
        gross: Money,
        tax: Annotated[str, Field(description="Withholding tax.")] = "0",
        commission: Money = "0",
        net: Annotated[str | None, Field(description="Net received; defaults to gross − tax − commission.")] = None,
    ) -> dict[str, Any]:
        """Record interest paid by an account for a period. Confirm the details with the user before calling."""
        acc = await resolve_account(account)
        g, t, c = (
            Decimal(_decimal(v, f))
            for v, f in ((gross, "gross"), (tax or "0", "tax"), (commission or "0", "commission"))
        )
        payload = {
            "account": acc["id"],
            "date_start": date_start,
            "date_end": date_end,
            "gross": str(g),
            "tax": str(t),
            "commission": str(c),
            "net": _decimal(net, "net") or str(g - t - c),
        }
        return await call("post", "interests/", json=payload)

    @mcp.tool(annotations=WRITE)
    async def fintrack_detect_dividend_drafts(
        asset: Annotated[str | None, Field(description="Only this asset (ticker, name or id).")] = None,
        backfill: Annotated[bool, Field(description="With asset: look back to the first purchase.")] = False,
    ) -> dict[str, Any]:
        """Ask Fintrack to look up dividends on Yahoo Finance and create drafts for the ones not recorded yet.
        Drafts are not dividends until accepted."""
        body: dict[str, Any] = {}
        if asset:
            body = {"asset_id": (await resolve_asset(asset))["id"], "backfill": backfill}
        return await call("post", "dividend-suggestions/detect/", json=body)

    @mcp.tool(annotations=WRITE)
    async def fintrack_accept_dividend_draft(
        draft_id: Annotated[str, Field(description="Id of the dividend draft (fintrack_list_pending_reviews).")],
        date: Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="Payment date from the broker.")],
        gross: Money,
        tax: Annotated[str, Field(description="Withholding tax at source from the broker.")] = "0",
        domestic_tax: Annotated[
            str,
            Field(
                description="Retention added by a bank/broker of the user's country of residence (in Spain the 19 % "
                "on top of the foreign withholding). Declared as a domestic withholding, not as double taxation."
            ),
        ] = "0",
        commission: Money = "0",
        net: Annotated[
            str | None, Field(description="Net received; defaults to gross − tax − domestic_tax − commission.")
        ] = None,
        shares: Annotated[str | None, Field(description="Shares; defaults to the draft's.")] = None,
    ) -> dict[str, Any]:
        """Turn a dividend draft into a recorded dividend with the figures confirmed by the user's broker."""
        g, t, dt, c = (
            Decimal(_decimal(v, f))
            for v, f in (
                (gross, "gross"),
                (tax or "0", "tax"),
                (domestic_tax or "0", "domestic_tax"),
                (commission or "0", "commission"),
            )
        )
        body = {
            "date": date,
            "gross": str(g),
            "tax": str(t),
            "domestic_tax": str(dt),
            "commission": str(c),
            "net": _decimal(net, "net") or str(g - t - dt - c),
        }
        if shares:
            body["shares"] = _decimal(shares, "shares")
        else:
            draft = await call("get", f"dividend-suggestions/{draft_id}/")
            body["shares"] = draft["shares"]
        return await call("post", f"dividend-suggestions/{draft_id}/accept/", json=body)

    @mcp.tool(annotations=WRITE)
    async def fintrack_dismiss_dividend_draft(
        draft_id: Annotated[str, Field(description="Id of the dividend draft.")],
    ) -> dict[str, Any]:
        """Dismiss a dividend draft; it will not be suggested again."""
        return await call("post", f"dividend-suggestions/{draft_id}/dismiss/")

    @mcp.tool(annotations=WRITE)
    async def fintrack_apply_split(
        split_id: Annotated[str, Field(description="Id of a pending stock split (fintrack_list_pending_reviews).")],
    ) -> dict[str, Any]:
        """Apply a detected stock split: from its date, shares are multiplied and unit costs divided."""
        return await call("post", f"splits/{split_id}/apply/")

    @mcp.tool(annotations=WRITE)
    async def fintrack_create_other_income(
        date: DateStr,
        amount: Annotated[str, Field(description='Amount received, e.g. "390".')],
        description: Annotated[str, Field(min_length=1, max_length=200, description="e.g. Rent flat Av. Torrente.")],
        category: Annotated[
            OtherIncomeCategory, Field(description="RENTAL, SELF_EMPLOYMENT, SIDE_JOB, GIFT or OTHER.")
        ] = "OTHER",
        account: Annotated[str | None, Field(description="Account it went into (name or id); none for cash.")] = None,
        notes: str = "",
    ) -> dict[str, Any]:
        """Record money received outside payslips, dividends and interests (e.g. this month's rent). Confirm the
        details with the user before calling; for recurring income reuse the description and type of the previous
        one (fintrack_list_other_income)."""
        payload = {
            "date": date,
            "amount": _decimal(amount, "amount"),
            "description": description.strip(),
            "category": category,
            "account": (await resolve_account(account))["id"] if account else None,
            "notes": notes,
        }
        return await call("post", "other-incomes/", json=payload)

    @mcp.tool(annotations=WRITE)
    async def fintrack_record_rent_payment(
        property: PropertyRef,
        date: DateStr,
        amount: Annotated[str | None, Field(description="Rent received; the lease's monthly rent if omitted.")] = None,
        account: Annotated[str | None, Field(description="Account it went into (name or id).")] = None,
    ) -> dict[str, Any]:
        """Record a rent payment of a property: an other-income row linked to the lease in force on that date, so it
        counts for savings and for the rental tax. Confirm the amount with the user before calling."""
        prop = await resolve_property(property)
        leases = await fetch_all("leases/", {"property": prop["id"]})
        in_force = [
            lease
            for lease in leases
            if lease["start_date"] <= date and (not lease.get("end_date") or lease["end_date"] >= date)
        ]
        if not in_force:
            raise ToolError(
                f"{prop['name']} has no lease in force on {date}. Add one in Fintrack → Properties → Rental."
            )
        lease = in_force[0]
        payload = {
            "date": date,
            "amount": _decimal(amount, "amount") or lease["monthly_rent"],
            "description": f"Alquiler {prop['name']}",
            "category": "RENTAL",
            "lease": lease["id"],
            "account": (await resolve_account(account))["id"] if account else None,
            "notes": "",
        }
        return await call("post", "other-incomes/", json=payload)

    @mcp.tool(annotations=WRITE)
    async def fintrack_create_rental_expense(
        property: PropertyRef,
        date: DateStr,
        category: Annotated[
            RentalExpenseCategory,
            Field(
                description="TAXES (IBI, local taxes), COMMUNITY, INSURANCE, REPAIRS (repairs/maintenance), FINANCING "
                "(loan interest; replaces the interest computed from the mortgage), UTILITIES, SERVICES (agency, "
                "management, legal), IMPROVEMENT (adds value: depreciated, not expensed) or OTHER."
            ),
        ],
        amount: Money,
        description: str = "",
    ) -> dict[str, Any]:
        """Record an expense of a rented property. Confirm the details with the user before calling."""
        prop = await resolve_property(property)
        payload = {
            "property": prop["id"],
            "date": date,
            "category": category,
            "amount": _decimal(amount, "amount"),
            "description": description,
        }
        return await call("post", "rental-expenses/", json=payload)

    @mcp.tool(annotations=WRITE)
    async def fintrack_create_asset(
        name: Annotated[str, Field(min_length=1, description="Asset name, e.g. Apple or Vanguard FTSE All-World.")],
        type: Annotated[AssetType, Field(description="STOCK, ETF, FUND or CRYPTO.")],
        currency: Annotated[str, Field(pattern=r"^[A-Za-z]{3}$", description="Quote currency, e.g. EUR.")] = "EUR",
        ticker: Annotated[
            str | None, Field(description="Yahoo Finance ticker used for prices and splits, e.g. APC.F, VWCE.DE.")
        ] = None,
        isin: Annotated[str | None, Field(pattern=r"^[A-Za-z]{2}[A-Za-z0-9]{10}$", description="12-char ISIN.")] = None,
        price_mode: Annotated[
            PriceMode, Field(description="AUTO: daily price from Yahoo by ticker. MANUAL: you set the price.")
        ] = "AUTO",
        price: Annotated[str | None, Field(description="Current price; only for MANUAL assets.")] = None,
        issuer_country: Annotated[Country, Field(description="Issuer country; defaults to the ISIN prefix.")] = None,
        domicile_country: Annotated[Country, Field(description="Fund domicile (e.g. IE, LU).")] = None,
        withholding_country: Annotated[
            Country,
            Field(description="Country that withholds tax on its dividends (e.g. US for an ADR with a KY ISIN)."),
        ] = None,
    ) -> dict[str, Any]:
        """Add an asset (stock, ETF, fund or crypto) so operations and dividends can be recorded on it.
        Confirm the details with the user before calling."""
        ticker = (ticker or "").strip().upper() or None
        isin = (isin or "").strip().upper() or None
        if price_mode == "AUTO" and not ticker:
            raise ToolError("AUTO prices need a Yahoo Finance ticker; give one or use price_mode MANUAL.")
        if price and price_mode != "MANUAL":
            raise ToolError("A price can only be set on MANUAL assets; AUTO assets take it from Yahoo Finance.")
        payload = {
            "name": name.strip(),
            "type": type,
            "currency": currency.upper(),
            "ticker": ticker,
            "isin": isin,
            "price_mode": price_mode,
            "issuer_country": _country(issuer_country, "issuer_country"),
            "domicile_country": _country(domicile_country, "domicile_country"),
            "withholding_country": _country(withholding_country, "withholding_country"),
        }
        asset = await call("post", "assets/", json=payload)
        if price:
            asset = await set_manual_price(asset, price)
        return asset

    @mcp.tool(annotations=EDIT)
    async def fintrack_update_asset(
        asset: AssetRef,
        name: Annotated[str | None, Field(description="New name.")] = None,
        type: Annotated[AssetType | None, Field(description="STOCK, ETF, FUND or CRYPTO.")] = None,
        currency: Annotated[str | None, Field(pattern=r"^[A-Za-z]{3}$", description="Quote currency.")] = None,
        ticker: Annotated[str | None, Field(description='Yahoo Finance ticker; "" removes it.')] = None,
        isin: Annotated[str | None, Field(description='12-char ISIN; "" removes it.')] = None,
        price_mode: Annotated[PriceMode | None, Field(description="AUTO (Yahoo by ticker) or MANUAL.")] = None,
        price: Annotated[str | None, Field(description="Current price; only for MANUAL assets.")] = None,
        issuer_country: Annotated[Country, Field(description='Issuer country; "" removes it.')] = None,
        domicile_country: Annotated[Country, Field(description='Fund domicile; "" removes it.')] = None,
        withholding_country: Annotated[
            Country, Field(description='Country that withholds tax on its dividends; "" removes it.')
        ] = None,
    ) -> dict[str, Any]:
        """Change an asset's details (only the fields given). Recorded operations and dividends are kept as they
        are. Changing the currency does not convert recorded amounts. Confirm the change with the user first."""
        current = await resolve_asset(asset)
        changes: dict[str, Any] = {}
        if name is not None:
            if not name.strip():
                raise ToolError("The name cannot be empty.")
            changes["name"] = name.strip()
        if type is not None:
            changes["type"] = type
        if currency is not None:
            changes["currency"] = currency.upper()
        if ticker is not None:
            changes["ticker"] = ticker.strip().upper() or None
        if isin is not None:
            isin = isin.strip().upper()
            if isin and not re.fullmatch(r"[A-Z]{2}[A-Z0-9]{10}", isin):
                raise ToolError(f"{isin!r} is not a valid ISIN (2 letters + 10 letters or digits).")
            changes["isin"] = isin or None
        if price_mode is not None:
            changes["price_mode"] = price_mode
        for field, value in (
            ("issuer_country", issuer_country),
            ("domicile_country", domicile_country),
            ("withholding_country", withholding_country),
        ):
            if value is not None:
                changes[field] = _country(value, field)

        final_mode = changes.get("price_mode", current.get("price_mode"))
        final_ticker = changes.get("ticker", current.get("ticker"))
        if final_mode == "AUTO" and not final_ticker:
            raise ToolError("AUTO prices need a Yahoo Finance ticker; keep or give one, or use price_mode MANUAL.")
        if price and final_mode != "MANUAL":
            raise ToolError("A price can only be set on MANUAL assets; AUTO assets take it from Yahoo Finance.")
        if not changes and not price:
            raise ToolError("Nothing to change: give at least one field.")

        updated = await call("patch", f"assets/{current['id']}/", json=changes) if changes else current
        if price:
            updated = await set_manual_price(updated, price)
        return updated

    @mcp.tool(annotations=EDIT)
    async def fintrack_record_account_balances(
        balances: Annotated[
            list[AccountBalance],
            Field(min_length=1, description="One entry per account: account name or id, balance and optional note."),
        ],
        date: Annotated[
            str | None,
            Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="Snapshot date, YYYY-MM-DD; today if omitted."),
        ] = None,
    ) -> dict[str, Any]:
        """Record the balance of one or more accounts on a date (a snapshot per account), e.g. "these are my
        balances today" or "on the 1st of the month". The account's current balance becomes its latest snapshot.
        A snapshot already recorded for that account and date is replaced. Confirm the figures with the user first."""
        rows = await list_accounts()
        snapshot_date = date or _today()
        items, before, seen = [], {}, set()
        for entry in balances:
            acc = match_account(rows, entry.account)
            if acc["id"] in seen:
                raise ToolError(f"{acc['name']} appears twice; give one balance per account.")
            seen.add(acc["id"])
            before[acc["id"]] = acc.get("balance")
            items.append({"account": acc["id"], "balance": _decimal(entry.balance, "balance"), "note": entry.note})
        created = await call("post", "accounts/bulk-snapshot/", json={"date": snapshot_date, "snapshots": items})
        for snap in created:
            snap["previous_balance"] = before.get(snap["account"])
        return {"date": snapshot_date, "snapshots": created}

    return mcp


def main() -> None:
    url, token = os.environ.get("FINTRACK_URL"), os.environ.get("FINTRACK_TOKEN")
    if not url or not token:
        print(
            "fintrack-mcp: set FINTRACK_URL (e.g. http://192.168.1.10:8001) and FINTRACK_TOKEN "
            "(Fintrack → Settings → AI access).",
            file=sys.stderr,
        )
        sys.exit(1)
    # One INFO line per API call would flood the client's MCP log (stdout is reserved for the protocol)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    create_server(FintrackClient(url, token)).run("stdio")


if __name__ == "__main__":
    main()
