"""
Comprehensive tests for the transactions app ViewSets:
Transaction, Dividend, Interest CRUD, filters, and validation.
"""

import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.assets.models import Account, Asset
from apps.transactions.models import Transaction, Dividend, Interest

User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def user(db):
    return User.objects.create_user(username="testuser", password="testpass123")


@pytest.fixture
def user2(db):
    return User.objects.create_user(username="otheruser", password="otherpass123")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def client2(user2):
    c = APIClient()
    c.force_authenticate(user=user2)
    return c


@pytest.fixture
def asset(user):
    return Asset.objects.create(
        owner=user,
        name="Test Stock",
        ticker="TST",
        type=Asset.AssetType.STOCK,
        currency="EUR",
    )


@pytest.fixture
def asset2(user):
    """A second asset owned by user, for filter tests."""
    return Asset.objects.create(
        owner=user,
        name="Another Fund",
        ticker="AFN",
        type=Asset.AssetType.FUND,
        currency="EUR",
    )


@pytest.fixture
def account(user):
    return Account.objects.create(
        owner=user,
        name="Test Broker",
        type=Account.AccountType.INVERSION,
        currency="EUR",
    )


@pytest.fixture
def account2(user):
    """A second account owned by user, for filter tests."""
    return Account.objects.create(
        owner=user,
        name="Savings Account",
        type=Account.AccountType.AHORRO,
        currency="EUR",
    )


@pytest.fixture
def other_asset(user2):
    """Asset owned by user2."""
    return Asset.objects.create(
        owner=user2,
        name="Other User Stock",
        ticker="OTH",
        type=Asset.AssetType.STOCK,
        currency="EUR",
    )


@pytest.fixture
def other_account(user2):
    """Account owned by user2."""
    return Account.objects.create(
        owner=user2,
        name="Other Broker",
        type=Account.AccountType.INVERSION,
        currency="EUR",
    )


@pytest.fixture
def transaction(user, asset, account):
    return Transaction.objects.create(
        owner=user,
        date=datetime.date(2025, 6, 15),
        type="BUY",
        asset=asset,
        account=account,
        quantity=Decimal("10.000000"),
        price=Decimal("25.500000"),
        commission=Decimal("4.99"),
        tax=Decimal("0.00"),
        notes="Initial purchase",
    )


@pytest.fixture
def dividend(user, asset):
    return Dividend.objects.create(
        owner=user,
        date=datetime.date(2025, 9, 1),
        asset=asset,
        shares=Decimal("10.000000"),
        gross=Decimal("100.00"),
        tax=Decimal("15.00"),
        net=Decimal("85.00"),
    )


@pytest.fixture
def interest(user, account):
    return Interest.objects.create(
        owner=user,
        date_start=datetime.date(2025, 1, 1),
        date_end=datetime.date(2025, 3, 31),
        account=account,
        gross=Decimal("50.00"),
        net=Decimal("40.00"),
        balance=Decimal("10000.00"),
    )


# ===========================================================================
# Transaction CRUD
# ===========================================================================


@pytest.mark.django_db
class TestTransactionCRUD:
    def test_create_transaction(self, client, asset, account):
        payload = {
            "date": "2025-07-01",
            "type": "BUY",
            "asset": str(asset.id),
            "account": str(account.id),
            "quantity": "5.000000",
            "price": "30.000000",
            "commission": "2.50",
            "tax": "0.00",
            "notes": "Test buy",
        }
        res = client.post("/api/transactions/", payload, format="json")
        assert res.status_code == 201
        assert res.data["type"] == "BUY"
        assert Decimal(res.data["quantity"]) == Decimal("5.000000")
        assert Decimal(res.data["price"]) == Decimal("30.000000")
        assert res.data["asset_name"] == "Test Stock"
        assert res.data["account_name"] == "Test Broker"

    def test_list_transactions(self, client, transaction):
        res = client.get("/api/transactions/")
        assert res.status_code == 200
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 1
        assert results[0]["id"] == str(transaction.id)

    def test_retrieve_transaction(self, client, transaction):
        res = client.get(f"/api/transactions/{transaction.id}/")
        assert res.status_code == 200
        assert res.data["id"] == str(transaction.id)
        assert res.data["notes"] == "Initial purchase"

    def test_update_transaction(self, client, transaction):
        payload = {
            "date": "2025-06-15",
            "type": "BUY",
            "asset": str(transaction.asset_id),
            "account": str(transaction.account_id),
            "quantity": "20.000000",
            "price": "26.000000",
            "commission": "4.99",
            "tax": "0.00",
            "notes": "Updated purchase",
        }
        res = client.put(f"/api/transactions/{transaction.id}/", payload, format="json")
        assert res.status_code == 200
        assert Decimal(res.data["quantity"]) == Decimal("20.000000")
        assert res.data["notes"] == "Updated purchase"

    def test_delete_transaction(self, client, transaction):
        res = client.delete(f"/api/transactions/{transaction.id}/")
        assert res.status_code == 204
        assert Transaction.objects.filter(id=transaction.id).count() == 0

    def test_multi_tenancy_isolation(self, client, client2, user2, transaction, other_asset, other_account):
        # user2 cannot see user1's transactions
        res = client2.get("/api/transactions/")
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 0

        # user2 cannot retrieve user1's transaction
        res = client2.get(f"/api/transactions/{transaction.id}/")
        assert res.status_code == 404

    def test_create_sell_transaction(self, client, asset, account):
        payload = {
            "date": "2025-08-01",
            "type": "SELL",
            "asset": str(asset.id),
            "account": str(account.id),
            "quantity": "3.000000",
            "price": "35.000000",
            "commission": "1.50",
            "tax": "2.00",
        }
        res = client.post("/api/transactions/", payload, format="json")
        assert res.status_code == 201
        assert res.data["type"] == "SELL"
        assert Decimal(res.data["tax"]) == Decimal("2.00")

    def test_create_gift_transaction(self, client, asset, account):
        payload = {
            "date": "2025-08-15",
            "type": "GIFT",
            "asset": str(asset.id),
            "account": str(account.id),
            "quantity": "1.000000",
            "price": "0.000000",
            "commission": "0.00",
            "tax": "0.00",
        }
        res = client.post("/api/transactions/", payload, format="json")
        assert res.status_code == 201
        assert res.data["type"] == "GIFT"


# ===========================================================================
# Transaction Filters
# ===========================================================================


@pytest.mark.django_db
class TestTransactionFilters:
    def _create_transactions(self, user, asset, asset2, account, account2):
        """Helper to create a varied set of transactions for filter tests."""
        Transaction.objects.create(
            owner=user, date=datetime.date(2025, 3, 10), type="BUY",
            asset=asset, account=account,
            quantity=Decimal("5"), price=Decimal("10"),
        )
        Transaction.objects.create(
            owner=user, date=datetime.date(2025, 6, 20), type="SELL",
            asset=asset, account=account,
            quantity=Decimal("2"), price=Decimal("15"),
        )
        Transaction.objects.create(
            owner=user, date=datetime.date(2025, 9, 5), type="BUY",
            asset=asset2, account=account2,
            quantity=Decimal("8"), price=Decimal("50"),
        )

    def test_filter_by_date_range(self, client, user, asset, asset2, account, account2):
        self._create_transactions(user, asset, asset2, account, account2)
        res = client.get("/api/transactions/", {"from_date": "2025-04-01", "to_date": "2025-08-01"})
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 1
        assert results[0]["type"] == "SELL"

    def test_filter_by_asset_id(self, client, user, asset, asset2, account, account2):
        self._create_transactions(user, asset, asset2, account, account2)
        res = client.get("/api/transactions/", {"asset_id": str(asset2.id)})
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 1
        assert Decimal(results[0]["quantity"]) == Decimal("8")

    def test_filter_by_account_id(self, client, user, asset, asset2, account, account2):
        self._create_transactions(user, asset, asset2, account, account2)
        res = client.get("/api/transactions/", {"account_id": str(account.id)})
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 2

    def test_filter_by_type(self, client, user, asset, asset2, account, account2):
        self._create_transactions(user, asset, asset2, account, account2)
        res = client.get("/api/transactions/", {"type": "BUY"})
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 2

    def test_filter_search(self, client, user, asset, asset2, account, account2):
        self._create_transactions(user, asset, asset2, account, account2)
        # Search by asset name
        res = client.get("/api/transactions/", {"search": "Another"})
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 1
        assert results[0]["asset_name"] == "Another Fund"

        # Search by ticker
        res = client.get("/api/transactions/", {"search": "TST"})
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 2


# ===========================================================================
# Transaction Validation
# ===========================================================================


@pytest.mark.django_db
class TestTransactionValidation:
    def test_cannot_use_other_users_asset(self, client, account, other_asset):
        payload = {
            "date": "2025-07-01",
            "type": "BUY",
            "asset": str(other_asset.id),
            "account": str(account.id),
            "quantity": "1.000000",
            "price": "10.000000",
        }
        res = client.post("/api/transactions/", payload, format="json")
        assert res.status_code == 400
        assert "asset" in res.data

    def test_cannot_use_other_users_account(self, client, asset, other_account):
        payload = {
            "date": "2025-07-01",
            "type": "BUY",
            "asset": str(asset.id),
            "account": str(other_account.id),
            "quantity": "1.000000",
            "price": "10.000000",
        }
        res = client.post("/api/transactions/", payload, format="json")
        assert res.status_code == 400
        assert "account" in res.data


# ===========================================================================
# Dividend CRUD
# ===========================================================================


@pytest.mark.django_db
class TestDividendCRUD:
    def test_create_dividend(self, client, asset):
        payload = {
            "date": "2025-12-01",
            "asset": str(asset.id),
            "shares": "20.000000",
            "gross": "200.00",
            "tax": "30.00",
            "net": "170.00",
        }
        res = client.post("/api/dividends/", payload, format="json")
        assert res.status_code == 201
        assert res.data["asset_name"] == "Test Stock"
        assert Decimal(res.data["gross"]) == Decimal("200.00")
        assert Decimal(res.data["net"]) == Decimal("170.00")

    def test_list_dividends(self, client, dividend):
        res = client.get("/api/dividends/")
        assert res.status_code == 200
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 1

    def test_update_dividend(self, client, dividend):
        payload = {
            "date": "2025-09-01",
            "asset": str(dividend.asset_id),
            "shares": "10.000000",
            "gross": "120.00",
            "tax": "18.00",
            "net": "102.00",
        }
        res = client.put(f"/api/dividends/{dividend.id}/", payload, format="json")
        assert res.status_code == 200
        assert Decimal(res.data["gross"]) == Decimal("120.00")
        assert Decimal(res.data["net"]) == Decimal("102.00")

    def test_delete_dividend(self, client, dividend):
        res = client.delete(f"/api/dividends/{dividend.id}/")
        assert res.status_code == 204
        assert Dividend.objects.filter(id=dividend.id).count() == 0

    def test_withholding_rate_computed(self, client, dividend):
        res = client.get(f"/api/dividends/{dividend.id}/")
        assert res.status_code == 200
        # gross=100, tax=15 -> 15/100*100 = 15.00
        assert res.data["withholding_rate"] == "15.00"

    def test_withholding_rate_zero_gross(self, client, user, asset):
        div = Dividend.objects.create(
            owner=user,
            date=datetime.date(2025, 10, 1),
            asset=asset,
            gross=Decimal("0.00"),
            tax=Decimal("0.00"),
            net=Decimal("0.00"),
        )
        res = client.get(f"/api/dividends/{div.id}/")
        assert res.status_code == 200
        assert res.data["withholding_rate"] is None

    def test_multi_tenancy_isolation(self, client, client2, dividend):
        # user2 cannot see user1's dividends
        res = client2.get("/api/dividends/")
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 0

        res = client2.get(f"/api/dividends/{dividend.id}/")
        assert res.status_code == 404


# ===========================================================================
# Dividend Filters
# ===========================================================================


@pytest.mark.django_db
class TestDividendFilters:
    def test_filter_by_year(self, client, user, asset):
        Dividend.objects.create(
            owner=user, date=datetime.date(2024, 6, 1),
            asset=asset, gross=Decimal("50"), tax=Decimal("5"), net=Decimal("45"),
        )
        Dividend.objects.create(
            owner=user, date=datetime.date(2025, 6, 1),
            asset=asset, gross=Decimal("60"), tax=Decimal("6"), net=Decimal("54"),
        )
        res = client.get("/api/dividends/", {"year": 2025})
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 1
        assert Decimal(results[0]["gross"]) == Decimal("60.00")

    def test_filter_by_asset_id(self, client, user, asset, asset2):
        Dividend.objects.create(
            owner=user, date=datetime.date(2025, 3, 1),
            asset=asset, gross=Decimal("50"), tax=Decimal("5"), net=Decimal("45"),
        )
        Dividend.objects.create(
            owner=user, date=datetime.date(2025, 3, 15),
            asset=asset2, gross=Decimal("30"), tax=Decimal("3"), net=Decimal("27"),
        )
        res = client.get("/api/dividends/", {"asset_id": str(asset2.id)})
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 1
        assert results[0]["asset_name"] == "Another Fund"


# ===========================================================================
# Dividend Validation
# ===========================================================================


@pytest.mark.django_db
class TestDividendValidation:
    def test_cannot_use_other_users_asset(self, client, other_asset):
        payload = {
            "date": "2025-07-01",
            "asset": str(other_asset.id),
            "gross": "100.00",
            "tax": "10.00",
            "net": "90.00",
        }
        res = client.post("/api/dividends/", payload, format="json")
        assert res.status_code == 400
        assert "asset" in res.data


# ===========================================================================
# Interest CRUD
# ===========================================================================


@pytest.mark.django_db
class TestInterestCRUD:
    def test_create_interest(self, client, account):
        payload = {
            "date_start": "2025-04-01",
            "date_end": "2025-06-30",
            "account": str(account.id),
            "gross": "75.00",
            "net": "60.00",
            "balance": "15000.00",
        }
        res = client.post("/api/interests/", payload, format="json")
        assert res.status_code == 201
        assert res.data["account_name"] == "Test Broker"
        assert Decimal(res.data["gross"]) == Decimal("75.00")
        assert res.data["days"] == 90

    def test_list_interests(self, client, interest):
        res = client.get("/api/interests/")
        assert res.status_code == 200
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 1

    def test_update_interest(self, client, interest):
        payload = {
            "date_start": "2025-01-01",
            "date_end": "2025-06-30",
            "account": str(interest.account_id),
            "gross": "100.00",
            "net": "80.00",
            "balance": "12000.00",
        }
        res = client.put(f"/api/interests/{interest.id}/", payload, format="json")
        assert res.status_code == 200
        assert Decimal(res.data["gross"]) == Decimal("100.00")
        assert res.data["days"] == 180

    def test_delete_interest(self, client, interest):
        res = client.delete(f"/api/interests/{interest.id}/")
        assert res.status_code == 204
        assert Interest.objects.filter(id=interest.id).count() == 0

    def test_days_computed(self, client, interest):
        res = client.get(f"/api/interests/{interest.id}/")
        assert res.status_code == 200
        # 2025-01-01 to 2025-03-31 = 89 days
        assert res.data["days"] == 89

    def test_multi_tenancy_isolation(self, client, client2, interest):
        # user2 cannot see user1's interests
        res = client2.get("/api/interests/")
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 0

        res = client2.get(f"/api/interests/{interest.id}/")
        assert res.status_code == 404


# ===========================================================================
# Interest Filters
# ===========================================================================


@pytest.mark.django_db
class TestInterestFilters:
    def test_filter_by_year(self, client, user, account):
        Interest.objects.create(
            owner=user, date_start=datetime.date(2024, 10, 1),
            date_end=datetime.date(2024, 12, 31),
            account=account, gross=Decimal("40"), net=Decimal("32"),
        )
        Interest.objects.create(
            owner=user, date_start=datetime.date(2025, 1, 1),
            date_end=datetime.date(2025, 3, 31),
            account=account, gross=Decimal("50"), net=Decimal("40"),
        )
        res = client.get("/api/interests/", {"year": 2024})
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 1
        assert Decimal(results[0]["gross"]) == Decimal("40.00")

    def test_filter_by_account_id(self, client, user, account, account2):
        Interest.objects.create(
            owner=user, date_start=datetime.date(2025, 1, 1),
            date_end=datetime.date(2025, 3, 31),
            account=account, gross=Decimal("50"), net=Decimal("40"),
        )
        Interest.objects.create(
            owner=user, date_start=datetime.date(2025, 1, 1),
            date_end=datetime.date(2025, 3, 31),
            account=account2, gross=Decimal("30"), net=Decimal("24"),
        )
        res = client.get("/api/interests/", {"account_id": str(account2.id)})
        results = res.data["results"] if "results" in res.data else res.data
        assert len(results) == 1
        assert results[0]["account_name"] == "Savings Account"


# ===========================================================================
# Interest Validation
# ===========================================================================


@pytest.mark.django_db
class TestInterestValidation:
    def test_date_end_before_date_start_fails(self, client, account):
        payload = {
            "date_start": "2025-06-30",
            "date_end": "2025-01-01",
            "account": str(account.id),
            "gross": "50.00",
            "net": "40.00",
        }
        res = client.post("/api/interests/", payload, format="json")
        assert res.status_code == 400
        assert "date_end" in res.data

    def test_cannot_use_other_users_account(self, client, other_account):
        payload = {
            "date_start": "2025-01-01",
            "date_end": "2025-03-31",
            "account": str(other_account.id),
            "gross": "50.00",
            "net": "40.00",
        }
        res = client.post("/api/interests/", payload, format="json")
        assert res.status_code == 400
        assert "account" in res.data
