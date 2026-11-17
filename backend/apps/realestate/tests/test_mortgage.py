"""Current mortgage state: elapsed months, early amortizations and the finished state."""

import datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.realestate.models import Amortization, Property
from apps.realestate.mortgage import closed_form_balance, months_elapsed, mortgage_state

User = get_user_model()
D = datetime.date


def prop(**overrides):
    """The mortgage from the bug report: 91 500 € at 1.7 %, 15 years, from October 2019."""
    fields = {
        "original_loan_amount": Decimal("91500.00"),
        "annual_interest_rate": Decimal("1.7000"),
        "total_term_months": 180,
        "monthly_payment": Decimal("576.26"),
        "months_paid": 77,
        "purchase_date": D(2019, 10, 1),
        "current_value": Decimal("250000.00"),
    }
    fields.update(overrides)
    return SimpleNamespace(**fields)


def event(month, amount, strategy="REDUCE_TERM"):
    return SimpleNamespace(month=month, amount=Decimal(amount), strategy=strategy)


class TestHelpers:
    def test_months_elapsed(self):
        assert months_elapsed(D(2019, 10, 1), D(2026, 3, 29)) == 77
        assert months_elapsed(D(2019, 10, 1), D(2019, 9, 1)) == 0

    def test_closed_form_matches_the_report(self):
        rate = Decimal("1.7") / 100 / 12
        assert closed_form_balance(Decimal("91500"), rate, 180, 77).quantize(Decimal("0.01")) == Decimal("55190.78")


class TestState:
    def test_without_amortizations_matches_the_french_schedule(self):
        state = mortgage_state(prop(), [], D(2026, 3, 29))
        assert (state.status, state.months_paid, state.outstanding_balance) == ("ACTIVE", 77, Decimal("55190.78"))
        assert state.current_monthly_payment == Decimal("576.26")
        assert state.end_date == "2034-10"

    def test_months_paid_follows_the_calendar(self):
        """The stored months_paid (77) was a snapshot; eight months later the debt is lower."""
        state = mortgage_state(prop(), [], D(2026, 11, 17))
        assert state.months_paid == 85
        assert state.outstanding_balance < Decimal("55190.78")

    def test_amortization_that_pays_it_off_finishes_the_mortgage(self):
        """The reported bug: paid off early, the API kept returning the theoretical balance."""
        state = mortgage_state(prop(), [event(70, "70000")], D(2026, 3, 29))
        assert state.status == "FINISHED"
        assert state.outstanding_balance == Decimal("0")
        assert state.current_monthly_payment == Decimal("0")
        assert state.end_date == "2025-08"  # month 70
        assert state.extra_amortizations == Decimal("70000.00")

    def test_payments_stop_when_paid_off_but_the_calendar_keeps_going(self):
        """Paid off in month 29 (March 2022): 29 payments made, 85 months elapsed."""
        state = mortgage_state(prop(), [event(29, "90000")], D(2026, 11, 17))
        assert state.status == "FINISHED"
        assert (state.months_paid, state.months_elapsed) == (29, 85)
        assert state.end_date == "2022-03"

    def test_active_mortgage_has_paid_every_elapsed_month(self):
        state = mortgage_state(prop(), [], D(2026, 11, 17))
        assert state.months_paid == state.months_elapsed == 85

    def test_reduce_term_shortens_the_mortgage(self):
        state = mortgage_state(prop(), [event(24, "20000")], D(2026, 3, 29))
        assert state.status == "ACTIVE"
        assert state.current_monthly_payment == Decimal("576.26")  # same payment
        assert state.end_month < 180
        assert state.outstanding_balance < Decimal("55190.78")

    def test_reduce_payment_keeps_the_term(self):
        state = mortgage_state(prop(), [event(24, "20000", "REDUCE_PAYMENT")], D(2026, 3, 29))
        assert state.status == "ACTIVE"
        assert state.current_monthly_payment < Decimal("576.26")
        assert state.end_month == 180

    def test_past_the_term_it_is_finished(self):
        state = mortgage_state(prop(purchase_date=D(2005, 1, 1)), [], D(2026, 3, 29))
        assert (state.status, state.outstanding_balance, state.months_paid) == ("FINISHED", Decimal("0"), 180)

    def test_without_purchase_date_uses_the_stored_months(self):
        state = mortgage_state(prop(purchase_date=None), [], D(2030, 1, 1))
        assert state.months_paid == 77 and state.end_date is None

    def test_without_mortgage(self):
        state = mortgage_state(prop(original_loan_amount=None), [], D(2026, 3, 29))
        assert state.status == "NONE" and state.outstanding_balance is None


def months_ago(n):
    today = timezone.localdate()
    total = today.year * 12 + today.month - 1 - n
    return D(total // 12, total % 12 + 1, 1)


@pytest.mark.django_db
class TestPropertyAPI:
    @pytest.fixture
    def client_and_user(self):
        user = User.objects.create_user(username="mortgage", password="x")
        c = APIClient()
        c.force_authenticate(user=user)
        return c, user

    def _create(self, user, months_paid_snapshot=77, purchase_months_ago=85):
        return Property.objects.create(
            owner=user,
            name="Avenida Torrente n34",
            current_value=Decimal("250000.00"),
            purchase_date=months_ago(purchase_months_ago),
            original_loan_amount=Decimal("91500.00"),
            outstanding_balance=Decimal("55190.78"),  # stale snapshot
            annual_interest_rate=Decimal("1.7000"),
            total_term_months=180,
            months_paid=months_paid_snapshot,
            monthly_payment=Decimal("576.26"),
        )

    def test_paid_off_mortgage_has_no_debt(self, client_and_user):
        client, user = client_and_user
        p = self._create(user)
        Amortization.objects.create(owner=user, property=p, month=70, amount=Decimal("70000"), strategy="REDUCE_TERM")

        body = client.get(f"/api/properties/{p.id}/").json()
        assert body["mortgage_status"] == "FINISHED"
        assert body["outstanding_balance"] == "0"
        assert body["net_equity"] == "250000.00"
        assert body["amortized_capital"] == "91500.00"
        assert body["current_monthly_payment"] == "0"
        assert body["has_mortgage"] is True  # the mortgage data still exists

    def test_finished_mortgage_flags(self, client_and_user):
        client, user = client_and_user
        p = self._create(user)
        Amortization.objects.create(owner=user, property=p, month=29, amount=Decimal("90000"), strategy="REDUCE_TERM")
        body = client.get(f"/api/properties/{p.id}/").json()
        assert body["mortgage_status"] == "FINISHED"
        assert body["has_mortgage"] is True and body["has_active_mortgage"] is False
        assert (body["months_paid"], body["months_elapsed"]) == (29, 85)

    def test_active_mortgage_uses_months_elapsed_today(self, client_and_user):
        client, user = client_and_user
        p = self._create(user)
        body = client.get(f"/api/properties/{p.id}/").json()
        assert body["mortgage_status"] == "ACTIVE"
        assert body["months_paid"] == body["months_elapsed"] == 85  # not the stored 77
        assert body["has_active_mortgage"] is True
        assert Decimal(body["outstanding_balance"]) < Decimal("55190.78")

    def test_property_without_mortgage(self, client_and_user):
        client, user = client_and_user
        p = Property.objects.create(owner=user, name="Garaje", current_value=Decimal("20000"))
        body = client.get(f"/api/properties/{p.id}/").json()
        assert body["mortgage_status"] == "NONE"
        assert body["net_equity"] == "20000.00"
        assert body["current_monthly_payment"] is None

    def test_list_does_not_query_amortizations_per_property(self, client_and_user, django_assert_max_num_queries):
        client, user = client_and_user
        for _ in range(3):
            self._create(user)
        with django_assert_max_num_queries(6):
            assert client.get("/api/properties/").status_code == 200


class TestParityWithTheWeb:
    """Same figures as the "parity with the backend mortgage engine" block of
    frontend/src/lib/mortgage-math.test.ts — change both engines together."""

    @pytest.mark.parametrize(
        "events,expected",
        [
            ([event(24, "20000", "REDUCE_TERM")], (Decimal("33632.07"), Decimal("576.26"), 138)),
            ([event(24, "20000", "REDUCE_PAYMENT")], (Decimal("41496.47"), Decimal("433.27"), 180)),
            ([event(70, "70000", "REDUCE_TERM")], (Decimal("0"), Decimal("0"), 70)),
        ],
    )
    def test_matches_the_client_engine(self, events, expected):
        state = mortgage_state(prop(purchase_date=None), events, D(2026, 3, 29))
        assert (state.outstanding_balance, state.current_monthly_payment, state.end_month) == expected
