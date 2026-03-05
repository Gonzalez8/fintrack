from decimal import Decimal
import pytest
from django.contrib.auth.models import User
from apps.assets.models import Asset, Account, Settings
from apps.transactions.models import Transaction
from apps.portfolio.services import calculate_portfolio


@pytest.fixture
def user(db):
    return User.objects.create_user(username="fifo_user", password="pass")


@pytest.fixture
def setup_data(user):
    Settings.load(user)
    account = Account.objects.create(name="Test Broker", type="OPERATIVA", owner=user)
    asset = Asset.objects.create(
        name="Test Stock", ticker="TST", current_price=Decimal("150.00"), owner=user
    )
    return account, asset


@pytest.mark.django_db
class TestFIFO:
    def test_single_buy(self, user, setup_data):
        account, asset = setup_data
        Transaction.objects.create(
            date="2024-01-01", type="BUY", asset=asset, account=account,
            quantity=Decimal("10"), price=Decimal("100"), commission=Decimal("1"),
            owner=user,
        )
        result = calculate_portfolio(user)
        pos = result["positions"][0]
        assert pos["quantity"] == "10.000000"
        assert pos["cost_total"] == "1001.00"
        assert pos["avg_cost"] == "100.10"

    def test_two_buys_cost_accumulates(self, user, setup_data):
        account, asset = setup_data
        Transaction.objects.create(
            date="2024-01-01", type="BUY", asset=asset, account=account,
            quantity=Decimal("10"), price=Decimal("100"), commission=Decimal("0"),
            owner=user,
        )
        Transaction.objects.create(
            date="2024-02-01", type="BUY", asset=asset, account=account,
            quantity=Decimal("10"), price=Decimal("200"), commission=Decimal("0"),
            owner=user,
        )
        result = calculate_portfolio(user)
        pos = result["positions"][0]
        assert pos["quantity"] == "20.000000"
        assert pos["cost_total"] == "3000.00"
        assert pos["avg_cost"] == "150.00"

    def test_buy_sell_reduces_position(self, user, setup_data):
        account, asset = setup_data
        Transaction.objects.create(
            date="2024-01-01", type="BUY", asset=asset, account=account,
            quantity=Decimal("10"), price=Decimal("100"), commission=Decimal("0"),
            owner=user,
        )
        Transaction.objects.create(
            date="2024-02-01", type="SELL", asset=asset, account=account,
            quantity=Decimal("5"), price=Decimal("120"), commission=Decimal("0"),
            owner=user,
        )
        result = calculate_portfolio(user)
        pos = result["positions"][0]
        assert pos["quantity"] == "5.000000"
        assert pos["cost_total"] == "500.00"

    def test_gift_zero_cost(self, user, setup_data):
        account, asset = setup_data
        Transaction.objects.create(
            date="2024-01-01", type="GIFT", asset=asset, account=account,
            quantity=Decimal("10"), price=Decimal("100"), commission=Decimal("0"),
            owner=user,
        )
        result = calculate_portfolio(user)
        pos = result["positions"][0]
        assert pos["quantity"] == "10.000000"
        assert pos["cost_total"] == "0.00"
