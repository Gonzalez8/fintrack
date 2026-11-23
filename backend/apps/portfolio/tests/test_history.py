"""Rebuilding the portfolio history from the operations."""

import datetime
import uuid
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.assets.models import Account, Asset, PortfolioSnapshot, Settings
from apps.portfolio.history import preview_rebuild, rebuild_history
from apps.transactions.models import StockSplit, Transaction

User = get_user_model()
D = datetime.date
TODAY = D(2025, 1, 13)  # Monday


@pytest.fixture
def user(db):
    u = User.objects.create_user(username="history", password="testpass123")
    Settings.load(u)
    return u


@pytest.fixture
def account(user):
    return Account.objects.create(owner=user, name="Broker", type="OPERATIVA", currency="EUR")


def _asset(user, name, ticker="ALP", source="YAHOO"):
    return Asset.objects.create(
        owner=user,
        name=name,
        ticker=ticker,
        type="STOCK",
        currency="EUR",
        price_source=source,
        current_price=Decimal("10"),
    )


def _tx(user, asset, account, type_, date, qty, price):
    return Transaction.objects.create(
        owner=user,
        asset=asset,
        account=account,
        type=type_,
        date=date,
        quantity=Decimal(qty),
        price=Decimal(price),
        commission=Decimal("0"),
        tax=Decimal("0"),
    )


def _snap(user, day, value="1"):
    return PortfolioSnapshot.objects.create(
        owner=user,
        batch_id=uuid.uuid4(),
        captured_at=timezone.make_aware(datetime.datetime.combine(day, datetime.time(12))),
        total_market_value=Decimal(value),
    )


def _closes(*pairs):
    return patch("apps.portfolio.history.fetch_daily_closes", return_value=list(pairs))


@pytest.mark.django_db
class TestRebuild:
    def test_fills_trading_days_from_yahoo_closes(self, user, account):
        a = _asset(user, "Alpha")
        _tx(user, a, account, "BUY", D(2025, 1, 6), "10", "10")
        _tx(user, a, account, "SELL", D(2025, 1, 9), "4", "13")
        closes = [
            (D(2025, 1, 6), 10.0),
            (D(2025, 1, 7), 8.0),
            (D(2025, 1, 8), 12.0),
            (D(2025, 1, 9), 13.0),
            (D(2025, 1, 10), 11.0),
        ]
        with _closes(*closes):
            preview = preview_rebuild(user, today=TODAY)
            assert PortfolioSnapshot.objects.count() == 0
            data = rebuild_history(user, today=TODAY)

        assert preview["days"] == data["created"] == 5
        assert data["first_date"] == "2025-01-06" and data["last_date"] == "2025-01-10"
        snaps = {timezone.localtime(s.captured_at).date(): s for s in PortfolioSnapshot.objects.all()}
        assert snaps[D(2025, 1, 7)].total_market_value == Decimal("80.00")
        assert snaps[D(2025, 1, 7)].total_unrealized_pnl == Decimal("-20.00")
        # After the sale: 6 shares at 11, cost 60
        assert snaps[D(2025, 1, 10)].total_market_value == Decimal("66.00")
        assert snaps[D(2025, 1, 10)].total_cost == Decimal("60.00")
        assert data["lowest"]["date"] == "2025-01-07" and data["lowest"]["pnl_pct"] == "-20.00"
        assert len({s.batch_id for s in snaps.values()}) == 1

    def test_keeps_existing_snapshots(self, user, account):
        a = _asset(user, "Alpha")
        _tx(user, a, account, "BUY", D(2025, 1, 6), "10", "10")
        existing = _snap(user, D(2025, 1, 8), "999")
        closes = [(D(2025, 1, d), 10.0) for d in (6, 7, 8, 9, 10)]
        with _closes(*closes):
            data = rebuild_history(user, today=TODAY)
            again = rebuild_history(user, today=TODAY)
        assert data["created"] == 4
        assert again["created"] == 0
        existing.refresh_from_db()
        assert existing.total_market_value == Decimal("999")

    def test_closes_are_scaled_back_for_later_splits(self, user, account):
        a = _asset(user, "Alpha")
        _tx(user, a, account, "BUY", D(2025, 1, 6), "10", "100")
        StockSplit.objects.create(
            owner=user,
            asset=a,
            date=D(2025, 1, 9),
            ratio_from=Decimal("1"),
            ratio_to=Decimal("4"),
            status=StockSplit.Status.APPLIED,
        )
        # Yahoo shows the old closes already divided by 4
        closes = [(D(2025, 1, 7), 25.0), (D(2025, 1, 9), 25.0)]
        with _closes(*closes):
            rebuild_history(user, today=TODAY)
        snaps = {timezone.localtime(s.captured_at).date(): s for s in PortfolioSnapshot.objects.all()}
        assert snaps[D(2025, 1, 7)].total_market_value == Decimal("1000.00")  # 10 shares × 100
        assert snaps[D(2025, 1, 9)].total_market_value == Decimal("1000.00")  # 40 shares × 25

    def test_manual_assets_use_the_last_operation_price(self, user, account):
        a = _asset(user, "Fund", ticker=None, source="MANUAL")
        _tx(user, a, account, "BUY", D(2025, 1, 6), "10", "10")
        _tx(user, a, account, "BUY", D(2025, 1, 8), "10", "12")
        with _closes():
            data = rebuild_history(user, today=TODAY)
        # No Yahoo prices: weekdays from the first operation to yesterday
        assert data["days"] == 5
        assert data["assets"][0]["source"] == "OPERATIONS"
        snaps = {timezone.localtime(s.captured_at).date(): s for s in PortfolioSnapshot.objects.all()}
        assert snaps[D(2025, 1, 7)].total_market_value == Decimal("100.00")
        assert snaps[D(2025, 1, 9)].total_market_value == Decimal("240.00")

    def test_nothing_to_do(self, user):
        data = preview_rebuild(user, today=TODAY)
        assert data["days"] == 0 and data["first_date"] is None and data["lowest"] is None


@pytest.mark.django_db
class TestRebuildEndpoint:
    URL = "/api/portfolio/rebuild-history/"

    def test_requires_auth(self):
        assert APIClient().get(self.URL).status_code == 401

    def test_get_previews_and_post_creates(self, user, account):
        a = _asset(user, "Alpha")
        _tx(user, a, account, "BUY", D(2025, 1, 6), "1", "10")
        c = APIClient()
        c.force_authenticate(user=user)
        with _closes((D(2025, 1, 6), 10.0)):
            res = c.get(self.URL)
            assert res.status_code == 200 and res.json()["created"] == 0
            assert PortfolioSnapshot.objects.count() == 0
            res = c.post(self.URL)
        assert res.status_code == 201
        assert res.json()["created"] == PortfolioSnapshot.objects.count() > 0
