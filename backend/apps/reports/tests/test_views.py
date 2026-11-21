"""
Tests for report views: YearSummary, CSV exports, and SavingsGoal CRUD.
"""

import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.assets.models import Account, Asset
from apps.transactions.models import Dividend, Interest, Transaction

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(username="testuser", password="testpass123")


@pytest.fixture
def other_user(db):
    return User.objects.create_user(username="otheruser", password="otherpass123")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def other_client(other_user):
    c = APIClient()
    c.force_authenticate(user=other_user)
    return c


@pytest.fixture
def account(user):
    return Account.objects.create(owner=user, name="Main Account", type="OPERATIVA", currency="EUR")


@pytest.fixture
def asset(user):
    return Asset.objects.create(
        owner=user,
        name="Test Stock",
        ticker="TST",
        type=Asset.AssetType.STOCK,
        currency="EUR",
        current_price=Decimal("15.00"),
    )


@pytest.fixture
def transaction(user, asset, account):
    return Transaction.objects.create(
        owner=user,
        date=datetime.date(2025, 3, 10),
        type=Transaction.TransactionType.BUY,
        asset=asset,
        account=account,
        quantity=Decimal("10.000000"),
        price=Decimal("12.500000"),
        commission=Decimal("5.00"),
        tax=Decimal("0.00"),
    )


@pytest.fixture
def dividend(user, asset):
    return Dividend.objects.create(
        owner=user,
        date=datetime.date(2025, 6, 15),
        asset=asset,
        shares=Decimal("10.000000"),
        gross=Decimal("50.00"),
        tax=Decimal("10.00"),
        net=Decimal("40.00"),
    )


@pytest.fixture
def interest(user, account):
    return Interest.objects.create(
        owner=user,
        date_start=datetime.date(2025, 1, 1),
        date_end=datetime.date(2025, 3, 31),
        account=account,
        gross=Decimal("100.00"),
        net=Decimal("81.00"),
    )


# ── Year Summary ──────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestYearSummary:
    def test_year_summary_empty(self, client):
        resp = client.get("/api/reports/year-summary/")
        assert resp.status_code == 200
        # With no data, result should be an empty list or list with no entries
        assert isinstance(resp.data, list)

    def test_year_summary_with_data(self, client, dividend, interest):
        resp = client.get("/api/reports/year-summary/")
        assert resp.status_code == 200
        assert isinstance(resp.data, list)
        assert len(resp.data) >= 1

    def test_year_summary_unauthenticated(self):
        client = APIClient()
        resp = client.get("/api/reports/year-summary/")
        assert resp.status_code == 401


# ── Investment cost evolution ─────────────────────────────────────────────────


@pytest.mark.django_db
class TestInvestmentCostEvolution:
    def test_empty_without_operations(self, client):
        resp = client.get("/api/reports/investment-cost-evolution/")
        assert resp.status_code == 200
        assert resp.data == []

    def test_monthly_cost_until_today(self, client, user, asset, account, transaction, other_client):
        Transaction.objects.create(
            owner=user,
            date=datetime.date(2025, 5, 2),
            type=Transaction.TransactionType.SELL,
            asset=asset,
            account=account,
            quantity=Decimal("4.000000"),
            price=Decimal("20.000000"),
            commission=Decimal("0.00"),
            tax=Decimal("0.00"),
        )
        resp = client.get("/api/reports/investment-cost-evolution/")
        assert resp.status_code == 200
        by_month = {p["month"]: p for p in resp.data}
        assert resp.data[0]["month"] == "2025-03"
        assert resp.data[-1]["month"] == datetime.date.today().strftime("%Y-%m")
        # Buy 10 × 12.50 + 5 commission; selling 4 removes 4/10 of the lot's cost
        assert by_month["2025-03"] == {"month": "2025-03", "cost": "130.00", "delta": "130.00"}
        assert by_month["2025-04"] == {"month": "2025-04", "cost": "130.00", "delta": "0.00"}
        assert by_month["2025-05"] == {"month": "2025-05", "cost": "78.00", "delta": "-52.00"}
        # Other users never see it
        assert other_client.get("/api/reports/investment-cost-evolution/").data == []


# ── CSV Exports ───────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestCSVExport:
    def test_export_transactions_csv(self, client, transaction):
        resp = client.get("/api/export/transactions.csv")
        assert resp.status_code == 200
        assert resp["Content-Type"] == "text/csv"
        content = b"".join(resp.streaming_content).decode("utf-8")
        assert "Date" in content
        assert "Test Stock" in content

    def test_export_transactions_csv_empty(self, client):
        resp = client.get("/api/export/transactions.csv")
        assert resp.status_code == 200
        assert resp["Content-Type"] == "text/csv"
        content = b"".join(resp.streaming_content).decode("utf-8")
        # Header row should always be present
        assert "Date" in content

    def test_export_dividends_csv(self, client, dividend):
        resp = client.get("/api/export/dividends.csv")
        assert resp.status_code == 200
        assert resp["Content-Type"] == "text/csv"
        content = b"".join(resp.streaming_content).decode("utf-8")
        assert "Date" in content
        assert "Test Stock" in content

    def test_export_interests_csv(self, client, interest):
        resp = client.get("/api/export/interests.csv")
        assert resp.status_code == 200
        assert resp["Content-Type"] == "text/csv"
        content = b"".join(resp.streaming_content).decode("utf-8")
        assert "Date Start" in content
        assert "Main Account" in content

    def test_export_csv_unauthenticated(self):
        client = APIClient()
        resp = client.get("/api/export/transactions.csv")
        assert resp.status_code == 401


# ── Savings Goals ─────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestSavingsGoal:
    def test_create_goal(self, client):
        resp = client.post(
            "/api/savings-goals/",
            {
                "name": "Emergency Fund",
                "target_amount": "10000.00",
                "base_type": "PATRIMONY",
                "icon": "target",
            },
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["name"] == "Emergency Fund"
        assert Decimal(resp.data["target_amount"]) == Decimal("10000.00")
        assert resp.data["base_type"] == "PATRIMONY"

    def test_list_goals(self, client, user):
        from apps.reports.models import SavingsGoal

        SavingsGoal.objects.create(
            owner=user,
            name="Vacation",
            target_amount=Decimal("5000.00"),
            base_type="CASH",
        )
        resp = client.get("/api/savings-goals/")
        assert resp.status_code == 200
        results = resp.data.get("results", resp.data)
        assert len(results) >= 1
        assert results[0]["name"] == "Vacation"

    def test_update_goal(self, client, user):
        from apps.reports.models import SavingsGoal

        goal = SavingsGoal.objects.create(
            owner=user,
            name="House",
            target_amount=Decimal("50000.00"),
        )
        resp = client.patch(
            f"/api/savings-goals/{goal.id}/",
            {"name": "Dream House", "target_amount": "75000.00"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["name"] == "Dream House"
        assert Decimal(resp.data["target_amount"]) == Decimal("75000.00")

    def test_delete_goal(self, client, user):
        from apps.reports.models import SavingsGoal

        goal = SavingsGoal.objects.create(
            owner=user,
            name="Delete Me",
            target_amount=Decimal("1000.00"),
        )
        resp = client.delete(f"/api/savings-goals/{goal.id}/")
        assert resp.status_code == 204
        assert not SavingsGoal.objects.filter(id=goal.id).exists()

    def test_goal_multi_tenancy(self, client, other_user):
        from apps.reports.models import SavingsGoal

        other_goal = SavingsGoal.objects.create(
            owner=other_user,
            name="Other Goal",
            target_amount=Decimal("2000.00"),
        )
        resp = client.get("/api/savings-goals/")
        results = resp.data.get("results", resp.data)
        ids = [g["id"] for g in results]
        assert str(other_goal.id) not in ids

        resp = client.get(f"/api/savings-goals/{other_goal.id}/")
        assert resp.status_code == 404

    def test_goal_unauthenticated(self):
        client = APIClient()
        resp = client.get("/api/savings-goals/")
        assert resp.status_code == 401


class TestTaxDeclarationCountryGate:
    def test_es_resident_returns_200(self, client, user):
        from apps.assets.models import Settings as UserSettings

        UserSettings.objects.update_or_create(user=user, defaults={"tax_country": "ES"})
        resp = client.get("/api/reports/tax-declaration/?year=2025")
        assert resp.status_code == 200

    def test_unsupported_country_returns_404(self, client, user):
        from apps.assets.models import Settings as UserSettings

        UserSettings.objects.update_or_create(user=user, defaults={"tax_country": "DE"})
        resp = client.get("/api/reports/tax-declaration/?year=2025")
        assert resp.status_code == 404
        assert "DE" in resp.data["detail"]

    def test_missing_year_returns_400(self, client, user):
        resp = client.get("/api/reports/tax-declaration/")
        assert resp.status_code == 400


@pytest.mark.django_db
class TestPriceFreshness:
    URL = "/api/reports/snapshot-status/"

    def _setup(self, user, freq, updated_minutes_ago, status=Asset.PriceStatus.OK):
        from django.utils import timezone

        from apps.assets.models import Settings

        s = Settings.load(user)
        s.snapshot_frequency = freq
        s.save()
        Asset.objects.create(
            owner=user,
            name="Auto ETF",
            ticker="AUTO",
            type=Asset.AssetType.ETF,
            price_mode=Asset.PriceMode.AUTO,
            price_status=status,
            price_updated_at=timezone.now() - datetime.timedelta(minutes=updated_minutes_ago),
        )

    def test_fresh_prices(self, client, user):
        self._setup(user, 30, 45)
        data = client.get(self.URL).json()
        assert data["prices_stale"] is False
        assert data["prices_updated_at"] is not None

    def test_stale_after_a_day_without_updates(self, client, user):
        self._setup(user, 30, 25 * 60)
        assert client.get(self.URL).json()["prices_stale"] is True

    def test_long_frequency_allows_two_cycles(self, client, user):
        self._setup(user, 24 * 60, 30 * 60)
        assert client.get(self.URL).json()["prices_stale"] is False

    def test_only_errors_count_as_stale(self, client, user):
        self._setup(user, 30, 5, status=Asset.PriceStatus.ERROR)
        assert client.get(self.URL).json()["prices_stale"] is True

    def test_never_stale_when_automatic_updates_are_off(self, client, user):
        self._setup(user, 0, 10 * 24 * 60)
        assert client.get(self.URL).json()["prices_stale"] is False

    def test_never_stale_without_auto_assets(self, client, user):
        assert client.get(self.URL).json()["prices_stale"] is False
