"""
Multi-tenancy isolation tests.

Every model carries an ``owner`` FK and all ViewSets use
``OwnedByUserMixin``, which filters querysets to ``request.user`` and
injects the owner on create.  Cross-user access must return **404**
(not 403) so that the very existence of another user's data is hidden.
"""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.assets.models import Account, Asset
from apps.transactions.models import Dividend, Interest, Transaction

User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def user1(db):
    return User.objects.create_user(username="alice", password="pass1234")


@pytest.fixture
def user2(db):
    return User.objects.create_user(username="bob", password="pass1234")


@pytest.fixture
def client1(user1):
    c = APIClient()
    c.force_authenticate(user=user1)
    return c


@pytest.fixture
def client2(user2):
    c = APIClient()
    c.force_authenticate(user=user2)
    return c


@pytest.fixture
def asset1(user1):
    return Asset.objects.create(
        name="ACME Corp",
        ticker="ACME",
        type="STOCK",
        currency="EUR",
        current_price=Decimal("50.00"),
        owner=user1,
    )


@pytest.fixture
def account1(user1):
    return Account.objects.create(
        name="Alice Broker",
        type="OPERATIVA",
        currency="EUR",
        owner=user1,
    )


@pytest.fixture
def account2(user2):
    return Account.objects.create(
        name="Bob Broker",
        type="OPERATIVA",
        currency="EUR",
        owner=user2,
    )


# ---------------------------------------------------------------------------
# Asset isolation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAssetIsolation:
    def test_user_sees_only_own_assets(self, client1, client2, asset1):
        """User2 must not see User1's asset in the list."""
        resp = client2.get("/api/assets/")
        assert resp.status_code == status.HTTP_200_OK
        results = resp.data if isinstance(resp.data, list) else resp.data.get("results", resp.data)
        assert len(results) == 0

    def test_user_cannot_access_other_asset(self, client2, asset1):
        """Direct GET on another user's asset returns 404."""
        resp = client2.get(f"/api/assets/{asset1.id}/")
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_create_asset_sets_owner(self, client1, user1):
        """Creating an asset via API sets owner to request.user."""
        resp = client1.post(
            "/api/assets/",
            {"name": "NewAsset", "type": "ETF", "currency": "USD"},
            format="json",
        )
        assert resp.status_code == status.HTTP_201_CREATED
        asset = Asset.objects.get(pk=resp.data["id"])
        assert asset.owner == user1

    def test_user_cannot_update_other_asset(self, client2, asset1):
        """PUT on another user's asset returns 404."""
        resp = client2.put(
            f"/api/assets/{asset1.id}/",
            {"name": "Hacked", "type": "STOCK", "currency": "EUR"},
            format="json",
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_user_cannot_delete_other_asset(self, client2, asset1):
        """DELETE on another user's asset returns 404."""
        resp = client2.delete(f"/api/assets/{asset1.id}/")
        assert resp.status_code == status.HTTP_404_NOT_FOUND
        # Asset must still exist.
        assert Asset.objects.filter(pk=asset1.id).exists()


# ---------------------------------------------------------------------------
# Account isolation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAccountIsolation:
    def test_user_sees_only_own_accounts(self, client1, client2, account1):
        """User2 must not see User1's account."""
        resp = client2.get("/api/accounts/")
        assert resp.status_code == status.HTTP_200_OK
        results = resp.data if isinstance(resp.data, list) else resp.data.get("results", resp.data)
        assert len(results) == 0

    def test_user_cannot_access_other_account(self, client2, account1):
        resp = client2.get(f"/api/accounts/{account1.id}/")
        assert resp.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Transaction isolation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTransactionIsolation:
    def test_user_sees_only_own_transactions(self, client1, client2, asset1, account1):
        Transaction.objects.create(
            date="2025-01-15",
            type="BUY",
            asset=asset1,
            account=account1,
            quantity=Decimal("10"),
            price=Decimal("100.00"),
            owner=asset1.owner,
        )
        resp = client2.get("/api/transactions/")
        assert resp.status_code == status.HTTP_200_OK
        results = resp.data if isinstance(resp.data, list) else resp.data.get("results", resp.data)
        assert len(results) == 0


# ---------------------------------------------------------------------------
# Dividend isolation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestDividendIsolation:
    def test_user_sees_only_own_dividends(self, client1, client2, asset1):
        Dividend.objects.create(
            date="2025-06-01",
            asset=asset1,
            gross=Decimal("50.00"),
            tax=Decimal("10.00"),
            net=Decimal("40.00"),
            owner=asset1.owner,
        )
        resp = client2.get("/api/dividends/")
        assert resp.status_code == status.HTTP_200_OK
        results = resp.data if isinstance(resp.data, list) else resp.data.get("results", resp.data)
        assert len(results) == 0


# ---------------------------------------------------------------------------
# Interest isolation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestInterestIsolation:
    def test_user_sees_only_own_interests(self, client1, client2, account1):
        Interest.objects.create(
            date="2025-03-01",
            account=account1,
            gross=Decimal("20.00"),
            net=Decimal("16.00"),
            owner=account1.owner,
        )
        resp = client2.get("/api/interests/")
        assert resp.status_code == status.HTTP_200_OK
        results = resp.data if isinstance(resp.data, list) else resp.data.get("results", resp.data)
        assert len(results) == 0


# ---------------------------------------------------------------------------
# Portfolio isolation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPortfolioIsolation:
    def test_portfolio_isolation(self, client1, client2, asset1, account1):
        """User1 has an open position; User2's portfolio must be empty."""
        Transaction.objects.create(
            date="2025-01-15",
            type="BUY",
            asset=asset1,
            account=account1,
            quantity=Decimal("10"),
            price=Decimal("50.00"),
            owner=asset1.owner,
        )
        resp = client2.get("/api/portfolio/")
        assert resp.status_code == status.HTTP_200_OK
        # The portfolio response should contain no positions for user2.
        positions = resp.data.get("positions", resp.data)
        if isinstance(positions, list):
            assert len(positions) == 0
        # Also confirm user1 *does* see the position.
        resp1 = client1.get("/api/portfolio/")
        assert resp1.status_code == status.HTTP_200_OK
        positions1 = resp1.data.get("positions", resp1.data)
        if isinstance(positions1, list):
            assert len(positions1) > 0
