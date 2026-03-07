"""
Smoke tests for all major Fintrack API endpoints.

Verifies status codes and basic response shapes using force_authenticate.
"""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.assets.models import Account, Asset, Settings
from apps.transactions.models import Dividend, Interest, Transaction

User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def user(db):
    return User.objects.create_user(username="smoketest", password="testpass123")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def asset(user):
    return Asset.objects.create(
        name="Test Stock",
        ticker="TST",
        type="STOCK",
        currency="EUR",
        current_price=Decimal("10.00"),
        price_mode="MANUAL",
        owner=user,
    )


@pytest.fixture
def account(user):
    return Account.objects.create(
        name="Test Account",
        type="OPERATIVA",
        currency="EUR",
        balance=Decimal("1000.00"),
        owner=user,
    )


@pytest.fixture
def transaction(user, asset, account):
    return Transaction.objects.create(
        date="2025-01-15",
        type="BUY",
        asset=asset,
        account=account,
        quantity=Decimal("10"),
        price=Decimal("10.00"),
        commission=Decimal("1.00"),
        tax=Decimal("0"),
        owner=user,
    )


@pytest.fixture
def dividend(user, asset):
    return Dividend.objects.create(
        date="2025-06-01",
        asset=asset,
        gross=Decimal("50.00"),
        tax=Decimal("10.00"),
        net=Decimal("40.00"),
        owner=user,
    )


@pytest.fixture
def interest(user, account):
    return Interest.objects.create(
        date="2025-06-01",
        account=account,
        gross=Decimal("5.00"),
        net=Decimal("4.00"),
        owner=user,
    )


# ---------------------------------------------------------------------------
# Health (no auth)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestHealth:
    def test_health(self):
        c = APIClient()
        resp = c.get("/api/health/")
        assert resp.status_code == 200
        assert "status" in resp.data


# ---------------------------------------------------------------------------
# Portfolio
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPortfolio:
    def test_list(self, client, transaction):
        resp = client.get("/api/portfolio/")
        assert resp.status_code == 200
        data = resp.data
        assert "positions" in data
        assert "totals" in data
        assert "total_market_value" in data["totals"]


# ---------------------------------------------------------------------------
# Assets CRUD
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAssets:
    def test_list(self, client, asset):
        resp = client.get("/api/assets/")
        assert resp.status_code == 200
        # paginated or list
        results = resp.data.get("results", resp.data)
        assert isinstance(results, list)
        assert len(results) >= 1

    def test_create(self, client):
        resp = client.post(
            "/api/assets/",
            {
                "name": "New ETF",
                "ticker": "NETF",
                "type": "ETF",
                "currency": "EUR",
                "price_mode": "MANUAL",
            },
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["name"] == "New ETF"
        assert resp.data["type"] == "ETF"

    def test_detail(self, client, asset):
        resp = client.get(f"/api/assets/{asset.pk}/")
        assert resp.status_code == 200
        assert resp.data["name"] == "Test Stock"

    def test_update(self, client, asset):
        resp = client.put(
            f"/api/assets/{asset.pk}/",
            {
                "name": "Updated Stock",
                "ticker": "TST",
                "type": "STOCK",
                "currency": "EUR",
                "price_mode": "MANUAL",
            },
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["name"] == "Updated Stock"

    def test_delete(self, client, asset):
        resp = client.delete(f"/api/assets/{asset.pk}/")
        assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAccounts:
    def test_list(self, client, account):
        resp = client.get("/api/accounts/")
        assert resp.status_code == 200
        results = resp.data.get("results", resp.data)
        assert isinstance(results, list)
        assert len(results) >= 1

    def test_create(self, client):
        resp = client.post(
            "/api/accounts/",
            {
                "name": "Savings Account",
                "type": "AHORRO",
                "currency": "EUR",
            },
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["name"] == "Savings Account"
        assert resp.data["type"] == "AHORRO"


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTransactions:
    def test_list(self, client, transaction):
        resp = client.get("/api/transactions/")
        assert resp.status_code == 200
        results = resp.data.get("results", resp.data)
        assert isinstance(results, list)
        assert len(results) >= 1

    def test_create(self, client, asset, account):
        resp = client.post(
            "/api/transactions/",
            {
                "date": "2025-03-01",
                "type": "BUY",
                "asset": str(asset.pk),
                "account": str(account.pk),
                "quantity": "5.000000",
                "price": "12.500000",
                "commission": "0.50",
                "tax": "0.00",
            },
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["type"] == "BUY"
        assert "asset" in resp.data
        assert "quantity" in resp.data


# ---------------------------------------------------------------------------
# Dividends
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestDividends:
    def test_list(self, client, dividend):
        resp = client.get("/api/dividends/")
        assert resp.status_code == 200
        results = resp.data.get("results", resp.data)
        assert isinstance(results, list)
        assert len(results) >= 1

    def test_create(self, client, asset):
        resp = client.post(
            "/api/dividends/",
            {
                "date": "2025-07-01",
                "asset": str(asset.pk),
                "gross": "100.00",
                "tax": "19.00",
                "net": "81.00",
            },
            format="json",
        )
        assert resp.status_code == 201
        assert str(resp.data["gross"]) == "100.00"
        assert str(resp.data["net"]) == "81.00"


# ---------------------------------------------------------------------------
# Interests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestInterests:
    def test_list(self, client, interest):
        resp = client.get("/api/interests/")
        assert resp.status_code == 200
        results = resp.data.get("results", resp.data)
        assert isinstance(results, list)
        assert len(results) >= 1

    def test_create(self, client, account):
        resp = client.post(
            "/api/interests/",
            {
                "date": "2025-07-15",
                "account": str(account.pk),
                "gross": "10.00",
                "net": "8.00",
            },
            format="json",
        )
        assert resp.status_code == 201
        assert str(resp.data["gross"]) == "10.00"
        assert str(resp.data["net"]) == "8.00"


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSettings:
    def test_get(self, client, user):
        resp = client.get("/api/settings/")
        assert resp.status_code == 200
        assert "cost_basis_method" in resp.data
        assert "base_currency" in resp.data

    def test_update(self, client, user):
        # Ensure settings exist first
        Settings.load(user)
        resp = client.put(
            "/api/settings/",
            {
                "base_currency": "USD",
                "cost_basis_method": "WAC",
                "fiscal_cost_method": "FIFO",
                "gift_cost_mode": "ZERO",
                "rounding_money": 2,
                "rounding_qty": 6,
                "price_update_interval": 0,
                "default_price_source": "YAHOO",
                "snapshot_frequency": 1440,
                "purge_portfolio_snapshots": True,
                "purge_position_snapshots": True,
            },
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["base_currency"] == "USD"
        assert resp.data["cost_basis_method"] == "WAC"


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestReports:
    def test_year_summary(self, client):
        resp = client.get("/api/reports/year-summary/")
        assert resp.status_code == 200
        assert isinstance(resp.data, (list, dict))

    def test_patrimonio_evolution(self, client):
        resp = client.get("/api/reports/patrimonio-evolution/")
        assert resp.status_code == 200
        assert isinstance(resp.data, (list, dict))

    def test_monthly_savings(self, client):
        resp = client.get("/api/reports/monthly-savings/")
        assert resp.status_code == 200
        assert isinstance(resp.data, (list, dict))
