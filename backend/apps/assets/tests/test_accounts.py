"""
Tests for Account and AccountSnapshot CRUD, bulk snapshots, and multi-tenancy.
"""

import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.assets.models import Account, AccountSnapshot

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
    return Account.objects.create(
        owner=user,
        name="Main Checking",
        type=Account.AccountType.OPERATIVA,
        currency="EUR",
    )


@pytest.fixture
def other_account(other_user):
    return Account.objects.create(
        owner=other_user,
        name="Other Account",
        type=Account.AccountType.AHORRO,
        currency="EUR",
    )


# ── Account CRUD ──────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestAccountCRUD:
    def test_create_account(self, client):
        resp = client.post(
            "/api/accounts/",
            {"name": "Savings Account", "type": "AHORRO", "currency": "EUR"},
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["name"] == "Savings Account"
        assert resp.data["type"] == "AHORRO"
        assert resp.data["currency"] == "EUR"
        assert Decimal(resp.data["balance"]) == Decimal("0")

    def test_list_accounts(self, client, account):
        resp = client.get("/api/accounts/")
        assert resp.status_code == 200
        results = resp.data["results"] if "results" in resp.data else resp.data
        assert len(results) >= 1
        names = [a["name"] for a in results]
        assert "Main Checking" in names

    def test_update_account(self, client, account):
        resp = client.patch(
            f"/api/accounts/{account.id}/",
            {"name": "Renamed Account"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["name"] == "Renamed Account"

    def test_delete_account_no_deps(self, client, account):
        resp = client.delete(f"/api/accounts/{account.id}/")
        assert resp.status_code == 204
        assert not Account.objects.filter(id=account.id).exists()

    def test_multi_tenancy_isolation(self, client, other_account):
        # User should not see other_user's account
        resp = client.get("/api/accounts/")
        assert resp.status_code == 200
        results = resp.data["results"] if "results" in resp.data else resp.data
        ids = [a["id"] for a in results]
        assert str(other_account.id) not in ids

    def test_multi_tenancy_cannot_access_other(self, client, other_account):
        resp = client.get(f"/api/accounts/{other_account.id}/")
        assert resp.status_code == 404


# ── AccountSnapshot CRUD ─────────────────────────────────────────────────────


@pytest.mark.django_db
class TestAccountSnapshotCRUD:
    def test_create_snapshot(self, client, account):
        resp = client.post(
            "/api/account-snapshots/",
            {"account": str(account.id), "date": "2025-01-15", "balance": "5000.00"},
            format="json",
        )
        assert resp.status_code == 201
        assert Decimal(resp.data["balance"]) == Decimal("5000.00")
        assert resp.data["date"] == "2025-01-15"

    def test_list_snapshots(self, client, user, account):
        AccountSnapshot.objects.create(
            owner=user, account=account, date=datetime.date(2025, 1, 15), balance=Decimal("5000.00")
        )
        resp = client.get("/api/account-snapshots/")
        assert resp.status_code == 200
        results = resp.data["results"] if "results" in resp.data else resp.data
        assert len(results) >= 1

    def test_snapshot_syncs_account_balance(self, client, account):
        client.post(
            "/api/account-snapshots/",
            {"account": str(account.id), "date": "2025-01-15", "balance": "7500.00"},
            format="json",
        )
        account.refresh_from_db()
        assert account.balance == Decimal("7500.00")

    def test_snapshot_different_dates(self, client, user, account):
        """Can create snapshots for different dates on the same account."""
        resp1 = client.post(
            "/api/account-snapshots/",
            {"account": str(account.id), "date": "2025-01-15", "balance": "5000.00"},
            format="json",
        )
        assert resp1.status_code == 201
        resp2 = client.post(
            "/api/account-snapshots/",
            {"account": str(account.id), "date": "2025-01-16", "balance": "6000.00"},
            format="json",
        )
        assert resp2.status_code == 201
        count = AccountSnapshot.objects.filter(account=account).count()
        assert count == 2

    def test_multi_tenancy_isolation(self, client, other_user, other_account):
        snapshot = AccountSnapshot.objects.create(
            owner=other_user,
            account=other_account,
            date=datetime.date(2025, 1, 15),
            balance=Decimal("9999.00"),
        )
        resp = client.get("/api/account-snapshots/")
        results = resp.data["results"] if "results" in resp.data else resp.data
        ids = [s["id"] for s in results]
        assert str(snapshot.id) not in ids


# ── Bulk Snapshot ─────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestBulkSnapshot:
    def test_bulk_create(self, client, user):
        acct1 = Account.objects.create(
            owner=user, name="Acct1", type="OPERATIVA", currency="EUR"
        )
        acct2 = Account.objects.create(
            owner=user, name="Acct2", type="AHORRO", currency="EUR"
        )
        resp = client.post(
            "/api/accounts/bulk-snapshot/",
            {
                "date": "2025-01-15",
                "snapshots": [
                    {"account": str(acct1.id), "balance": "5000.00"},
                    {"account": str(acct2.id), "balance": "3000.00"},
                ],
            },
            format="json",
        )
        assert resp.status_code == 201
        assert len(resp.data) == 2
        acct1.refresh_from_db()
        acct2.refresh_from_db()
        assert acct1.balance == Decimal("5000.00")
        assert acct2.balance == Decimal("3000.00")

    def test_bulk_validates_account_ownership(self, client, other_account):
        resp = client.post(
            "/api/accounts/bulk-snapshot/",
            {
                "date": "2025-01-15",
                "snapshots": [
                    {"account": str(other_account.id), "balance": "1000.00"},
                ],
            },
            format="json",
        )
        assert resp.status_code == 400
        assert "not found" in resp.data["detail"].lower()
