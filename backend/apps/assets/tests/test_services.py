"""
Tests for asset services: create_portfolio_snapshot_now.
"""

import datetime
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.assets.models import Account, Asset, PortfolioSnapshot, Settings
from apps.assets.services import _fetch_batch, create_portfolio_snapshot_now, update_prices
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
        owner=user,
        name="Broker",
        type=Account.AccountType.INVERSION,
        currency="EUR",
    )


@pytest.fixture
def asset(user):
    return Asset.objects.create(
        owner=user,
        name="Stock A",
        ticker="AAA",
        type=Asset.AssetType.STOCK,
        currency="EUR",
        current_price=Decimal("20.00"),
    )


@pytest.mark.django_db
class TestCreatePortfolioSnapshotNow:
    def test_creates_snapshot(self, user, settings_fifo, account, asset):
        Transaction.objects.create(
            owner=user,
            asset=asset,
            account=account,
            type="BUY",
            date=datetime.date(2025, 1, 1),
            quantity=Decimal("10"),
            price=Decimal("15"),
            commission=Decimal("0"),
            tax=Decimal("0"),
        )
        create_portfolio_snapshot_now(user)

        assert PortfolioSnapshot.objects.filter(owner=user).count() == 1
        snap = PortfolioSnapshot.objects.get(owner=user)
        assert snap.total_market_value == Decimal("200.00")  # 10 * 20

    def test_dedup_identical_snapshot(self, user, settings_fifo, account, asset):
        Transaction.objects.create(
            owner=user,
            asset=asset,
            account=account,
            type="BUY",
            date=datetime.date(2025, 1, 1),
            quantity=Decimal("10"),
            price=Decimal("15"),
            commission=Decimal("0"),
            tax=Decimal("0"),
        )
        create_portfolio_snapshot_now(user)
        create_portfolio_snapshot_now(user)

        # Second call should be deduped (same market values)
        assert PortfolioSnapshot.objects.filter(owner=user).count() == 1

    def test_empty_portfolio(self, user, settings_fifo):
        create_portfolio_snapshot_now(user)
        # Empty portfolio creates a snapshot with 0 values
        assert PortfolioSnapshot.objects.filter(owner=user).count() == 1


@pytest.mark.django_db
class TestUpdatePrices:
    """Prices never step back to an older bar (Yahoo drops the day that just closed around midnight)."""

    def _auto_asset(self, user, price, updated_at):
        return Asset.objects.create(
            owner=user,
            name="Stock B",
            ticker="BBB",
            type=Asset.AssetType.STOCK,
            currency="EUR",
            price_mode=Asset.PriceMode.AUTO,
            current_price=price,
            price_updated_at=updated_at,
        )

    def _patch_fetch(self, bar_date, close):
        return patch("apps.assets.services._fetch_batch", return_value={"BBB": (bar_date, close)})

    def test_newer_bar_updates_price(self, user):
        updated_at = timezone.make_aware(datetime.datetime(2026, 10, 30, 22, 15))
        asset = self._auto_asset(user, Decimal("100.00"), updated_at)
        with self._patch_fetch(datetime.date(2026, 10, 31), 95.5):
            result = update_prices(user)
        asset.refresh_from_db()
        assert result["updated"] == 1
        assert asset.current_price == Decimal("95.5")
        assert asset.price_updated_at > updated_at

    def test_same_day_bar_updates_price(self, user):
        updated_at = timezone.make_aware(datetime.datetime(2026, 10, 30, 10, 0))
        asset = self._auto_asset(user, Decimal("100.00"), updated_at)
        with self._patch_fetch(datetime.date(2026, 10, 30), 97.0):
            update_prices(user)
        asset.refresh_from_db()
        assert asset.current_price == Decimal("97.0")

    def test_older_bar_keeps_current_price(self, user):
        # Last good price taken at 22:15 on 30 Oct; at midnight Yahoo returns the 29 Oct close
        updated_at = timezone.make_aware(datetime.datetime(2026, 10, 30, 22, 15))
        asset = self._auto_asset(user, Decimal("100.00"), updated_at)
        with self._patch_fetch(datetime.date(2026, 10, 29), 110.0):
            result = update_prices(user)
        asset.refresh_from_db()
        assert result["updated"] == 0
        assert result["errors"] == []
        assert asset.current_price == Decimal("100.00")
        assert asset.price_updated_at == updated_at

    def test_first_price_accepts_any_bar(self, user):
        asset = self._auto_asset(user, None, None)
        with self._patch_fetch(datetime.date(2026, 10, 29), 110.0):
            update_prices(user)
        asset.refresh_from_db()
        assert asset.current_price == Decimal("110.0")


class TestFetchBatch:
    def _frame(self, columns):
        import pandas as pd

        index = pd.to_datetime(["2026-10-29", "2026-10-30"])
        return pd.concat({"Close": pd.DataFrame(columns, index=index)}, axis=1)

    def test_returns_last_bar_date_and_close_per_ticker(self):
        data = self._frame({"AAA": [10.0, 11.0], "BBB": [20.0, float("nan")]})
        with patch("yfinance.download", return_value=data):
            prices = _fetch_batch(["AAA", "BBB", "CCC"])
        assert prices == {
            "AAA": (datetime.date(2026, 10, 30), 11.0),
            "BBB": (datetime.date(2026, 10, 29), 20.0),
        }

    def test_single_ticker_flat_series(self):
        import pandas as pd

        index = pd.to_datetime(["2026-10-29", "2026-10-30"])
        data = pd.DataFrame({"Close": [10.0, 12.5]}, index=index)
        with patch("yfinance.download", return_value=data):
            assert _fetch_batch(["AAA"]) == {"AAA": (datetime.date(2026, 10, 30), 12.5)}
