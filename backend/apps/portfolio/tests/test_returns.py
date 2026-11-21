"""Money-weighted returns (XIRR) and the benchmark ghost portfolio."""

import datetime
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.assets.models import Account, Asset, Settings
from apps.portfolio.returns import calculate_returns, xirr
from apps.transactions.models import Dividend, Transaction

User = get_user_model()
D = datetime.date
TODAY = D(2026, 1, 1)


class TestXirr:
    def test_lump_sum(self):
        # 10,000 in, 12,000 after 5 years → 3.71 % a year
        rate = xirr([(D(2021, 1, 1), -10000), (D(2026, 1, 1), 12000)])
        assert rate == pytest.approx(0.0371, abs=1e-4)

    def test_monthly_contributions_beat_the_same_simple_gain(self):
        flows = [(D(2021 + m // 12, m % 12 + 1, 1), -10000 / 60) for m in range(60)]
        rate = xirr([*flows, (D(2026, 1, 1), 12000)])
        assert rate > 0.07

    def test_loss(self):
        assert xirr([(D(2025, 1, 1), -1000), (D(2026, 1, 1), 800)]) == pytest.approx(-0.2, abs=1e-3)

    def test_needs_money_in_and_out(self):
        assert xirr([(D(2025, 1, 1), -1000)]) is None
        assert xirr([]) is None


@pytest.fixture
def user(db):
    u = User.objects.create_user(username="returns", password="testpass123")
    Settings.load(u)
    return u


@pytest.fixture
def account(user):
    return Account.objects.create(owner=user, name="Broker", type="OPERATIVA", currency="EUR")


def _asset(user, name, price):
    return Asset.objects.create(
        owner=user, name=name, ticker=name[:3].upper(), type="STOCK", currency="EUR", current_price=Decimal(price)
    )


def _tx(user, asset, account, type_, date, qty, price, commission="0"):
    return Transaction.objects.create(
        owner=user,
        asset=asset,
        account=account,
        type=type_,
        date=date,
        quantity=Decimal(qty),
        price=Decimal(price),
        commission=Decimal(commission),
        tax=Decimal("0"),
    )


def _flat_index(price=100.0):
    return patch("apps.portfolio.returns.fetch_benchmark_closes", return_value=[(D(2020, 1, 2), price)])


@pytest.mark.django_db
class TestCalculateReturns:
    def test_portfolio_and_asset_figures(self, user, account):
        a = _asset(user, "Alpha", "12")
        _tx(user, a, account, "BUY", D(2025, 1, 1), "100", "10", commission="1")
        Dividend.objects.create(
            owner=user, asset=a, date=D(2025, 7, 1), gross=Decimal("30"), tax=Decimal("5"), net=Decimal("25")
        )
        with _flat_index():
            data = calculate_returns(user, today=TODAY)

        p = data["portfolio"]
        assert p["invested"] == "1001.00"
        assert p["returned"] == "25.00"
        assert p["market_value"] == "1200.00"
        assert p["total_gain"] == "224.00"
        assert Decimal(p["xirr_pct"]) == pytest.approx(Decimal("22.6"), abs=Decimal("0.5"))
        assert p["reliable"] is True
        assert data["assets"][0]["asset_name"] == "Alpha"
        assert data["assets"][0]["is_open"] is True

    def test_closed_position_keeps_its_return(self, user, account):
        a = _asset(user, "Sold", "50")
        _tx(user, a, account, "BUY", D(2025, 1, 1), "10", "10")
        _tx(user, a, account, "SELL", D(2025, 7, 1), "10", "11")
        with _flat_index():
            row = calculate_returns(user, today=TODAY)["assets"][0]
        assert row["is_open"] is False
        assert row["total_gain"] == "10.00"
        assert Decimal(row["xirr_pct"]) > 0

    def test_less_than_a_year_is_flagged(self, user, account):
        _tx(user, _asset(user, "New", "11"), account, "BUY", D(2025, 11, 1), "10", "10")
        with _flat_index():
            assert calculate_returns(user, today=TODAY)["portfolio"]["reliable"] is False

    def test_benchmark_replays_the_same_money(self, user, account):
        a = _asset(user, "Alpha", "10")
        _tx(user, a, account, "BUY", D(2025, 1, 1), "100", "10")
        closes = [(D(2025, 1, 1), 50.0), (D(2025, 12, 31), 100.0)]
        with patch("apps.portfolio.returns.fetch_benchmark_closes", return_value=closes):
            bench = calculate_returns(user, today=TODAY)["benchmark"]
        # 1,000 € bought 20 units at 50; they are worth 2,000 € at the last close
        assert bench["market_value"] == "2000.00"
        assert bench["total_gain"] == "1000.00"
        assert bench["name"] == "MSCI World"
        assert bench["starts_late"] is False

    def test_benchmark_sells_the_same_proceeds(self, user, account):
        a = _asset(user, "Alpha", "10")
        _tx(user, a, account, "BUY", D(2025, 1, 1), "100", "10")
        _tx(user, a, account, "SELL", D(2025, 6, 1), "50", "10")
        with _flat_index():
            bench = calculate_returns(user, today=TODAY)["benchmark"]
        assert bench["returned"] == "500.00"
        assert bench["market_value"] == "500.00"

    def test_benchmark_unavailable(self, user, account):
        _tx(user, _asset(user, "Alpha", "10"), account, "BUY", D(2025, 1, 1), "1", "10")
        with patch("apps.portfolio.returns.fetch_benchmark_closes", side_effect=RuntimeError("offline")):
            assert calculate_returns(user, today=TODAY)["benchmark"] is None

    def test_no_operations(self, user):
        data = calculate_returns(user, benchmark=None, today=TODAY)
        assert data["portfolio"]["xirr_pct"] is None
        assert data["assets"] == []


@pytest.mark.django_db
class TestReturnsEndpoint:
    URL = "/api/portfolio/returns/"

    def test_requires_auth(self):
        assert APIClient().get(self.URL).status_code == 401

    def test_without_benchmark(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        res = c.get(self.URL, {"benchmark": "none"})
        assert res.status_code == 200
        assert res.json()["benchmark"] is None
        assert {b["key"] for b in res.json()["benchmarks"]} == {"msci_world", "sp500", "all_world"}

    def test_unknown_benchmark(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        assert c.get(self.URL, {"benchmark": "nasdaq"}).status_code == 400
