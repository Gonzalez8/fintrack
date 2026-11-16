"""
Tests for stock splits: portfolio engine adjustments, Yahoo auto-detection,
the /api/splits/ endpoints and backup round-trip.
"""

import datetime
import json
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.assets.models import Account, Asset, Settings
from apps.portfolio.services import (
    calculate_portfolio,
    calculate_portfolio_full,
    compute_investment_cost_by_month,
)
from apps.transactions.models import StockSplit, Transaction
from apps.transactions.services import detect_splits, ratio_parts

User = get_user_model()

FETCH = "apps.transactions.services._fetch_yahoo_splits"
SPLIT_DATE = datetime.date(2026, 7, 2)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def user(db):
    return User.objects.create_user(username="splituser", password="testpass123")


@pytest.fixture
def user2(db):
    return User.objects.create_user(username="otheruser", password="testpass123")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def account(user):
    return Account.objects.create(owner=user, name="Broker", type=Account.AccountType.INVERSION, currency="USD")


@pytest.fixture
def asset(user):
    return Asset.objects.create(
        owner=user,
        name="CrowdStrike",
        ticker="CRWD",
        type=Asset.AssetType.STOCK,
        currency="USD",
        price_mode=Asset.PriceMode.AUTO,
        current_price=Decimal("226.00"),
    )


def _set_method(user, method):
    s = Settings.load(user)
    s.cost_basis_method = method
    s.fiscal_cost_method = method
    s.save()


def _tx(user, asset, account, tx_type, date, quantity, price):
    return Transaction.objects.create(
        owner=user,
        asset=asset,
        account=account,
        type=tx_type,
        date=date,
        quantity=Decimal(str(quantity)),
        price=Decimal(str(price)),
    )


def _split(user, asset, date=SPLIT_DATE, ratio_from="1", ratio_to="4", status=StockSplit.Status.APPLIED):
    return StockSplit.objects.create(
        owner=user,
        asset=asset,
        date=date,
        ratio_from=Decimal(ratio_from),
        ratio_to=Decimal(ratio_to),
        status=status,
    )


def _pos(portfolio, ticker="CRWD"):
    return next((p for p in portfolio["positions"] if p["asset_ticker"] == ticker), None)


# ---------------------------------------------------------------------------
# Portfolio engine
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEngine:
    @pytest.mark.parametrize("method", ["FIFO", "LIFO", "WAC"])
    def test_forward_split_multiplies_shares_keeps_cost(self, user, asset, account, method):
        _set_method(user, method)
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)
        _split(user, asset)

        pos = _pos(calculate_portfolio(user))
        assert Decimal(pos["quantity"]) == Decimal("4")
        assert Decimal(pos["cost_basis"]) == Decimal("800.00")
        assert Decimal(pos["avg_cost"]) == Decimal("200.00")
        assert Decimal(pos["market_value"]) == Decimal("904.00")
        assert Decimal(pos["unrealized_pnl"]) == Decimal("104.00")

    def test_without_split_position_is_understated(self, user, asset, account):
        """Regression baseline: this is the bug the feature fixes."""
        _set_method(user, "FIFO")
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)

        pos = _pos(calculate_portfolio(user))
        assert Decimal(pos["quantity"]) == Decimal("1")
        assert Decimal(pos["unrealized_pnl"]) == Decimal("-574.00")

    @pytest.mark.parametrize("method", ["FIFO", "LIFO", "WAC"])
    def test_sell_after_split_uses_adjusted_cost(self, user, asset, account, method):
        _set_method(user, method)
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)
        _split(user, asset)
        _tx(user, asset, account, "SELL", datetime.date(2026, 8, 1), 2, 250)

        data = calculate_portfolio_full(user)
        sale = data["realized_sales"][0]
        assert Decimal(sale["cost_basis"]) == Decimal("400.00")
        assert Decimal(sale["realized_pnl"]) == Decimal("100.00")
        assert Decimal(sale["oversell_quantity"]) == Decimal("0")
        assert Decimal(_pos(data)["quantity"]) == Decimal("2")

    def test_lifo_scales_every_open_lot(self, user, asset, account):
        _set_method(user, "LIFO")
        _tx(user, asset, account, "BUY", datetime.date(2021, 1, 1), 1, 400)
        _tx(user, asset, account, "BUY", datetime.date(2022, 1, 1), 1, 800)
        _split(user, asset)
        _tx(user, asset, account, "SELL", datetime.date(2026, 8, 1), 4, 250)

        sale = calculate_portfolio_full(user)["realized_sales"][0]
        # LIFO consumes the newer lot: 4 shares at 800/4 = 200 each
        assert Decimal(sale["cost_basis"]) == Decimal("800.00")

    def test_reverse_split(self, user, asset, account):
        _set_method(user, "FIFO")
        asset.current_price = Decimal("100.00")
        asset.save()
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 15, 10)
        _split(user, asset, ratio_from="10", ratio_to="1")

        pos = _pos(calculate_portfolio(user))
        assert Decimal(pos["quantity"]) == Decimal("1.5")
        assert Decimal(pos["cost_basis"]) == Decimal("150.00")
        assert Decimal(pos["avg_cost"]) == Decimal("100.00")

    def test_buy_on_split_date_is_not_scaled(self, user, asset, account):
        """Trades on the split date already happen at post-split prices."""
        _set_method(user, "FIFO")
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)
        _tx(user, asset, account, "BUY", SPLIT_DATE, 2, 200)
        _split(user, asset)

        pos = _pos(calculate_portfolio(user))
        assert Decimal(pos["quantity"]) == Decimal("6")
        assert Decimal(pos["cost_basis"]) == Decimal("1200.00")

    def test_split_after_full_sale_has_no_effect(self, user, asset, account):
        _set_method(user, "FIFO")
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)
        _tx(user, asset, account, "SELL", datetime.date(2022, 5, 10), 1, 900)
        _split(user, asset)

        assert _pos(calculate_portfolio(user)) is None

    @pytest.mark.parametrize("status", [StockSplit.Status.PENDING, StockSplit.Status.DISMISSED])
    def test_only_applied_splits_count(self, user, asset, account, status):
        _set_method(user, "FIFO")
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)
        _split(user, asset, status=status)

        assert Decimal(_pos(calculate_portfolio(user))["quantity"]) == Decimal("1")

    def test_split_of_other_user_is_ignored(self, user, user2, asset, account):
        _set_method(user, "FIFO")
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)
        other_asset = Asset.objects.create(owner=user2, name="X", ticker="CRWD", currency="USD")
        _split(user2, other_asset)

        assert Decimal(_pos(calculate_portfolio(user))["quantity"]) == Decimal("1")

    @pytest.mark.parametrize("method", ["FIFO", "LIFO", "WAC"])
    def test_investment_cost_by_month(self, user, asset, account, method):
        _set_method(user, method)
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)
        _split(user, asset)
        _tx(user, asset, account, "SELL", datetime.date(2026, 8, 1), 2, 250)

        cost = compute_investment_cost_by_month(user)
        assert cost["2021-05"] == Decimal("800")
        assert cost["2026-08"] == Decimal("400")


# ---------------------------------------------------------------------------
# Auto-detection
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestDetection:
    @pytest.mark.parametrize(
        "ratio,expected",
        [
            (4.0, (Decimal("1"), Decimal("4"))),
            (1.5, (Decimal("1"), Decimal("1.5"))),
            (0.1, (Decimal("10"), Decimal("1"))),
        ],
    )
    def test_ratio_parts(self, ratio, expected):
        assert ratio_parts(ratio) == expected

    def test_creates_pending_split(self, user, asset, account):
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)
        with patch(FETCH, return_value=[(SPLIT_DATE, 4.0)]):
            created = detect_splits(user)

        assert len(created) == 1
        split = created[0]
        assert split.status == StockSplit.Status.PENDING
        assert split.source == StockSplit.Source.AUTO
        assert (split.ratio_from, split.ratio_to) == (Decimal("1"), Decimal("4"))
        # PENDING does not change the portfolio until applied
        assert Decimal(_pos(calculate_portfolio(user))["quantity"]) == Decimal("1")

    def test_is_idempotent(self, user, asset, account):
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)
        with patch(FETCH, return_value=[(SPLIT_DATE, 4.0)]):
            detect_splits(user)
            assert detect_splits(user) == []
        assert StockSplit.objects.filter(owner=user).count() == 1

    def test_dismissed_split_is_not_suggested_again(self, user, asset, account):
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)
        _split(user, asset, status=StockSplit.Status.DISMISSED)
        with patch(FETCH, return_value=[(SPLIT_DATE, 4.0)]):
            assert detect_splits(user) == []

    def test_skips_split_before_first_purchase(self, user, asset, account):
        _tx(user, asset, account, "BUY", datetime.date(2026, 9, 1), 1, 200)
        with patch(FETCH, return_value=[(SPLIT_DATE, 4.0)]):
            assert detect_splits(user) == []

    def test_skips_when_no_shares_held_at_split(self, user, asset, account):
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)
        _tx(user, asset, account, "SELL", datetime.date(2022, 5, 10), 1, 900)
        with patch(FETCH, return_value=[(SPLIT_DATE, 4.0)]):
            assert detect_splits(user) == []

    def test_skips_manual_priced_assets(self, user, asset, account):
        asset.price_mode = Asset.PriceMode.MANUAL
        asset.save()
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)
        with patch(FETCH, return_value=[(SPLIT_DATE, 4.0)]) as fetch:
            assert detect_splits(user) == []
        fetch.assert_not_called()

    def test_yahoo_error_is_skipped(self, user, asset, account):
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)
        with patch(FETCH, side_effect=RuntimeError("boom")):
            assert detect_splits(user) == []


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSplitAPI:
    def test_create_manual_split(self, client, asset):
        res = client.post(
            "/api/splits/",
            {"asset": str(asset.id), "date": "2026-07-02", "ratio_from": "1", "ratio_to": "4"},
            format="json",
        )
        assert res.status_code == 201, res.data
        assert res.data["status"] == "APPLIED"
        assert res.data["source"] == "MANUAL"
        assert res.data["asset_ticker"] == "CRWD"

    def test_duplicate_is_rejected(self, client, user, asset):
        _split(user, asset)
        res = client.post(
            "/api/splits/",
            {"asset": str(asset.id), "date": "2026-07-02", "ratio_from": "1", "ratio_to": "2"},
            format="json",
        )
        assert res.status_code == 400
        assert "date" in res.data

    def test_identity_ratio_is_rejected(self, client, asset):
        res = client.post(
            "/api/splits/",
            {"asset": str(asset.id), "date": "2026-07-02", "ratio_from": "2", "ratio_to": "2"},
            format="json",
        )
        assert res.status_code == 400

    def test_cannot_use_other_users_asset(self, user2, asset):
        c = APIClient()
        c.force_authenticate(user=user2)
        res = c.post(
            "/api/splits/",
            {"asset": str(asset.id), "date": "2026-07-02", "ratio_from": "1", "ratio_to": "4"},
            format="json",
        )
        assert res.status_code == 400

    def test_list_is_owner_scoped_and_filterable(self, client, user, user2, asset):
        _split(user, asset, status=StockSplit.Status.PENDING)
        other_asset = Asset.objects.create(owner=user2, name="X", ticker="X", currency="USD")
        _split(user2, other_asset)

        res = client.get("/api/splits/")
        results = res.data["results"] if isinstance(res.data, dict) else res.data
        assert len(results) == 1

        res = client.get("/api/splits/?status=APPLIED")
        results = res.data["results"] if isinstance(res.data, dict) else res.data
        assert results == []

    def test_apply_updates_portfolio(self, client, user, asset, account):
        _set_method(user, "FIFO")
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)
        split = _split(user, asset, status=StockSplit.Status.PENDING)

        assert client.get("/api/portfolio/").data["positions"][0]["quantity"].startswith("1")
        res = client.post(f"/api/splits/{split.id}/apply/")
        assert res.status_code == 200
        assert res.data["status"] == "APPLIED"
        # Cache must be invalidated so the portfolio reflects the split right away
        assert Decimal(client.get("/api/portfolio/").data["positions"][0]["quantity"]) == Decimal("4")

    def test_dismiss(self, client, user, asset):
        split = _split(user, asset, status=StockSplit.Status.PENDING)
        res = client.post(f"/api/splits/{split.id}/dismiss/")
        assert res.status_code == 200
        split.refresh_from_db()
        assert split.status == StockSplit.Status.DISMISSED

    def test_cannot_apply_other_users_split(self, user2, user, asset):
        split = _split(user, asset, status=StockSplit.Status.PENDING)
        c = APIClient()
        c.force_authenticate(user=user2)
        assert c.post(f"/api/splits/{split.id}/apply/").status_code == 404

    def test_detect_endpoint(self, client, user, asset, account):
        _tx(user, asset, account, "BUY", datetime.date(2021, 5, 10), 1, 800)
        with patch(FETCH, return_value=[(SPLIT_DATE, 4.0)]):
            res = client.post("/api/splits/detect/")
        assert res.status_code == 200
        assert len(res.data["created"]) == 1
        assert res.data["created"][0]["status"] == "PENDING"


# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_backup_roundtrip_includes_splits(client, user, asset):
    _split(user, asset)
    exported = json.loads(client.get("/api/backup/export/").content)
    assert len(exported["stock_splits"]) == 1

    StockSplit.objects.all().delete()
    file = SimpleUploadedFile("backup.json", json.dumps(exported).encode(), content_type="application/json")
    res = client.post("/api/backup/import/", {"file": file}, format="multipart")
    assert res.status_code == 200, res.data
    assert res.data["counts"]["stock_splits"] == 1
    split = StockSplit.objects.get(owner=user)
    assert (split.ratio_from, split.ratio_to, split.date) == (Decimal("1"), Decimal("4"), SPLIT_DATE)


@pytest.mark.django_db
def test_daily_task_runs_detection_per_user(user, user2):
    from apps.transactions.tasks import detect_splits_all_users_task

    with patch("apps.transactions.services.detect_splits", side_effect=[[], RuntimeError("boom")]) as detect:
        detect_splits_all_users_task()
    # One failing user must not stop the others
    assert detect.call_count == 2
