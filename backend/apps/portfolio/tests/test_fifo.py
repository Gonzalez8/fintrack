"""
Comprehensive tests for the FIFO / LIFO / WAC portfolio engine.

Covers cost-basis calculation, realized P&L, gift handling,
commissions, and multi-asset scenarios.
"""

import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from apps.assets.models import Account, Asset, Settings
from apps.portfolio.services import calculate_portfolio, calculate_portfolio_full
from apps.transactions.models import Transaction

User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def user(db):
    return User.objects.create_user(username="testuser", password="testpass123")


@pytest.fixture
def settings_fifo(user):
    s = Settings.load(user)
    s.cost_basis_method = Settings.CostBasisMethod.FIFO
    s.gift_cost_mode = Settings.GiftCostMode.ZERO
    s.save()
    return s


@pytest.fixture
def settings_lifo(user):
    s = Settings.load(user)
    s.cost_basis_method = Settings.CostBasisMethod.LIFO
    s.gift_cost_mode = Settings.GiftCostMode.ZERO
    s.save()
    return s


@pytest.fixture
def settings_wac(user):
    s = Settings.load(user)
    s.cost_basis_method = Settings.CostBasisMethod.WAC
    s.gift_cost_mode = Settings.GiftCostMode.ZERO
    s.save()
    return s


@pytest.fixture
def account(user):
    return Account.objects.create(
        owner=user,
        name="Test Broker",
        type=Account.AccountType.INVERSION,
        currency="EUR",
        balance=Decimal("0"),
    )


@pytest.fixture
def asset(user):
    return Asset.objects.create(
        owner=user,
        name="Test Stock",
        ticker="TST",
        type=Asset.AssetType.STOCK,
        currency="EUR",
        current_price=Decimal("15.00"),
    )


@pytest.fixture
def asset_b(user):
    """A second asset for multi-asset tests."""
    return Asset.objects.create(
        owner=user,
        name="Other ETF",
        ticker="OTH",
        type=Asset.AssetType.ETF,
        currency="EUR",
        current_price=Decimal("50.00"),
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_tx(user, asset, account, tx_type, date, quantity, price, commission=0, tax=0):
    return Transaction.objects.create(
        owner=user,
        asset=asset,
        account=account,
        type=tx_type,
        date=date,
        quantity=Decimal(str(quantity)),
        price=Decimal(str(price)) if price is not None else None,
        commission=Decimal(str(commission)),
        tax=Decimal(str(tax)),
    )


def _pos(portfolio, ticker):
    """Return the position dict for *ticker*, or None."""
    for p in portfolio["positions"]:
        if p["asset_ticker"] == ticker:
            return p
    return None


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestEmptyPortfolio:
    def test_empty_portfolio(self, user, settings_fifo):
        result = calculate_portfolio(user)
        assert result["positions"] == []
        assert result["totals"]["total_market_value"] == "0.00"
        assert result["totals"]["total_cost"] == "0.00"
        assert result["totals"]["total_unrealized_pnl"] == "0.00"


@pytest.mark.django_db
class TestSingleBuy:
    def test_single_buy(self, user, settings_fifo, asset, account):
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 10, 12)

        result = calculate_portfolio(user)
        pos = _pos(result, "TST")

        assert pos is not None
        assert Decimal(pos["quantity"]) == Decimal("10")
        assert Decimal(pos["avg_cost"]) == Decimal("12.00")
        assert Decimal(pos["cost_basis"]) == Decimal("120.00")
        # current_price = 15 => market_value = 150
        assert Decimal(pos["market_value"]) == Decimal("150.00")
        assert Decimal(pos["unrealized_pnl"]) == Decimal("30.00")


@pytest.mark.django_db
class TestTwoBuysSameAsset:
    def test_two_buys_same_asset(self, user, settings_fifo, asset, account):
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 10, 10)
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 2, 1), 10, 20)

        result = calculate_portfolio(user)
        pos = _pos(result, "TST")

        assert Decimal(pos["quantity"]) == Decimal("20")
        # total cost = 100 + 200 = 300, avg = 15
        assert Decimal(pos["cost_basis"]) == Decimal("300.00")
        assert Decimal(pos["avg_cost"]) == Decimal("15.00")


@pytest.mark.django_db
class TestBuyThenSellFIFO:
    def test_buy_then_sell_fifo(self, user, settings_fifo, asset, account):
        # Buy 10 @ 10, then 10 @ 20
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 10, 10)
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 2, 1), 10, 20)
        # Sell 10 @ 25 — FIFO consumes the first lot (cost 10)
        _make_tx(user, asset, account, "SELL", datetime.date(2025, 3, 1), 10, 25)

        result = calculate_portfolio_full(user)
        pos = _pos(result, "TST")

        # Remaining: 10 shares from second lot @ 20
        assert Decimal(pos["quantity"]) == Decimal("10")
        assert Decimal(pos["avg_cost"]) == Decimal("20.00")
        assert Decimal(pos["cost_basis"]) == Decimal("200.00")

        # Realized: sold 10 @ 25, cost 10 => PnL = 250 - 100 = 150
        assert len(result["realized_sales"]) == 1
        sale = result["realized_sales"][0]
        assert Decimal(sale["realized_pnl"]) == Decimal("150.00")


@pytest.mark.django_db
class TestBuyThenSellLIFO:
    def test_buy_then_sell_lifo(self, user, settings_lifo, asset, account):
        # Buy 10 @ 10, then 10 @ 20
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 10, 10)
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 2, 1), 10, 20)
        # Sell 10 @ 25 — LIFO consumes the last lot (cost 20)
        _make_tx(user, asset, account, "SELL", datetime.date(2025, 3, 1), 10, 25)

        result = calculate_portfolio_full(user)
        pos = _pos(result, "TST")

        # Remaining: 10 shares from first lot @ 10
        assert Decimal(pos["quantity"]) == Decimal("10")
        assert Decimal(pos["avg_cost"]) == Decimal("10.00")
        assert Decimal(pos["cost_basis"]) == Decimal("100.00")

        # Realized: sold 10 @ 25, cost 20 => PnL = 250 - 200 = 50
        assert len(result["realized_sales"]) == 1
        sale = result["realized_sales"][0]
        assert Decimal(sale["realized_pnl"]) == Decimal("50.00")


@pytest.mark.django_db
class TestFullSell:
    def test_full_sell(self, user, settings_fifo, asset, account):
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 10, 10)
        _make_tx(user, asset, account, "SELL", datetime.date(2025, 2, 1), 10, 15)

        result = calculate_portfolio(user)
        # Position should be gone (zero quantity filtered out)
        assert _pos(result, "TST") is None
        assert result["totals"]["total_market_value"] == "0.00"


@pytest.mark.django_db
class TestGiftZeroCost:
    def test_gift_zero_cost(self, user, settings_fifo, asset, account):
        _make_tx(user, asset, account, "GIFT", datetime.date(2025, 1, 1), 5, 0)

        result = calculate_portfolio(user)
        pos = _pos(result, "TST")

        assert Decimal(pos["quantity"]) == Decimal("5")
        assert Decimal(pos["cost_basis"]) == Decimal("0.00")
        assert Decimal(pos["avg_cost"]) == Decimal("0.00")
        # market_value = 5 * 15 = 75
        assert Decimal(pos["market_value"]) == Decimal("75.00")


@pytest.mark.django_db
class TestGiftMarketCost:
    def test_gift_market_cost(self, user, asset, account):
        s = Settings.load(user)
        s.cost_basis_method = Settings.CostBasisMethod.FIFO
        s.gift_cost_mode = Settings.GiftCostMode.MARKET
        s.save()

        # Gift 5 shares; when gift_cost_mode=MARKET the engine uses tx.price
        # as the cost basis per unit.
        _make_tx(user, asset, account, "GIFT", datetime.date(2025, 1, 1), 5, 30)

        result = calculate_portfolio(user)
        pos = _pos(result, "TST")

        assert Decimal(pos["quantity"]) == Decimal("5")
        # cost = 5 * 30 = 150
        assert Decimal(pos["cost_basis"]) == Decimal("150.00")
        assert Decimal(pos["avg_cost"]) == Decimal("30.00")


@pytest.mark.django_db
class TestWACMethod:
    def test_wac_method(self, user, settings_wac, asset, account):
        # Buy 10 @ 10, then 10 @ 20 => WAC = 15
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 10, 10)
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 2, 1), 10, 20)
        # Sell 5 @ 25 => cost basis = 5 * 15 = 75
        _make_tx(user, asset, account, "SELL", datetime.date(2025, 3, 1), 5, 25)

        result = calculate_portfolio_full(user)
        pos = _pos(result, "TST")

        # Remaining: 15 shares, WAC still 15
        assert Decimal(pos["quantity"]) == Decimal("15")
        assert Decimal(pos["avg_cost"]) == Decimal("15.00")

        # Realized: sell_total = 5*25 = 125, cost = 75 => PnL = 50
        assert len(result["realized_sales"]) == 1
        sale = result["realized_sales"][0]
        assert Decimal(sale["cost_basis"]) == Decimal("75.00")
        assert Decimal(sale["proceeds"]) == Decimal("125.00")
        assert Decimal(sale["realized_pnl"]) == Decimal("50.00")


@pytest.mark.django_db
class TestRealizedPnL:
    def test_realized_pnl(self, user, settings_fifo, asset, account):
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 20, 10)
        _make_tx(user, asset, account, "SELL", datetime.date(2025, 2, 1), 20, 15)

        result = calculate_portfolio_full(user)
        # sell_total = 20*15 = 300, cost = 20*10 = 200 => PnL = 100
        assert Decimal(result["totals"]["total_realized_pnl"]) == Decimal("100.00")
        assert len(result["realized_sales"]) == 1

    def test_realized_loss(self, user, settings_fifo, asset, account):
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 10, 20)
        _make_tx(user, asset, account, "SELL", datetime.date(2025, 2, 1), 10, 8)

        result = calculate_portfolio_full(user)
        # sell_total = 80, cost = 200 => PnL = -120
        assert Decimal(result["totals"]["total_realized_pnl"]) == Decimal("-120.00")


@pytest.mark.django_db
class TestMultipleAssets:
    def test_multiple_assets(self, user, settings_fifo, asset, asset_b, account):
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 10, 10)
        _make_tx(user, asset_b, account, "BUY", datetime.date(2025, 1, 1), 5, 40)

        result = calculate_portfolio(user)
        assert len(result["positions"]) == 2

        pos_tst = _pos(result, "TST")
        pos_oth = _pos(result, "OTH")

        # TST: 10 @ 10, current 15 => mv 150
        assert Decimal(pos_tst["quantity"]) == Decimal("10")
        assert Decimal(pos_tst["cost_basis"]) == Decimal("100.00")
        assert Decimal(pos_tst["market_value"]) == Decimal("150.00")

        # OTH: 5 @ 40, current 50 => mv 250
        assert Decimal(pos_oth["quantity"]) == Decimal("5")
        assert Decimal(pos_oth["cost_basis"]) == Decimal("200.00")
        assert Decimal(pos_oth["market_value"]) == Decimal("250.00")

        # Totals
        assert Decimal(result["totals"]["total_market_value"]) == Decimal("400.00")
        assert Decimal(result["totals"]["total_cost"]) == Decimal("300.00")


@pytest.mark.django_db
class TestCommissionIncluded:
    def test_commission_included_in_cost(self, user, settings_fifo, asset, account):
        # Buy 10 @ 10 with commission 5 => cost per unit = 10 + 5/10 = 10.50
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 10, 10, commission=5)

        result = calculate_portfolio(user)
        pos = _pos(result, "TST")

        assert Decimal(pos["quantity"]) == Decimal("10")
        assert Decimal(pos["cost_basis"]) == Decimal("105.00")
        assert Decimal(pos["avg_cost"]) == Decimal("10.50")

    def test_commission_and_tax_in_cost(self, user, settings_fifo, asset, account):
        # Buy 10 @ 10 with commission 5, tax 3 => cost per unit = 10 + (5+3)/10 = 10.80
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 10, 10, commission=5, tax=3)

        result = calculate_portfolio(user)
        pos = _pos(result, "TST")

        assert Decimal(pos["cost_basis"]) == Decimal("108.00")
        assert Decimal(pos["avg_cost"]) == Decimal("10.80")

    def test_sell_commission_reduces_proceeds(self, user, settings_fifo, asset, account):
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 10, 10)
        # Sell 10 @ 20 with commission 10 => sell_total = 200 - 10 = 190
        _make_tx(user, asset, account, "SELL", datetime.date(2025, 2, 1), 10, 20, commission=10)

        result = calculate_portfolio_full(user)
        sale = result["realized_sales"][0]
        # sell_total = 200 - 10 = 190, cost = 100 => PnL = 90
        assert Decimal(sale["proceeds"]) == Decimal("190.00")
        assert Decimal(sale["realized_pnl"]) == Decimal("90.00")


@pytest.mark.django_db
class TestFIFOPartialLotConsumption:
    def test_partial_lot_consumption(self, user, settings_fifo, asset, account):
        """Sell only part of the first lot; remainder stays."""
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 10, 10)
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 2, 1), 10, 20)
        # Sell 5 — consumes half of the first lot
        _make_tx(user, asset, account, "SELL", datetime.date(2025, 3, 1), 5, 25)

        result = calculate_portfolio_full(user)
        pos = _pos(result, "TST")

        # Remaining: 5 from first lot @ 10 + 10 from second @ 20 = 250
        assert Decimal(pos["quantity"]) == Decimal("15")
        assert Decimal(pos["cost_basis"]) == Decimal("250.00")

        sale = result["realized_sales"][0]
        # cost = 5 * 10 = 50, sell = 5 * 25 = 125 => PnL = 75
        assert Decimal(sale["cost_basis"]) == Decimal("50.00")
        assert Decimal(sale["realized_pnl"]) == Decimal("75.00")


@pytest.mark.django_db
class TestFIFOMultipleSells:
    def test_multiple_sells(self, user, settings_fifo, asset, account):
        """Two consecutive sells that span lots."""
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 10, 10)
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 2, 1), 10, 20)
        # Sell 8 — all from first lot
        _make_tx(user, asset, account, "SELL", datetime.date(2025, 3, 1), 8, 25)
        # Sell 5 — 2 from first lot + 3 from second lot
        _make_tx(user, asset, account, "SELL", datetime.date(2025, 4, 1), 5, 30)

        result = calculate_portfolio_full(user)
        pos = _pos(result, "TST")

        # Remaining: 7 shares from second lot @ 20
        assert Decimal(pos["quantity"]) == Decimal("7")
        assert Decimal(pos["cost_basis"]) == Decimal("140.00")

        assert len(result["realized_sales"]) == 2

        # First sell: 8 @ 25, cost = 8 * 10 = 80 => PnL = 200 - 80 = 120
        s1 = result["realized_sales"][0]
        assert Decimal(s1["cost_basis"]) == Decimal("80.00")
        assert Decimal(s1["realized_pnl"]) == Decimal("120.00")

        # Second sell: 5 @ 30
        # 2 shares from lot1 @ 10 = 20, 3 shares from lot2 @ 20 = 60 => cost = 80
        # sell_total = 150 => PnL = 70
        s2 = result["realized_sales"][1]
        assert Decimal(s2["cost_basis"]) == Decimal("80.00")
        assert Decimal(s2["realized_pnl"]) == Decimal("70.00")


@pytest.mark.django_db
class TestWACAfterMultipleSells:
    def test_wac_after_multiple_sells(self, user, settings_wac, asset, account):
        """WAC should recompute correctly after sequential sells."""
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 10, 10)  # 100
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 2, 1), 10, 30)  # 300
        # WAC = 400/20 = 20

        _make_tx(user, asset, account, "SELL", datetime.date(2025, 3, 1), 5, 25)
        # cost = 5 * 20 = 100, remaining qty=15, remaining cost = 300

        _make_tx(user, asset, account, "SELL", datetime.date(2025, 4, 1), 5, 35)
        # cost = 5 * 20 = 100, remaining qty=10, remaining cost = 200

        result = calculate_portfolio_full(user)
        pos = _pos(result, "TST")

        assert Decimal(pos["quantity"]) == Decimal("10")
        assert Decimal(pos["avg_cost"]) == Decimal("20.00")
        assert Decimal(pos["cost_basis"]) == Decimal("200.00")

        assert len(result["realized_sales"]) == 2
        # First sell: 125 - 100 = 25
        assert Decimal(result["realized_sales"][0]["realized_pnl"]) == Decimal("25.00")
        # Second sell: 175 - 100 = 75
        assert Decimal(result["realized_sales"][1]["realized_pnl"]) == Decimal("75.00")


@pytest.mark.django_db
class TestWeightPercentage:
    def test_weight_pct(self, user, settings_fifo, asset, asset_b, account):
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 10, 10)
        _make_tx(user, asset_b, account, "BUY", datetime.date(2025, 1, 1), 2, 40)

        result = calculate_portfolio(user)
        pos_tst = _pos(result, "TST")
        pos_oth = _pos(result, "OTH")

        # TST mv = 10*15 = 150, OTH mv = 2*50 = 100, total = 250
        assert Decimal(pos_tst["weight"]) == Decimal("60.00")
        assert Decimal(pos_oth["weight"]) == Decimal("40.00")


# ---------------------------------------------------------------------------
# Oversell tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOversellFIFO:
    """Selling more shares than owned (FIFO) should flag oversell, not crash."""

    def test_oversell_flagged(self, user, settings_fifo, asset, account):
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 50, 10)
        _make_tx(user, asset, account, "SELL", datetime.date(2025, 2, 1), 100, 15)

        result = calculate_portfolio_full(user)

        # Portfolio should have 0 positions (all lots consumed)
        assert len(result["positions"]) == 0

        # Realized sale should exist with oversell flagged
        assert len(result["realized_sales"]) == 1
        sale = result["realized_sales"][0]
        assert Decimal(sale["oversell_quantity"]) == Decimal("50")
        # Cost basis covers only 50 shares: 50 * 10 = 500
        assert Decimal(sale["cost_basis"]) == Decimal("500.00")
        # Proceeds based on full 100 shares: 100 * 15 = 1500
        assert Decimal(sale["proceeds"]) == Decimal("1500.00")


@pytest.mark.django_db
class TestOversellLIFO:
    """Same oversell scenario with LIFO."""

    def test_oversell_flagged(self, user, settings_lifo, asset, account):
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 50, 10)
        _make_tx(user, asset, account, "SELL", datetime.date(2025, 2, 1), 100, 15)

        result = calculate_portfolio_full(user)
        assert len(result["positions"]) == 0
        sale = result["realized_sales"][0]
        assert Decimal(sale["oversell_quantity"]) == Decimal("50")
        assert Decimal(sale["cost_basis"]) == Decimal("500.00")


@pytest.mark.django_db
class TestOversellWAC:
    """Same oversell scenario with WAC."""

    def test_oversell_flagged(self, user, settings_wac, asset, account):
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 50, 10)
        _make_tx(user, asset, account, "SELL", datetime.date(2025, 2, 1), 100, 15)

        result = calculate_portfolio_full(user)
        assert len(result["positions"]) == 0
        sale = result["realized_sales"][0]
        assert Decimal(sale["oversell_quantity"]) == Decimal("50")
        # WAC cost basis covers only 50 shares: 50 * 10 = 500
        assert Decimal(sale["cost_basis"]) == Decimal("500.00")


@pytest.mark.django_db
class TestOversellPartial:
    """Buy 50@10, sell 70@15 — cost basis for 50 only, oversell = 20."""

    def test_partial_oversell(self, user, settings_fifo, asset, account):
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 50, 10)
        _make_tx(user, asset, account, "SELL", datetime.date(2025, 2, 1), 70, 15)

        result = calculate_portfolio_full(user)
        sale = result["realized_sales"][0]
        assert Decimal(sale["oversell_quantity"]) == Decimal("20")
        assert Decimal(sale["cost_basis"]) == Decimal("500.00")  # 50 * 10
        assert Decimal(sale["proceeds"]) == Decimal("1050.00")   # 70 * 15


@pytest.mark.django_db
class TestNoOversell:
    """Normal sell should have oversell_quantity == 0."""

    def test_no_oversell(self, user, settings_fifo, asset, account):
        _make_tx(user, asset, account, "BUY", datetime.date(2025, 1, 1), 100, 10)
        _make_tx(user, asset, account, "SELL", datetime.date(2025, 2, 1), 50, 15)

        result = calculate_portfolio_full(user)
        sale = result["realized_sales"][0]
        assert Decimal(sale["oversell_quantity"]) == Decimal("0")
