"""What-if sale: lots, gain, validation and the Spanish tax estimate."""

import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.assets.models import Account, Asset, Settings
from apps.portfolio.sale_simulation import SaleSimulationError, loss_harvest, simulate_sale
from apps.reports.tax_adapters.es_sale import loss_offset, savings_base, savings_tax
from apps.transactions.models import Dividend, Transaction

User = get_user_model()
D = datetime.date
TODAY = D(2026, 6, 15)


@pytest.fixture
def user(db):
    u = User.objects.create_user(username="seller", password="testpass123")
    Settings.load(u)
    return u


@pytest.fixture
def account(user):
    return Account.objects.create(owner=user, name="Broker", type="OPERATIVA", currency="EUR")


@pytest.fixture
def asset(user):
    return Asset.objects.create(
        owner=user, name="Alpha", ticker="ALP", type="STOCK", currency="EUR", current_price=Decimal("110")
    )


def _tx(user, asset, account, type_, date, qty, price, commission="0"):
    return Transaction.objects.create(
        owner=user,
        asset=asset,
        account=account,
        type=type_,
        date=date,
        quantity=Decimal(qty),
        price=Decimal(price),
        commission=Decimal(commission),
        tax=Decimal("0"),
    )


@pytest.fixture
def three_lots(user, asset, account):
    _tx(user, asset, account, "BUY", D(2021, 3, 1), "10", "80")
    _tx(user, asset, account, "BUY", D(2023, 6, 1), "10", "100")
    _tx(user, asset, account, "BUY", D(2025, 2, 1), "10", "125")


class TestSavingsScale:
    def test_progressive_scale(self):
        assert savings_tax(Decimal("6000")) == Decimal("1140")
        # 6,000 at 19 % + 4,000 at 21 %
        assert savings_tax(Decimal("10000")) == Decimal("1980")
        assert savings_tax(Decimal("0")) == 0

    def test_losses_offset_up_to_a_quarter_of_capital_income(self):
        assert savings_base(Decimal("500"), Decimal("1000")) == Decimal("1500")
        assert savings_base(Decimal("-100"), Decimal("1000")) == Decimal("900")
        assert savings_base(Decimal("-900"), Decimal("1000")) == Decimal("750")


class TestLossOffset:
    def test_gains_first_then_a_quarter_of_income_then_carried_forward(self):
        o = loss_offset(Decimal("500"), Decimal("1000"), Decimal("900"))
        assert o == {"gains": Decimal("500"), "income": Decimal("250"), "carried_forward": Decimal("150")}

    def test_without_gains_or_income_everything_is_carried_forward(self):
        o = loss_offset(Decimal("0"), Decimal("0"), Decimal("300"))
        assert o == {"gains": Decimal("0"), "income": Decimal("0"), "carried_forward": Decimal("300")}

    def test_earlier_losses_already_used_part_of_the_income_cap(self):
        # The year is already −100 net: 100 of the 250 cap is taken
        o = loss_offset(Decimal("-100"), Decimal("1000"), Decimal("200"))
        assert o == {"gains": Decimal("0"), "income": Decimal("150"), "carried_forward": Decimal("50")}


@pytest.mark.django_db
class TestSimulateSale:
    def test_fifo_takes_the_oldest_lots(self, user, asset, three_lots):
        r = simulate_sale(user, asset.id, Decimal("12"), Decimal("110"), today=TODAY)
        sold = [(lot["date"], Decimal(lot["quantity_sold"])) for lot in r["lots"]]
        assert sold[:2] == [("2021-03-01", Decimal("10")), ("2023-06-01", Decimal("2"))]
        # 10 × (110 − 80) + 2 × (110 − 100)
        assert r["gain"] == "320.00"
        assert r["cost_basis"] == "1000.00"
        assert r["method"] == "FIFO"

    def test_commission_lowers_the_gain(self, user, asset, three_lots):
        r = simulate_sale(user, asset.id, Decimal("10"), Decimal("110"), Decimal("5"), today=TODAY)
        assert r["proceeds"] == "1095.00"
        assert r["gain"] == "295.00"

    def test_uses_the_current_price_by_default(self, user, asset, three_lots):
        assert Decimal(simulate_sale(user, asset.id, Decimal("1"), today=TODAY)["price"]) == Decimal("110")

    def test_lifo_when_it_is_the_fiscal_method(self, user, asset, three_lots):
        s = Settings.load(user)
        s.fiscal_cost_method = Settings.CostBasisMethod.LIFO
        s.save()
        r = simulate_sale(user, asset.id, Decimal("10"), Decimal("110"), today=TODAY)
        assert r["lots"][0]["date"] == "2025-02-01"
        assert r["gain"] == "-150.00"

    def test_rejects_more_than_held(self, user, asset, three_lots):
        with pytest.raises(SaleSimulationError):
            simulate_sale(user, asset.id, Decimal("31"), today=TODAY)

    def test_records_nothing(self, user, asset, three_lots):
        simulate_sale(user, asset.id, Decimal("5"), today=TODAY)
        assert Transaction.objects.filter(owner=user, type="SELL").count() == 0

    def test_spanish_estimate_counts_the_year(self, user, asset, account, three_lots):
        _tx(user, asset, account, "SELL", D(2026, 1, 10), "5", "100")  # +100 realized this year (FIFO at 80)
        Dividend.objects.create(
            owner=user, asset=asset, date=D(2026, 3, 1), gross=Decimal("200"), tax=Decimal("38"), net=Decimal("162")
        )
        tax = simulate_sale(user, asset.id, Decimal("5"), Decimal("110"), today=TODAY)["tax"]
        assert tax["gains_ytd"] == "100.00"
        assert tax["income_ytd"] == "200.00"
        # Sale of 5 at 110 from the 80 lot: +150, taxed at 19 %
        assert tax["tax_sale"] == "28.50"
        assert tax["wash_sale"] is None

    def test_a_loss_says_what_it_offsets(self, user, asset, account, three_lots):
        _tx(user, asset, account, "SELL", D(2026, 1, 10), "5", "100")  # FIFO from the 80 lot: +100 this year
        # 5 left at 80 and 5 at 100, sold at 70: −50 − 150 = −200
        tax = simulate_sale(user, asset.id, Decimal("10"), Decimal("70"), today=TODAY)["tax"]
        assert tax["loss_offset"] == {"gains": "100.00", "income": "0.00", "carried_forward": "100.00"}
        assert tax["tax_sale"] == "-19.00"

    def test_two_month_rule_on_a_loss(self, user, asset, account, three_lots):
        _tx(user, asset, account, "BUY", D(2026, 5, 20), "1", "90")
        s = Settings.load(user)
        s.fiscal_cost_method = Settings.CostBasisMethod.LIFO
        s.save()
        tax = simulate_sale(user, asset.id, Decimal("1"), Decimal("80"), today=TODAY)["tax"]
        assert tax["wash_sale"]["recent_buys"] == [{"date": "2026-05-20", "quantity": "1.000000"}]
        assert tax["wash_sale"]["rebuy_until"] == "2026-08-15"

    def test_no_estimate_without_a_tax_adapter(self, user, asset, three_lots):
        s = Settings.load(user)
        s.tax_country = "PT"
        s.save()
        assert simulate_sale(user, asset.id, Decimal("1"), today=TODAY)["tax"] is None


@pytest.mark.django_db
class TestSimulateSaleEndpoint:
    URL = "/api/portfolio/simulate-sale/"

    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    def test_ok(self, user, asset, three_lots):
        res = self._client(user).get(self.URL, {"asset_id": asset.id, "quantity": "3", "price": "120"})
        assert res.status_code == 200
        assert res.json()["gain"] == "120.00"

    def test_bad_input(self, user, asset, three_lots):
        c = self._client(user)
        assert c.get(self.URL, {"asset_id": asset.id, "quantity": "abc"}).status_code == 400
        assert c.get(self.URL, {"asset_id": asset.id, "quantity": "99"}).status_code == 400
        assert c.get(self.URL, {"asset_id": "not-a-uuid", "quantity": "1"}).status_code == 400

    def test_other_users_asset(self, user, asset, three_lots):
        other = User.objects.create_user(username="other", password="testpass123")
        assert self._client(other).get(self.URL, {"asset_id": asset.id, "quantity": "1"}).status_code == 400

    def test_requires_auth(self):
        assert APIClient().get(self.URL).status_code == 401


@pytest.mark.django_db
class TestLossHarvest:
    @pytest.fixture
    def losers(self, user, account):
        a = Asset.objects.create(
            owner=user, name="Down A", ticker="DA", type="STOCK", currency="EUR", current_price=Decimal("50")
        )
        b = Asset.objects.create(
            owner=user, name="Down B", ticker="DB", type="STOCK", currency="EUR", current_price=Decimal("80")
        )
        up = Asset.objects.create(
            owner=user, name="Up", ticker="UP", type="STOCK", currency="EUR", current_price=Decimal("200")
        )
        _tx(user, a, account, "BUY", D(2025, 1, 10), "10", "100")  # −500
        _tx(user, b, account, "BUY", D(2025, 1, 10), "10", "100")  # −200
        _tx(user, up, account, "BUY", D(2025, 1, 10), "10", "100")
        _tx(user, up, account, "SELL", D(2026, 2, 1), "5", "200")  # +500 realized this year
        return a, b

    def test_lists_only_positions_at_a_loss(self, user, losers):
        r = loss_harvest(user, today=TODAY)
        assert [(p["asset_name"], p["loss"]) for p in r["positions"]] == [("Down A", "500.00"), ("Down B", "200.00")]
        assert r["tax"]["gains_ytd"] == "500.00"

    def test_selection_respects_the_offset_limit(self, user, losers):
        a, b = losers
        tax = loss_harvest(user, {str(a.pk), str(b.pk)}, today=TODAY)["tax"]
        # 700 of losses but only 500 of gains and no capital income: 200 carried forward, 19 % of 500 saved
        assert tax["selection"]["tax_saving"] == "95.00"
        assert tax["selection"]["loss_offset"]["carried_forward"] == "200.00"
        assert tax["per_asset"][str(a.pk)]["tax_saving"] == "95.00"
        assert tax["per_asset"][str(b.pk)]["tax_saving"] == "38.00"
        assert tax["max_saving"] == "95.00"

    def test_endpoint(self, user, losers):
        c = APIClient()
        c.force_authenticate(user=user)
        a, _ = losers
        res = c.get("/api/portfolio/loss-harvesting/", {"selected": str(a.pk)})
        assert res.status_code == 200
        assert res.json()["tax"]["selection"]["loss"] == "500.00"
