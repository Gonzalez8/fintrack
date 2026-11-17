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
from decimal import Decimal, InvalidOperation
from typing import Annotated, Any, Literal

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field

from .client import FintrackClient, FintrackError
from .insights import investment_flows, payroll_summary

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
  fintrack_get_tax_declaration.
- Savings: fintrack_get_monthly_savings / fintrack_get_annual_savings. Real savings = change in cash + money newly
  invested (investment cost delta), so investing does not count as spending. Goals: fintrack_list_savings_goals.
- Accounts and balance history: fintrack_list_accounts, fintrack_list_account_snapshots. Net worth over time:
  fintrack_get_net_worth_evolution. Real estate and mortgages: fintrack_list_properties.

Rules:
- Positions, costs and P&L come from Fintrack's own FIFO/LIFO/WAC engine with stock splits applied: report them as
  given rather than recomputing.
- Assets and accounts can be referenced by ticker, name or id.
- Write tools create real records. Always show the user exactly what you are about to record and get their
  confirmation first. Nothing can be deleted through this server; mistakes are fixed by the user in the app.
- Dividend drafts are suggestions detected from Yahoo Finance: the ex-dividend date is not the payment date and
  amounts are in the quote currency, so ask the user for the figures from their broker before accepting one.
- For opinions or recommendations, ask for the user's profile first (horizon, risk tolerance, goals, emergency
  fund) unless already known in the conversation. This is analysis of the user's own data, not regulated advice.
"""

READ = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False)
WRITE = ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False)

UUID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")
DEFAULT_LIMIT = 50
MAX_LIMIT = 200

Limit = Annotated[int, Field(ge=1, le=MAX_LIMIT, description="Items per page (1-200).")]
Page = Annotated[int, Field(ge=1, description="Page number, starting at 1.")]
DateStr = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="Date as YYYY-MM-DD.")]
Money = Annotated[str, Field(description='Decimal amount as a string, e.g. "12.50".')]
AssetRef = Annotated[str, Field(description="Asset ticker (e.g. AAPL, BY6.F), name or id.")]
AccountRef = Annotated[str, Field(description="Account name or id.")]


def _decimal(value: str | None, field: str) -> str | None:
    if value is None or value == "":
        return None
    try:
        return str(Decimal(str(value).replace(",", ".")))
    except InvalidOperation as exc:
        raise ToolError(f'"{field}" must be a number, got {value!r}.') from exc


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

    async def resolve_account(ref: str) -> dict[str, Any]:
        ref = ref.strip()
        data = await call("get", "accounts/", params={"page_size": MAX_LIMIT})
        rows = data["results"] if isinstance(data, dict) else data
        matches = [a for a in rows if a["id"] == ref or a["name"].lower() == ref.lower()]
        if not matches:
            matches = [a for a in rows if ref.lower() in a["name"].lower()]
        if len(matches) == 1:
            return matches[0]
        names = ", ".join(a["name"] for a in rows)
        if not matches:
            raise ToolError(f'No account matches "{ref}". Accounts: {names}.')
        raise ToolError(f'"{ref}" matches several accounts. Accounts: {names}.')

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
        """List recorded dividends, newest first: date, asset, shares, gross, withholding, net and rate."""
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
    async def fintrack_get_year_summary() -> Any:
        """Year-by-year fiscal summary: dividends, interests, realized gains and payroll totals."""
        return await call("get", "reports/year-summary/")

    @mcp.tool(annotations=READ)
    async def fintrack_get_net_worth_evolution() -> Any:
        """Monthly net worth split into cash and investments."""
        return await call("get", "reports/patrimonio-evolution/")

    @mcp.tool(annotations=READ)
    async def fintrack_get_tax_declaration(year: Annotated[int, Field(description="Fiscal year.")]) -> Any:
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
        A mismatch usually means a missing or wrong operation (e.g. a gift or fractional buy never recorded)."""
        params: dict[str, Any] = {"page_size": 1000}
        if asset:
            a = await resolve_asset(asset)
            params["asset_id"] = a["id"]
        dividends = _page(await call("get", "dividends/", params=params), 1, 1000)["items"]
        by_asset: dict[str, list[dict[str, Any]]] = {}
        for d in dividends:
            if d.get("shares"):
                by_asset.setdefault(d["asset"], []).append(d)

        mismatches = []
        for asset_id, rows in by_asset.items():
            events = (await call("get", f"assets/{asset_id}/position-history/"))["events"]
            for d in rows:
                held = Decimal("0")
                for e in events:  # events are in date order
                    if e["date"] > d["date"]:
                        break
                    if e["kind"] != "SPLIT" or e.get("status") == "APPLIED":
                        held = Decimal(e["quantity_after"])
                diff = Decimal(d["shares"]) - held
                if abs(diff) > Decimal("0.0001"):
                    mismatches.append(
                        {
                            "asset": d.get("asset_name"),
                            "ticker": d.get("asset_ticker"),
                            "dividend_date": d["date"],
                            "dividend_shares": d["shares"],
                            "shares_from_operations": str(held),
                            "difference": str(diff),
                        }
                    )
        mismatches.sort(key=lambda m: (m["asset"] or "", m["dividend_date"]))
        return {"checked_dividends": sum(len(r) for r in by_asset.values()), "mismatches": mismatches}

    @mcp.tool(annotations=READ)
    async def fintrack_get_settings() -> Any:
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
    ) -> Any:
        """Month-by-month savings: cash at month end and its change, money newly invested (investment cost delta)
        and real savings = cash change + invested. Includes stats (average, best and worst month)."""
        return await call("get", "reports/monthly-savings/", params={"from": from_month, "to": to_month})

    @mcp.tool(annotations=READ)
    async def fintrack_get_annual_savings() -> Any:
        """Savings per year: total real savings, cash change, money invested and year-end balances."""
        return await call("get", "reports/annual-savings/")

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

        mortgage_status is NONE, ACTIVE or FINISHED (paid off, early amortizations included). outstanding_balance,
        months_paid and current_monthly_payment are today's values; monthly_payment is the original payment;
        mortgage_end_date is when the last payment falls; extra_amortizations is the sum of early repayments."""
        return {"properties": await fetch_all("properties/")}

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
            "Analyse my investments with Fintrack and give me recommendations. First ask me about my profile "
            "(age range, investment horizon, risk tolerance, goals, emergency fund, income stability) unless I "
            "already told you in this conversation. Then review the whole portfolio (fintrack_get_portfolio, "
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
        tax: Annotated[str, Field(description="Withholding tax.")] = "0",
        commission: Money = "0",
        net: Annotated[str | None, Field(description="Net received; defaults to gross − tax − commission.")] = None,
        shares: Annotated[str | None, Field(description="Shares that received the dividend.")] = None,
    ) -> dict[str, Any]:
        """Record a dividend payment. Confirm the details with the user before calling."""
        a = await resolve_asset(asset)
        g, t, c = (
            Decimal(_decimal(v, f))
            for v, f in ((gross, "gross"), (tax or "0", "tax"), (commission or "0", "commission"))
        )
        payload = {
            "asset": a["id"],
            "date": date,
            "gross": str(g),
            "tax": str(t),
            "commission": str(c),
            "net": _decimal(net, "net") or str(g - t - c),
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
    ) -> Any:
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
        tax: Annotated[str, Field(description="Withholding tax from the broker.")] = "0",
        commission: Money = "0",
        net: Annotated[str | None, Field(description="Net received; defaults to gross − tax − commission.")] = None,
        shares: Annotated[str | None, Field(description="Shares; defaults to the draft's.")] = None,
    ) -> Any:
        """Turn a dividend draft into a recorded dividend with the figures confirmed by the user's broker."""
        g, t, c = (
            Decimal(_decimal(v, f))
            for v, f in ((gross, "gross"), (tax or "0", "tax"), (commission or "0", "commission"))
        )
        body = {
            "date": date,
            "gross": str(g),
            "tax": str(t),
            "commission": str(c),
            "net": _decimal(net, "net") or str(g - t - c),
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
    ) -> Any:
        """Dismiss a dividend draft; it will not be suggested again."""
        return await call("post", f"dividend-suggestions/{draft_id}/dismiss/")

    @mcp.tool(annotations=WRITE)
    async def fintrack_apply_split(
        split_id: Annotated[str, Field(description="Id of a pending stock split (fintrack_list_pending_reviews).")],
    ) -> Any:
        """Apply a detected stock split: from its date, shares are multiplied and unit costs divided."""
        return await call("post", f"splits/{split_id}/apply/")

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
