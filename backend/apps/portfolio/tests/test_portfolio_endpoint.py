from decimal import Decimal
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from apps.assets.models import Asset, Account, Settings
from apps.transactions.models import Transaction


@pytest.mark.django_db
class TestPortfolioEndpoint:
    def test_portfolio_returns_positions(self):
        user = User.objects.create_user(username="test", password="test123")
        Settings.load(user)
        client = APIClient()
        client.force_authenticate(user=user)

        account = Account.objects.create(name="Broker", type="OPERATIVA", owner=user)
        asset = Asset.objects.create(
            name="Apple", ticker="AAPL", current_price=Decimal("150"), owner=user
        )
        Transaction.objects.create(
            date="2024-01-01", type="BUY", asset=asset, account=account,
            quantity=Decimal("10"), price=Decimal("100"), commission=Decimal("0"),
            owner=user,
        )

        response = client.get("/api/portfolio/")
        assert response.status_code == 200
        data = response.json()
        assert "positions" in data
        assert "total_market_value" in data
        assert len(data["positions"]) == 1
        assert data["positions"][0]["asset_name"] == "Apple"
