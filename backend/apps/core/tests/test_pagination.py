"""StandardPagination: list endpoints honour ?page_size= up to a cap."""

import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.assets.models import Account, Asset
from apps.transactions.models import Transaction

User = get_user_model()


@pytest.fixture
def client_with_transactions(db):
    user = User.objects.create_user(username="pager", password="testpass123")
    account = Account.objects.create(owner=user, name="Broker", type=Account.AccountType.INVERSION, currency="EUR")
    asset = Asset.objects.create(owner=user, name="Stock", ticker="STK", currency="EUR")
    Transaction.objects.bulk_create(
        Transaction(
            owner=user,
            asset=asset,
            account=account,
            type="BUY",
            date=datetime.date(2024, 1, 1) + datetime.timedelta(days=i),
            quantity=Decimal("1"),
            price=Decimal("10"),
        )
        for i in range(60)
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
class TestStandardPagination:
    def test_default_page_size_is_50(self, client_with_transactions):
        res = client_with_transactions.get("/api/transactions/")
        assert res.data["count"] == 60
        assert len(res.data["results"]) == 50

    def test_page_size_param_is_honoured(self, client_with_transactions):
        res = client_with_transactions.get("/api/transactions/", {"page_size": 25})
        assert len(res.data["results"]) == 25
        # 60 rows at 25 per page → page 3 holds the last 10, page 4 does not exist
        assert (
            len(client_with_transactions.get("/api/transactions/", {"page_size": 25, "page": 3}).data["results"]) == 10
        )
        assert client_with_transactions.get("/api/transactions/", {"page_size": 25, "page": 4}).status_code == 404

    def test_large_page_size_returns_everything(self, client_with_transactions):
        res = client_with_transactions.get("/api/transactions/", {"page_size": 1000})
        assert len(res.data["results"]) == 60
        assert res.data["next"] is None

    def test_page_size_is_capped(self, client_with_transactions):
        res = client_with_transactions.get("/api/transactions/", {"page_size": 100000})
        assert len(res.data["results"]) == 60  # capped at 1000, all fit
