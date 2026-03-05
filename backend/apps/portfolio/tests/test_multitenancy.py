from decimal import Decimal
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from apps.assets.models import Asset, Account, Settings
from apps.transactions.models import Transaction


@pytest.fixture
def user_a(db):
    user = User.objects.create_user(username="user_a", password="pass_a")
    Settings.load(user)
    return user


@pytest.fixture
def user_b(db):
    user = User.objects.create_user(username="user_b", password="pass_b")
    Settings.load(user)
    return user


@pytest.fixture
def client_a(user_a):
    client = APIClient()
    client.force_authenticate(user=user_a)
    return client


@pytest.fixture
def client_b(user_b):
    client = APIClient()
    client.force_authenticate(user=user_b)
    return client


@pytest.fixture
def asset_a(user_a):
    account = Account.objects.create(name="Broker A", type="OPERATIVA", owner=user_a)
    asset = Asset.objects.create(
        name="Apple", ticker="AAPL", current_price=Decimal("150"), owner=user_a
    )
    Transaction.objects.create(
        date="2024-01-01", type="BUY", asset=asset, account=account,
        quantity=Decimal("10"), price=Decimal("100"), commission=Decimal("0"),
        owner=user_a,
    )
    return asset


@pytest.fixture
def asset_b(user_b):
    account = Account.objects.create(name="Broker B", type="OPERATIVA", owner=user_b)
    asset = Asset.objects.create(
        name="Google", ticker="GOOGL", current_price=Decimal("200"), owner=user_b
    )
    Transaction.objects.create(
        date="2024-01-01", type="BUY", asset=asset, account=account,
        quantity=Decimal("5"), price=Decimal("180"), commission=Decimal("0"),
        owner=user_b,
    )
    return asset


@pytest.mark.django_db
class TestAssetIsolation:
    def test_user_sees_only_own_assets(self, client_a, asset_a, asset_b):
        response = client_a.get("/api/assets/")
        assert response.status_code == 200
        tickers = [a["ticker"] for a in response.json()["results"]]
        assert "AAPL" in tickers
        assert "GOOGL" not in tickers

    def test_user_cannot_get_other_user_asset(self, client_b, asset_a):
        response = client_b.get(f"/api/assets/{asset_a.pk}/")
        assert response.status_code == 404

    def test_user_cannot_patch_other_user_asset(self, client_b, asset_a):
        response = client_b.patch(f"/api/assets/{asset_a.pk}/", {"name": "Hacked"})
        assert response.status_code == 404

    def test_user_cannot_delete_other_user_asset(self, client_b, asset_a):
        response = client_b.delete(f"/api/assets/{asset_a.pk}/")
        assert response.status_code == 404


@pytest.mark.django_db
class TestPortfolioIsolation:
    def test_portfolio_only_shows_own_positions(self, client_a, asset_a, asset_b):
        response = client_a.get("/api/portfolio/")
        assert response.status_code == 200
        data = response.json()
        asset_names = [p["asset_name"] for p in data["positions"]]
        assert "Apple" in asset_names
        assert "Google" not in asset_names

    def test_portfolios_are_independent(self, client_a, client_b, asset_a, asset_b):
        resp_a = client_a.get("/api/portfolio/")
        resp_b = client_b.get("/api/portfolio/")
        assert len(resp_a.json()["positions"]) == 1
        assert len(resp_b.json()["positions"]) == 1
        assert resp_a.json()["positions"][0]["asset_name"] == "Apple"
        assert resp_b.json()["positions"][0]["asset_name"] == "Google"


@pytest.mark.django_db
class TestAccountIsolation:
    def test_user_sees_only_own_accounts(self, user_a, user_b, client_a):
        Account.objects.create(name="A Account", type="OPERATIVA", owner=user_a)
        Account.objects.create(name="B Account", type="OPERATIVA", owner=user_b)
        response = client_a.get("/api/accounts/")
        assert response.status_code == 200
        names = [a["name"] for a in response.json()["results"]]
        assert "A Account" in names
        assert "B Account" not in names

    def test_user_cannot_access_other_user_account(self, user_b, client_b, user_a):
        account_a = Account.objects.create(name="Private Account", type="OPERATIVA", owner=user_a)
        response = client_b.get(f"/api/accounts/{account_a.pk}/")
        assert response.status_code == 404
