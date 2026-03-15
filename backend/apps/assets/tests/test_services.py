"""
Tests for asset services: create_portfolio_snapshot_now.
"""

import datetime
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model

from apps.assets.models import Account, Asset, PortfolioSnapshot, PositionSnapshot, Settings
from apps.assets.services import create_portfolio_snapshot_now
from apps.transactions.models import Transaction

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(username="svcuser", password="testpass123")


@pytest.fixture
def settings_fifo(user):
    s = Settings.load(user)
    s.cost_basis_method = Settings.CostBasisMethod.FIFO
    s.save()
    return s


@pytest.fixture
def account(user):
    return Account.objects.create(
        owner=user, name="Broker", type=Account.AccountType.INVERSION, currency="EUR",
    )


@pytest.fixture
def asset(user):
    return Asset.objects.create(
        owner=user, name="Stock A", ticker="AAA", type=Asset.AssetType.STOCK,
        currency="EUR", current_price=Decimal("20.00"),
    )


@pytest.mark.django_db
class TestCreatePortfolioSnapshotNow:
    def test_creates_snapshot(self, user, settings_fifo, account, asset):
        Transaction.objects.create(
            owner=user, asset=asset, account=account, type="BUY",
            date=datetime.date(2025, 1, 1), quantity=Decimal("10"),
            price=Decimal("15"), commission=Decimal("0"), tax=Decimal("0"),
        )
        create_portfolio_snapshot_now(user)

        assert PortfolioSnapshot.objects.filter(owner=user).count() == 1
        snap = PortfolioSnapshot.objects.get(owner=user)
        assert snap.total_market_value == Decimal("200.00")  # 10 * 20
        assert PositionSnapshot.objects.filter(owner=user).count() == 1

    def test_dedup_identical_snapshot(self, user, settings_fifo, account, asset):
        Transaction.objects.create(
            owner=user, asset=asset, account=account, type="BUY",
            date=datetime.date(2025, 1, 1), quantity=Decimal("10"),
            price=Decimal("15"), commission=Decimal("0"), tax=Decimal("0"),
        )
        create_portfolio_snapshot_now(user)
        create_portfolio_snapshot_now(user)

        # Second call should be deduped (same market values)
        assert PortfolioSnapshot.objects.filter(owner=user).count() == 1

    def test_empty_portfolio(self, user, settings_fifo):
        create_portfolio_snapshot_now(user)
        # Empty portfolio creates a snapshot with 0 values
        assert PortfolioSnapshot.objects.filter(owner=user).count() == 1
