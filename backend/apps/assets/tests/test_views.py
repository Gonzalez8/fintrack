"""
Tests for assets views: StorageInfoView permissions, delete protection, set-price validation.
"""

import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.assets.models import Account, Asset
from apps.transactions.models import Transaction

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(username="testuser", password="testpass123")


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(username="admin", password="adminpass123")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def admin_client(admin_user):
    c = APIClient()
    c.force_authenticate(user=admin_user)
    return c


@pytest.fixture
def asset(user):
    return Asset.objects.create(
        owner=user,
        name="Test Stock",
        ticker="TST",
        type=Asset.AssetType.STOCK,
        currency="EUR",
        current_price=Decimal("15.00"),
        price_mode=Asset.PriceMode.MANUAL,
    )


@pytest.fixture
def account(user):
    return Account.objects.create(
        owner=user,
        name="Test Broker",
        type=Account.AccountType.INVERSION,
        currency="EUR",
    )


# ---------------------------------------------------------------------------
# StorageInfoView permissions
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStorageInfoPermission:
    def test_admin_can_access(self, admin_client):
        res = admin_client.get("/api/storage-info/")
        assert res.status_code == 200
        assert "total_mb" in res.data

    def test_regular_user_forbidden(self, client):
        res = client.get("/api/storage-info/")
        assert res.status_code == 403

    def test_anonymous_unauthorized(self, db):
        c = APIClient()
        res = c.get("/api/storage-info/")
        assert res.status_code == 401


# ---------------------------------------------------------------------------
# Asset delete protection
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAssetDeleteProtected:
    def test_delete_with_transactions_fails(self, client, user, asset, account):
        Transaction.objects.create(
            owner=user,
            asset=asset,
            account=account,
            type="BUY",
            date=datetime.date(2025, 1, 1),
            quantity=Decimal("10"),
            price=Decimal("10"),
            commission=Decimal("0"),
            tax=Decimal("0"),
        )
        res = client.delete(f"/api/assets/{asset.id}/")
        assert res.status_code == 400
        assert "Cannot delete" in res.data["detail"]

    def test_delete_without_dependencies_succeeds(self, client, asset):
        res = client.delete(f"/api/assets/{asset.id}/")
        assert res.status_code == 204


# ---------------------------------------------------------------------------
# Account delete protection
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAccountDeleteProtected:
    def test_delete_with_transactions_fails(self, client, user, asset, account):
        Transaction.objects.create(
            owner=user,
            asset=asset,
            account=account,
            type="BUY",
            date=datetime.date(2025, 1, 1),
            quantity=Decimal("10"),
            price=Decimal("10"),
            commission=Decimal("0"),
            tax=Decimal("0"),
        )
        res = client.delete(f"/api/accounts/{account.id}/")
        assert res.status_code == 400
        assert "Cannot delete" in res.data["detail"]


# ---------------------------------------------------------------------------
# Set price validation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSetPriceValidation:
    def test_set_price_success(self, client, asset):
        res = client.post(f"/api/assets/{asset.id}/set-price/", {"price": "25.50"}, format="json")
        assert res.status_code == 200
        assert Decimal(res.data["current_price"]) == Decimal("25.50")

    def test_set_price_not_manual_mode(self, client, user):
        auto_asset = Asset.objects.create(
            owner=user,
            name="Auto Stock",
            ticker="AUT",
            type=Asset.AssetType.STOCK,
            currency="EUR",
            price_mode=Asset.PriceMode.AUTO,
        )
        res = client.post(f"/api/assets/{auto_asset.id}/set-price/", {"price": "10"}, format="json")
        assert res.status_code == 400
        assert "manual" in res.data["detail"].lower()

    def test_set_price_missing_price(self, client, asset):
        res = client.post(f"/api/assets/{asset.id}/set-price/", {}, format="json")
        assert res.status_code == 400
        assert "price" in res.data["detail"].lower()

    def test_set_price_invalid_value(self, client, asset):
        res = client.post(f"/api/assets/{asset.id}/set-price/", {"price": "abc"}, format="json")
        assert res.status_code == 400
        assert "Invalid" in res.data["detail"]
