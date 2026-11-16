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
    assert len(tools) == 19 and all(name.startswith("fintrack_") for name in tools)
    writes = {n for n, t in tools.items() if not t.annotations.read_only_hint}
    assert writes == {
        "fintrack_create_transaction",
        "fintrack_create_dividend",
        "fintrack_create_interest",
        "fintrack_detect_dividend_drafts",
        "fintrack_accept_dividend_draft",
        "fintrack_dismiss_dividend_draft",
        "fintrack_apply_split",
    }
    assert not any(t.annotations.destructive_hint for t in tools.values())


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


def test_main_requires_configuration(monkeypatch, capsys):
    monkeypatch.delenv("FINTRACK_URL", raising=False)
    monkeypatch.delenv("FINTRACK_TOKEN", raising=False)
    with pytest.raises(SystemExit) as exc:
        main()
    assert exc.value.code == 1 and "FINTRACK_TOKEN" in capsys.readouterr().err
