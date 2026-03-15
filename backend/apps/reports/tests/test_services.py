"""
Tests for report service functions: year_summary, patrimonio_evolution,
monthly_savings, annual_savings, savings_projection.
"""

import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from apps.assets.models import Account, AccountSnapshot, Asset, Settings
from apps.reports.models import SavingsGoal
from apps.reports.services import (
    annual_savings,
    monthly_savings,
    patrimonio_evolution,
    savings_projection,
    year_summary,
)
from apps.transactions.models import Dividend, Interest, Transaction

User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def user(db):
    return User.objects.create_user(username="reportuser", password="testpass123")


@pytest.fixture
def settings_fifo(user):
    s = Settings.load(user)
    s.cost_basis_method = Settings.CostBasisMethod.FIFO
    s.save()
    return s


@pytest.fixture
def account(user):
    return Account.objects.create(
        owner=user,
        name="Main Account",
        type=Account.AccountType.OPERATIVA,
        currency="EUR",
        balance=Decimal("0"),
    )


@pytest.fixture
def asset(user):
    return Asset.objects.create(
        owner=user,
        name="Test Stock",
        ticker="TST",
        type=Asset.AssetType.STOCK,
        currency="EUR",
        current_price=Decimal("20.00"),
    )


@pytest.fixture
def asset_b(user):
    return Asset.objects.create(
        owner=user,
        name="Bond ETF",
        ticker="BND",
        type=Asset.AssetType.ETF,
        currency="EUR",
        current_price=Decimal("50.00"),
    )


def _snap(user, account, date, balance):
    s = AccountSnapshot.objects.create(
        owner=user, account=account, date=date, balance=Decimal(str(balance)),
    )
    s._sync_account_balance()
    return s


def _tx(user, asset, account, tx_type, date, qty, price):
    return Transaction.objects.create(
        owner=user,
        asset=asset,
        account=account,
        type=tx_type,
        date=date,
        quantity=Decimal(str(qty)),
        price=Decimal(str(price)),
        commission=Decimal("0"),
        tax=Decimal("0"),
    )


# ---------------------------------------------------------------------------
# year_summary
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestYearSummary:
    def test_empty(self, user, settings_fifo):
        result = year_summary(user)
        assert result == []

    def test_dividends_only(self, user, settings_fifo, asset):
        Dividend.objects.create(
            owner=user, asset=asset, date=datetime.date(2024, 6, 15),
            gross=Decimal("100"), tax=Decimal("15"), net=Decimal("85"),
        )
        result = year_summary(user)
        assert len(result) == 1
        assert result[0]["year"] == 2024
        assert Decimal(result[0]["dividends_gross"]) == Decimal("100")
        assert Decimal(result[0]["dividends_net"]) == Decimal("85")

    def test_mixed_data(self, user, settings_fifo, asset, account):
        Dividend.objects.create(
            owner=user, asset=asset, date=datetime.date(2024, 3, 1),
            gross=Decimal("50"), tax=Decimal("5"), net=Decimal("45"),
        )
        Interest.objects.create(
            owner=user, account=account,
            date_start=datetime.date(2024, 1, 1),
            date_end=datetime.date(2024, 3, 31),
            gross=Decimal("30"), net=Decimal("25"),
        )
        result = year_summary(user)
        assert len(result) == 1
        y = result[0]
        assert Decimal(y["dividends_net"]) == Decimal("45")
        assert Decimal(y["interests_net"]) == Decimal("25")
        assert Decimal(y["total_income"]) == Decimal("70")  # 45 + 25 + 0 realized

    def test_multi_year(self, user, settings_fifo, asset):
        Dividend.objects.create(
            owner=user, asset=asset, date=datetime.date(2023, 6, 1),
            gross=Decimal("10"), tax=Decimal("1"), net=Decimal("9"),
        )
        Dividend.objects.create(
            owner=user, asset=asset, date=datetime.date(2024, 6, 1),
            gross=Decimal("20"), tax=Decimal("2"), net=Decimal("18"),
        )
        result = year_summary(user)
        assert len(result) == 2
        assert result[0]["year"] == 2023
        assert result[1]["year"] == 2024


# ---------------------------------------------------------------------------
# patrimonio_evolution
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPatrimonioEvolution:
    def test_empty(self, user, settings_fifo):
        result = patrimonio_evolution(user)
        assert result == []

    def test_snapshots_only(self, user, settings_fifo, account):
        _snap(user, account, datetime.date(2024, 1, 31), 5000)
        _snap(user, account, datetime.date(2024, 2, 28), 5500)

        result = patrimonio_evolution(user)
        assert len(result) >= 2
        jan = next(m for m in result if m["month"] == "2024-01")
        feb = next(m for m in result if m["month"] == "2024-02")
        assert Decimal(jan["cash"]) == Decimal("5000")
        assert Decimal(feb["cash"]) == Decimal("5500")

    def test_with_transactions(self, user, settings_fifo, account, asset):
        _snap(user, account, datetime.date(2024, 1, 31), 5000)
        _tx(user, asset, account, "BUY", datetime.date(2024, 1, 15), 10, 20)

        result = patrimonio_evolution(user)
        assert len(result) >= 1
        jan = next(m for m in result if m["month"] == "2024-01")
        assert Decimal(jan["cash"]) == Decimal("5000")


# ---------------------------------------------------------------------------
# monthly_savings
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestMonthlySavings:
    def test_no_snapshots(self, user, settings_fifo):
        result = monthly_savings(user)
        assert result == {"months": [], "stats": None}

    def test_sequential_snapshots(self, user, settings_fifo, account):
        _snap(user, account, datetime.date(2024, 1, 31), 5000)
        _snap(user, account, datetime.date(2024, 2, 28), 5500)
        _snap(user, account, datetime.date(2024, 3, 31), 6200)

        result = monthly_savings(user)
        months = result["months"]
        assert len(months) == 3

        # First month has no delta (no previous)
        assert months[0]["cash_delta"] is None
        assert months[0]["real_savings"] is None

        # Second month: delta = 5500 - 5000 = 500
        assert Decimal(months[1]["cash_delta"]) == Decimal("500")

        # Third month: delta = 6200 - 5500 = 700
        assert Decimal(months[2]["cash_delta"]) == Decimal("700")

    def test_stats_computation(self, user, settings_fifo, account):
        _snap(user, account, datetime.date(2024, 1, 31), 1000)
        _snap(user, account, datetime.date(2024, 2, 28), 1500)
        _snap(user, account, datetime.date(2024, 3, 31), 1200)

        result = monthly_savings(user)
        stats = result["stats"]
        assert stats is not None
        assert Decimal(stats["current_cash"]) == Decimal("1200")
        assert stats["best_month"] is not None
        assert stats["worst_month"] is not None

    def test_date_filtering(self, user, settings_fifo, account):
        _snap(user, account, datetime.date(2024, 1, 31), 1000)
        _snap(user, account, datetime.date(2024, 2, 28), 1500)
        _snap(user, account, datetime.date(2024, 3, 31), 2000)

        result = monthly_savings(user, start_date="2024-02", end_date="2024-02")
        months = result["months"]
        assert len(months) == 1
        assert months[0]["month"] == "2024-02"

    def test_with_transactions(self, user, settings_fifo, account, asset):
        _snap(user, account, datetime.date(2024, 1, 31), 5000)
        _snap(user, account, datetime.date(2024, 2, 28), 4500)
        _tx(user, asset, account, "BUY", datetime.date(2024, 2, 15), 10, 20)

        result = monthly_savings(user)
        months = result["months"]
        feb = next(m for m in months if m["month"] == "2024-02")
        # Cash delta = 4500 - 5000 = -500
        assert Decimal(feb["cash_delta"]) == Decimal("-500")
        # Investment cost delta = 200 (10 * 20)
        assert Decimal(feb["investment_cost_delta"]) == Decimal("200")
        # Real savings = -500 + 200 = -300
        assert Decimal(feb["real_savings"]) == Decimal("-300")


# ---------------------------------------------------------------------------
# annual_savings
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAnnualSavings:
    def test_yearly_aggregation(self, user, settings_fifo, account):
        _snap(user, account, datetime.date(2024, 1, 31), 1000)
        _snap(user, account, datetime.date(2024, 2, 28), 1500)
        _snap(user, account, datetime.date(2024, 3, 31), 2000)

        result = annual_savings(user)
        assert len(result) == 1
        year = result[0]
        assert year["year"] == 2024
        assert year["months_count"] == 3
        assert Decimal(year["cash_end"]) == Decimal("2000")

    def test_multi_year(self, user, settings_fifo, account):
        _snap(user, account, datetime.date(2023, 12, 31), 5000)
        _snap(user, account, datetime.date(2024, 6, 30), 8000)

        result = annual_savings(user)
        assert len(result) == 2
        assert result[0]["year"] == 2023
        assert result[1]["year"] == 2024

    def test_yoy_growth(self, user, settings_fifo, account):
        _snap(user, account, datetime.date(2023, 12, 31), 5000)
        _snap(user, account, datetime.date(2024, 12, 31), 8000)

        result = annual_savings(user)
        assert result[0]["patrimony_growth"] is None  # First year
        assert result[1]["patrimony_growth"] is not None  # Second year has growth


# ---------------------------------------------------------------------------
# savings_projection
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSavingsProjection:
    def test_scenarios(self, user, settings_fifo, account):
        # Create enough data for trimmed mean
        for i in range(1, 13):
            _snap(user, account, datetime.date(2024, i, 28), 1000 + i * 500)

        goal = SavingsGoal.objects.create(
            owner=user, name="Test Goal", target_amount=Decimal("50000"),
        )
        result = savings_projection(user, goal.id)

        assert "scenarios" in result
        assert "conservative" in result["scenarios"]
        assert "average" in result["scenarios"]
        assert "optimistic" in result["scenarios"]

        # Conservative rate < average < optimistic
        c = Decimal(result["scenarios"]["conservative"]["monthly_rate"])
        a = Decimal(result["scenarios"]["average"]["monthly_rate"])
        o = Decimal(result["scenarios"]["optimistic"]["monthly_rate"])
        assert c < a < o

    def test_on_track_with_deadline(self, user, settings_fifo, account):
        for i in range(1, 7):
            _snap(user, account, datetime.date(2024, i, 28), 1000 + i * 1000)

        goal = SavingsGoal.objects.create(
            owner=user, name="Short Goal", target_amount=Decimal("10000"),
            deadline=datetime.date(2030, 12, 31),
        )
        result = savings_projection(user, goal.id)
        assert result["on_track"] is not None  # Should have a boolean value

    def test_no_deadline(self, user, settings_fifo, account):
        _snap(user, account, datetime.date(2024, 1, 31), 1000)
        _snap(user, account, datetime.date(2024, 2, 28), 2000)

        goal = SavingsGoal.objects.create(
            owner=user, name="No Deadline", target_amount=Decimal("50000"),
        )
        result = savings_projection(user, goal.id)
        assert result["on_track"] is None
        assert result["deadline_shortfall"] is None

    def test_goal_not_found(self, user, settings_fifo):
        import uuid
        with pytest.raises(SavingsGoal.DoesNotExist):
            savings_projection(user, uuid.uuid4())

    def test_base_type_cash(self, user, settings_fifo, account):
        _snap(user, account, datetime.date(2024, 1, 31), 5000)
        _snap(user, account, datetime.date(2024, 2, 28), 6000)

        goal = SavingsGoal.objects.create(
            owner=user, name="Cash Goal", target_amount=Decimal("20000"),
            base_type="CASH",
        )
        result = savings_projection(user, goal.id)
        # Current patrimony should be based on cash only
        assert Decimal(result["current_patrimony"]) == Decimal("6000.00")
