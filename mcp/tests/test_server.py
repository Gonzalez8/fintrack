"""Fintrack MCP server, exercised through a real in-process MCP client against a mocked Fintrack API."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
import respx
from mcp import Client

from fintrack_mcp.client import FintrackClient
from fintrack_mcp.server import create_server, main

BASE = "http://fintrack.test"
API = f"{BASE}/api"

APPLE = {"id": "11111111-1111-1111-1111-111111111111", "name": "Apple", "ticker": "APC.F"}
APPLE_ADR = {"id": "22222222-2222-2222-2222-222222222222", "name": "Apple Hospitality", "ticker": "APLE"}
BROKER = {"id": "33333333-3333-3333-3333-333333333333", "name": "Trade Republic"}
SAVINGS = {"id": "44444444-4444-4444-4444-444444444444", "name": "MyInvestor Cuenta"}


def page(items: list[dict[str, Any]], next_url: str | None = None) -> dict[str, Any]:
    return {"count": len(items), "next": next_url, "previous": None, "results": items}


@pytest.fixture
def api():
    with respx.mock(base_url=API, assert_all_called=False) as mock:
        mock.get("/assets/").mock(return_value=httpx.Response(200, json=page([APPLE, APPLE_ADR])))
        mock.get("/accounts/").mock(return_value=httpx.Response(200, json=page([BROKER, SAVINGS])))
        yield mock


async def call(tool: str, args: dict[str, Any] | None = None):
    server = create_server(FintrackClient(BASE, "ft_test"))
    async with Client(server) as client:
        return await client.call_tool(tool, args or {})


def payload(result) -> Any:
    if result.structured_content is not None:
        data = result.structured_content
        return data.get("result", data) if set(data) == {"result"} else data
    return json.loads(result.content[0].text)


def error_text(result) -> str:
    assert result.is_error
    return result.content[0].text


async def test_tools_are_prefixed_and_annotated():
    server = create_server(FintrackClient(BASE, "ft_test"))
    async with Client(server) as client:
        tools = {t.name: t for t in (await client.list_tools()).tools}
    assert len(tools) == 36 and all(name.startswith("fintrack_") for name in tools)
    writes = {n for n, t in tools.items() if not t.annotations.read_only_hint}
    assert writes == {
        "fintrack_create_transaction",
        "fintrack_create_dividend",
        "fintrack_create_interest",
        "fintrack_detect_dividend_drafts",
        "fintrack_accept_dividend_draft",
        "fintrack_dismiss_dividend_draft",
        "fintrack_apply_split",
        "fintrack_create_asset",
        "fintrack_update_asset",
        "fintrack_record_account_balances",
        "fintrack_create_other_income",
        "fintrack_record_rent_payment",
        "fintrack_create_rental_expense",
    }
    # Only the tools that overwrite existing values are flagged; none deletes anything
    overwriting = {n for n, t in tools.items() if t.annotations.destructive_hint}
    assert overwriting == {"fintrack_update_asset", "fintrack_record_account_balances"}


async def test_token_is_sent_as_bearer(api):
    route = api.get("/portfolio/").mock(return_value=httpx.Response(200, json={"totals": {}, "positions": []}))
    await call("fintrack_get_portfolio")
    assert route.calls.last.request.headers["Authorization"] == "Bearer ft_test"


async def test_portfolio_hides_realized_sales_unless_asked(api):
    api.get("/portfolio/").mock(
        return_value=httpx.Response(200, json={"totals": {"grand_total": "10"}, "positions": [], "realized_sales": [1]})
    )
    assert "realized_sales" not in payload(await call("fintrack_get_portfolio"))
    assert payload(await call("fintrack_get_portfolio", {"include_realized_sales": True}))["realized_sales"] == [1]


async def test_list_transactions_uses_backend_filter_names(api):
    route = api.get("/transactions/").mock(return_value=httpx.Response(200, json=page([], next_url="x")))
    result = payload(
        await call(
            "fintrack_list_transactions",
            {"from_date": "2026-01-01", "to_date": "2026-06-30", "account": "trade republic", "limit": 25, "page": 2},
        )
    )
    params = route.calls.last.request.url.params
    assert params["from_date"] == "2026-01-01" and params["to_date"] == "2026-06-30"
    assert params["account_id"] == BROKER["id"] and params["page_size"] == "25" and params["page"] == "2"
    assert result["has_more"] is True


async def test_asset_resolution_prefers_exact_ticker(api):
    route = api.get(f"/assets/{APPLE['id']}/position-history/").mock(
        return_value=httpx.Response(200, json={"quantity": "1.27", "events": []})
    )
    result = payload(await call("fintrack_get_position_history", {"asset": "apc.f"}))
    assert route.called and result["asset"]["ticker"] == "APC.F"


async def test_ambiguous_asset_lists_the_options(api):
    message = error_text(await call("fintrack_get_position_history", {"asset": "Appl"}))
    assert "several assets" in message and "Apple Hospitality" in message


async def test_create_transaction_sends_resolved_ids_and_decimals(api):
    route = api.post("/transactions/").mock(return_value=httpx.Response(201, json={"id": "t1"}))
    await call(
        "fintrack_create_transaction",
        {"type": "GIFT", "asset": "APC.F", "account": "Trade", "date": "2024-02-01", "quantity": "0,0597"},
    )
    body = json.loads(route.calls.last.request.content)
    assert body["asset"] == APPLE["id"] and body["account"] == BROKER["id"]
    assert body["quantity"] == "0.0597" and body["price"] is None and body["type"] == "GIFT"


async def test_create_dividend_computes_net(api):
    route = api.post("/dividends/").mock(return_value=httpx.Response(201, json={"id": "d1"}))
    await call("fintrack_create_dividend", {"asset": "APC.F", "date": "2026-11-16", "gross": "0.31", "tax": "0.05"})
    body = json.loads(route.calls.last.request.content)
    assert body["net"] == "0.26" and body["commission"] == "0"


async def test_create_dividend_subtracts_domestic_retention(api):
    route = api.post("/dividends/").mock(return_value=httpx.Response(201, json={"id": "d1"}))
    args = {"asset": "APC.F", "date": "2026-11-16", "gross": "100", "tax": "15", "domestic_tax": "19"}
    await call("fintrack_create_dividend", args)
    body = json.loads(route.calls.last.request.content)
    assert (body["domestic_tax"], body["net"]) == ("19", "66")


async def test_invalid_number_is_explained(api):
    message = error_text(
        await call("fintrack_create_dividend", {"asset": "APC.F", "date": "2026-11-16", "gross": "abc"})
    )
    assert '"gross" must be a number' in message


async def test_accept_draft_defaults_to_draft_shares(api):
    api.get("/dividend-suggestions/d1/").mock(return_value=httpx.Response(200, json={"id": "d1", "shares": "65"}))
    route = api.post("/dividend-suggestions/d1/accept/").mock(return_value=httpx.Response(201, json={"id": "x"}))
    await call("fintrack_accept_dividend_draft", {"draft_id": "d1", "date": "2026-07-20", "gross": "3.09"})
    body = json.loads(route.calls.last.request.content)
    assert body["shares"] == "65" and body["net"] == "3.09"


@pytest.mark.parametrize(
    "status,body,expected",
    [
        (401, {"detail": "Invalid or revoked API token."}, "token was rejected"),
        (403, {"detail": "This API token is read-only."}, "read-only"),
        (400, {"date": ["Enter a valid date."]}, "rejected the data"),
    ],
)
async def test_api_errors_are_actionable(api, status, body, expected):
    api.post("/dividends/").mock(return_value=httpx.Response(status, json=body))
    message = error_text(await call("fintrack_create_dividend", {"asset": "APC.F", "date": "2026-11-16", "gross": "1"}))
    assert expected in message


async def test_connection_error_explains_the_url(api):
    api.get("/portfolio/").mock(side_effect=httpx.ConnectError("refused"))
    assert "Cannot connect to Fintrack at http://fintrack.test" in error_text(await call("fintrack_get_portfolio"))


async def test_check_dividend_shares_finds_a_missing_operation(api):
    """The real case: dividends on 1.330832 Apple shares, operations only give 1.271132."""
    dividends = [
        {
            "asset": APPLE["id"],
            "asset_name": "Apple",
            "asset_ticker": "APC.F",
            "date": "2024-02-15",
            "shares": "0.0597",
        },
        {
            "asset": APPLE["id"],
            "asset_name": "Apple",
            "asset_ticker": "APC.F",
            "date": "2024-05-16",
            "shares": "1.330832",
        },
    ]
    api.get("/dividends/").mock(return_value=httpx.Response(200, json=page(dividends)))
    api.get(f"/assets/{APPLE['id']}/position-history/").mock(
        return_value=httpx.Response(
            200,
            json={
                "quantity": "1.271132",
                "events": [{"kind": "BUY", "date": "2024-03-06", "quantity_after": "1.271132"}],
            },
        )
    )
    result = payload(await call("fintrack_check_dividend_shares"))
    assert result["checked_dividends"] == 2
    assert [(m["dividend_date"], m["difference"]) for m in result["mismatches"]] == [
        ("2024-02-15", "0.0597"),
        ("2024-05-16", "0.059700"),
    ]


async def test_dividend_paid_on_pre_split_shares_is_explained(api):
    """BYD-like: ex-date before a 3:1 split, paid afterwards on the pre-split shares."""
    dividends = [
        {"asset": APPLE["id"], "asset_name": "Apple", "asset_ticker": "APC.F", "date": "2025-07-29", "shares": "15"},
        {"asset": APPLE["id"], "asset_name": "Apple", "asset_ticker": "APC.F", "date": "2026-07-29", "shares": "15"},
    ]
    api.get("/dividends/").mock(return_value=httpx.Response(200, json=page(dividends)))
    api.get(f"/assets/{APPLE['id']}/position-history/").mock(
        return_value=httpx.Response(
            200,
            json={
                "quantity": "45",
                "events": [
                    {"kind": "BUY", "date": "2024-03-06", "quantity_after": "15"},
                    {"kind": "SPLIT", "date": "2025-06-10", "status": "APPLIED", "quantity_after": "45"},
                ],
            },
        )
    )
    result = payload(await call("fintrack_check_dividend_shares"))
    assert [e["dividend_date"] for e in result["explained_by_split"]] == ["2025-07-29"]
    assert "2025-06-10" in result["explained_by_split"][0]["reason"]
    # A year later the pre-split count is no longer a valid explanation
    assert [m["dividend_date"] for m in result["mismatches"]] == ["2026-07-29"]


async def test_list_reports_return_structured_objects(api):
    api.get("/reports/year-summary/").mock(return_value=httpx.Response(200, json=[{"year": 2025}, {"year": 2026}]))
    api.get("/reports/annual-savings/").mock(return_value=httpx.Response(200, json=[{"year": 2026}]))
    api.get("/reports/patrimonio-evolution/").mock(return_value=httpx.Response(200, json=[{"month": "2026-01"}]))
    years = await call("fintrack_get_year_summary")
    assert years.structured_content["years"] == [{"year": 2025}, {"year": 2026}]
    assert (await call("fintrack_get_annual_savings")).structured_content == {"years": [{"year": 2026}]}
    assert (await call("fintrack_get_net_worth_evolution")).structured_content == {"months": [{"month": "2026-01"}]}


def test_main_requires_configuration(monkeypatch, capsys):
    monkeypatch.delenv("FINTRACK_URL", raising=False)
    monkeypatch.delenv("FINTRACK_TOKEN", raising=False)
    with pytest.raises(SystemExit) as exc:
        main()
    assert exc.value.code == 1 and "FINTRACK_TOKEN" in capsys.readouterr().err


async def test_disallowed_host_points_to_allowed_hosts(api):
    api.get("/portfolio/").mock(
        return_value=httpx.Response(400, text="<h1>Bad Request (400)</h1>", headers={"content-type": "text/html"})
    )
    message = error_text(await call("fintrack_get_portfolio"))
    assert "ALLOWED_HOSTS" in message and "fintrack.test" in message


# ---------------------------------------------------------------- insights tools


async def test_payroll_summary_pages_through_all_payslips(api):
    p1 = [
        {
            "period_end": "2025-06-30",
            "payroll_type": "MONTHLY",
            "gross": "3000",
            "net": "2200",
            "ss_employee": "190",
            "irpf_withholding": "610",
            "employer_name": "Acme",
        },
    ]
    p2 = [
        {
            "period_end": "2025-07-31",
            "payroll_type": "BONUS",
            "gross": "1500",
            "net": "1000",
            "ss_employee": "95",
            "irpf_withholding": "405",
            "employer_name": "Acme",
        },
        {
            "period_end": "2024-12-31",
            "payroll_type": "MONTHLY",
            "gross": "2800",
            "net": "2100",
            "ss_employee": "180",
            "irpf_withholding": "520",
            "employer_name": "Acme",
        },
    ]
    route = api.get("/payrolls/").mock(
        side_effect=[httpx.Response(200, json=page(p1, next_url="p2")), httpx.Response(200, json=page(p2))]
    )
    result = payload(await call("fintrack_get_payroll_summary", {"from_year": 2025}))
    assert route.call_count == 2
    (y,) = result["years"]
    assert y["year"] == 2025 and y["gross"] == "4500.00" and y["bonus_gross"] == "1500.00"
    assert y["bonus_vs_monthly_pct"] == "50.00" and y["effective_irpf_pct"] == "22.56"


async def test_list_payrolls_filters_by_type(api):
    route = api.get("/payrolls/").mock(return_value=httpx.Response(200, json=page([])))
    await call("fintrack_list_payrolls", {"year": 2025, "payroll_type": "BONUS"})
    params = route.calls.last.request.url.params
    assert params["year"] == "2025" and params["payroll_type"] == "BONUS"


async def test_monthly_savings_passes_the_month_range(api):
    route = api.get("/reports/monthly-savings/").mock(return_value=httpx.Response(200, json={"months": []}))
    await call("fintrack_get_monthly_savings", {"from_month": "2026-01", "to_month": "2026-06"})
    params = route.calls.last.request.url.params
    assert params["from"] == "2026-01" and params["to"] == "2026-06"


async def test_investment_flows_by_asset_with_search(api):
    sp500 = {
        "id": "55555555-5555-5555-5555-555555555555",
        "name": "Vanguard S&P 500 ETF",
        "ticker": "VUSA",
        "type": "ETF",
        "currency": "EUR",
    }
    api.get("/assets/").mock(return_value=httpx.Response(200, json=page([APPLE, sp500])))
    route = api.get("/transactions/").mock(
        return_value=httpx.Response(
            200,
            json=page(
                [
                    {
                        "asset": sp500["id"],
                        "type": "BUY",
                        "date": "2026-01-05",
                        "quantity": "2",
                        "price": "100",
                        "commission": "1",
                        "tax": "0",
                    },
                    {
                        "asset": sp500["id"],
                        "type": "BUY",
                        "date": "2026-03-05",
                        "quantity": "1",
                        "price": "110",
                        "commission": "1",
                        "tax": "0",
                    },
                ]
            ),
        )
    )
    result = payload(await call("fintrack_get_investment_flows", {"group_by": "asset", "search": "S&P 500"}))
    assert route.calls.last.request.url.params["search"] == "S&P 500"
    assert result["totals"]["net_invested"] == "312.00"
    assert result["totals"]["months_in_period"] == 3 and result["totals"]["average_monthly_net_invested"] == "104.00"
    assert result["groups"][0]["ticker"] == "VUSA"


async def test_account_snapshots_filter_by_date(api):
    route = api.get("/account-snapshots/").mock(
        return_value=httpx.Response(
            200, json=page([{"date": "2026-02-01", "balance": "10"}, {"date": "2025-12-01", "balance": "5"}])
        )
    )
    result = payload(
        await call("fintrack_list_account_snapshots", {"account": "Trade Republic", "from_date": "2026-01-01"})
    )
    assert route.calls.last.request.url.params["account"] == BROKER["id"]
    assert [r["date"] for r in result["snapshots"]] == ["2026-02-01"]


async def test_savings_goals_include_projection(api):
    api.get("/savings-goals/").mock(return_value=httpx.Response(200, json=page([{"id": "g1", "name": "Casa"}])))
    api.get("/savings-goals/g1/projection/").mock(return_value=httpx.Response(200, json={"reached_in_months": 30}))
    result = payload(await call("fintrack_list_savings_goals"))
    assert result["goals"][0]["projection"] == {"reached_in_months": 30}


async def test_prompts_are_available():
    server = create_server(FintrackClient(BASE, "ft_test"))
    async with Client(server) as client:
        names = {p.name for p in (await client.list_prompts()).prompts}
        prompt = await client.get_prompt("fintrack_payroll_review", {"year": "2025"})
    assert names == {"fintrack_monthly_review", "fintrack_payroll_review", "fintrack_portfolio_analysis"}
    assert "2025" in prompt.messages[0].content.text


async def test_create_asset_normalises_and_posts(api):
    route = api.post("/assets/").mock(return_value=httpx.Response(201, json={"id": "a1", "name": "Inditex"}))
    args = {"name": " Inditex ", "type": "STOCK", "ticker": "itx.mc", "isin": "es0148396007"}
    args["withholding_country"] = "es"
    await call("fintrack_create_asset", args)
    body = json.loads(route.calls.last.request.content)
    assert (body["name"], body["ticker"], body["isin"]) == ("Inditex", "ITX.MC", "ES0148396007")
    assert (body["price_mode"], body["currency"], body["withholding_country"]) == ("AUTO", "EUR", "ES")
    assert body["issuer_country"] is None


async def test_create_asset_auto_needs_ticker(api):
    message = error_text(await call("fintrack_create_asset", {"name": "Piso fund", "type": "FUND"}))
    assert "ticker" in message


async def test_create_manual_asset_sets_its_price(api):
    api.post("/assets/").mock(return_value=httpx.Response(201, json={"id": "a1", "price_mode": "MANUAL"}))
    price = api.post("/assets/a1/set-price/").mock(
        return_value=httpx.Response(200, json={"id": "a1", "current_price": "12.5"})
    )
    args = {"name": "Fondo X", "type": "FUND", "price_mode": "MANUAL", "price": "12,5"}
    result = payload(await call("fintrack_create_asset", args))
    assert json.loads(price.calls.last.request.content) == {"price": "12.5"}
    assert result["current_price"] == "12.5"


async def test_create_asset_reports_duplicate_ticker(api):
    api.post("/assets/").mock(
        return_value=httpx.Response(400, json={"ticker": ["Another asset already uses the ticker APC.F."]})
    )
    message = error_text(await call("fintrack_create_asset", {"name": "Apple", "type": "STOCK", "ticker": "APC.F"}))
    assert "already uses the ticker APC.F" in message


async def test_create_asset_rejects_bad_country(api):
    args = {"name": "X", "type": "STOCK", "ticker": "X", "withholding_country": "USA"}
    assert "two-letter" in error_text(await call("fintrack_create_asset", args))


async def test_update_asset_sends_only_given_fields(api):
    current = {**APPLE, "price_mode": "AUTO"}
    api.get("/assets/").mock(return_value=httpx.Response(200, json=page([current, APPLE_ADR])))
    route = api.patch(f"/assets/{APPLE['id']}/").mock(return_value=httpx.Response(200, json={**current, "isin": "X"}))
    await call("fintrack_update_asset", {"asset": "APC.F", "isin": "us0378331005", "domicile_country": ""})
    assert json.loads(route.calls.last.request.content) == {"isin": "US0378331005", "domicile_country": None}


async def test_update_asset_cannot_leave_auto_without_ticker(api):
    api.get("/assets/").mock(return_value=httpx.Response(200, json=page([{**APPLE, "price_mode": "AUTO"}])))
    message = error_text(await call("fintrack_update_asset", {"asset": "APC.F", "ticker": ""}))
    assert "ticker" in message


async def test_update_asset_needs_a_change(api):
    assert "Nothing to change" in error_text(await call("fintrack_update_asset", {"asset": "APC.F"}))


async def test_record_account_balances_posts_one_snapshot_per_account(api, monkeypatch):
    monkeypatch.setattr("fintrack_mcp.server._today", lambda: "2026-12-01")
    accounts = [{**BROKER, "balance": "100.00"}, {**SAVINGS, "balance": "5000.00"}]
    api.get("/accounts/").mock(return_value=httpx.Response(200, json=page(accounts)))
    route = api.post("/accounts/bulk-snapshot/").mock(
        return_value=httpx.Response(
            201,
            json=[
                {"account": BROKER["id"], "date": "2026-12-01", "balance": "250.00"},
                {"account": SAVINGS["id"], "date": "2026-12-01", "balance": "5100.00"},
            ],
        )
    )
    args = {
        "balances": [
            {"account": "trade republic", "balance": "250"},
            {"account": "MyInvestor", "balance": "5100", "note": "nómina"},
        ]
    }
    result = payload(await call("fintrack_record_account_balances", args))
    body = json.loads(route.calls.last.request.content)
    assert body["date"] == "2026-12-01"
    assert body["snapshots"] == [
        {"account": BROKER["id"], "balance": "250", "note": ""},
        {"account": SAVINGS["id"], "balance": "5100", "note": "nómina"},
    ]
    assert [s["previous_balance"] for s in result["snapshots"]] == ["100.00", "5000.00"]


async def test_record_account_balances_rejects_repeated_account(api):
    args = {"balances": [{"account": "Trade Republic", "balance": "1"}, {"account": BROKER["id"], "balance": "2"}]}
    assert "appears twice" in error_text(await call("fintrack_record_account_balances", args))


async def test_list_other_income_adds_totals(api):
    rows = [
        {"date": "2026-10-01", "category": "RENTAL", "amount": "390.00"},
        {"date": "2026-11-01", "category": "RENTAL", "amount": "400.00"},
        {"date": "2026-11-15", "category": "SIDE_JOB", "amount": "200.00"},
    ]
    route = api.get("/other-incomes/").mock(return_value=httpx.Response(200, json=page(rows)))
    result = payload(await call("fintrack_list_other_income", {"year": 2026, "category": "RENTAL"}))
    params = route.calls.last.request.url.params
    assert (params["year"], params["category"]) == ("2026", "RENTAL")
    assert result["total"] == "990.00"
    assert result["by_month"] == {"2026-10": "390.00", "2026-11": "600.00"}
    assert result["by_category"]["RENTAL"] == "790.00"
    assert result["average_per_month_with_income"] == "495.00"


async def test_create_other_income_resolves_account(api):
    route = api.post("/other-incomes/").mock(return_value=httpx.Response(201, json={"id": "o1"}))
    args = {"date": "2026-11-01", "amount": "390,50", "description": " Alquiler piso ", "category": "RENTAL"}
    await call("fintrack_create_other_income", {**args, "account": "MyInvestor"})
    body = json.loads(route.calls.last.request.content)
    assert body == {
        "date": "2026-11-01",
        "amount": "390.50",
        "description": "Alquiler piso",
        "category": "RENTAL",
        "account": SAVINGS["id"],
        "notes": "",
    }


async def test_create_other_income_without_account(api):
    route = api.post("/other-incomes/").mock(return_value=httpx.Response(201, json={"id": "o1"}))
    await call("fintrack_create_other_income", {"date": "2026-11-01", "amount": "50", "description": "Regalo"})
    body = json.loads(route.calls.last.request.content)
    assert (body["account"], body["category"]) == (None, "OTHER")


FLAT = {"id": "55555555-5555-5555-5555-555555555555", "name": "Avenida Torrente n34"}
LEASE = {
    "id": "66666666-6666-6666-6666-666666666666",
    "start_date": "2025-01-01",
    "end_date": None,
    "monthly_rent": "400.00",
}


async def test_rental_summary_passes_the_year(api):
    route = api.get("/rental/overview/").mock(return_value=httpx.Response(200, json={"year": 2026, "properties": []}))
    result = payload(await call("fintrack_get_rental_summary", {"year": 2026}))
    assert route.calls.last.request.url.params["year"] == "2026"
    assert result["year"] == 2026


async def test_record_rent_payment_uses_the_lease_in_force(api):
    api.get("/properties/").mock(return_value=httpx.Response(200, json=page([FLAT])))
    old = {**LEASE, "id": "77777777-7777-7777-7777-777777777777", "start_date": "2020-01-01", "end_date": "2024-12-31"}
    leases = api.get("/leases/").mock(return_value=httpx.Response(200, json=page([old, LEASE])))
    route = api.post("/other-incomes/").mock(return_value=httpx.Response(201, json={"id": "o1"}))
    await call("fintrack_record_rent_payment", {"property": "torrente", "date": "2026-11-01", "account": "MyInvestor"})
    assert leases.calls.last.request.url.params["property"] == FLAT["id"]
    body = json.loads(route.calls.last.request.content)
    assert (body["lease"], body["amount"], body["category"]) == (LEASE["id"], "400.00", "RENTAL")
    assert body["account"] == SAVINGS["id"]


async def test_record_rent_payment_without_lease_is_explained(api):
    api.get("/properties/").mock(return_value=httpx.Response(200, json=page([FLAT])))
    api.get("/leases/").mock(return_value=httpx.Response(200, json=page([])))
    message = error_text(await call("fintrack_record_rent_payment", {"property": FLAT["name"], "date": "2026-11-01"}))
    assert "no lease in force" in message


async def test_create_rental_expense(api):
    api.get("/properties/").mock(return_value=httpx.Response(200, json=page([FLAT])))
    route = api.post("/rental-expenses/").mock(return_value=httpx.Response(201, json={"id": "e1"}))
    args = {"property": FLAT["id"], "date": "2026-03-01", "category": "TAXES", "amount": "412,30", "description": "IBI"}
    await call("fintrack_create_rental_expense", args)
    body = json.loads(route.calls.last.request.content)
    assert (body["property"], body["amount"], body["category"]) == (FLAT["id"], "412.30", "TAXES")
