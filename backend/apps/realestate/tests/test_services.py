import math

import pytest
from decimal import Decimal

from apps.realestate.services import (
    _annuity_payment,
    _months_to_years_months,
    _quantize,
    _solve_term,
    simulate_amortization,
)


# ---------------------------------------------------------------------------
# TestQuantize
# ---------------------------------------------------------------------------
class TestQuantize:
    def test_rounds_to_two_places(self):
        assert _quantize(Decimal("123.456")) == Decimal("123.46")
        assert _quantize(Decimal("100.001")) == Decimal("100.00")
        assert _quantize(Decimal("99.999")) == Decimal("100.00")

    def test_rounds_half_up(self):
        assert _quantize(Decimal("1.005")) == Decimal("1.01")
        assert _quantize(Decimal("1.015")) == Decimal("1.02")
        assert _quantize(Decimal("2.125")) == Decimal("2.13")
        assert _quantize(Decimal("2.1249")) == Decimal("2.12")


# ---------------------------------------------------------------------------
# TestMonthsToYearsMonths
# ---------------------------------------------------------------------------
class TestMonthsToYearsMonths:
    def test_exact_years(self):
        assert _months_to_years_months(24) == (2, 0)
        assert _months_to_years_months(12) == (1, 0)
        assert _months_to_years_months(120) == (10, 0)

    def test_with_remainder(self):
        assert _months_to_years_months(25) == (2, 1)
        assert _months_to_years_months(13) == (1, 1)
        assert _months_to_years_months(7) == (0, 7)

    def test_zero(self):
        assert _months_to_years_months(0) == (0, 0)


# ---------------------------------------------------------------------------
# TestAnnuityPayment
# ---------------------------------------------------------------------------
class TestAnnuityPayment:
    def test_standard_calculation(self):
        # 200,000 balance, 3% annual rate, 360 months (30 years)
        balance = Decimal("200000.00")
        monthly_rate = Decimal("3.0") / Decimal("1200")  # 0.0025
        num_months = 360
        payment = _annuity_payment(balance, monthly_rate, num_months)
        # Well-known value: ~843.21
        assert payment == Decimal("843.21")

    def test_zero_rate(self):
        # 0% interest -> payment = balance / months
        balance = Decimal("120000.00")
        monthly_rate = Decimal("0")
        num_months = 120
        payment = _annuity_payment(balance, monthly_rate, num_months)
        assert payment == Decimal("1000.00")

    def test_short_term(self):
        # 50,000 balance, 5% annual, 12 months
        balance = Decimal("50000.00")
        monthly_rate = Decimal("5.0") / Decimal("1200")
        num_months = 12
        payment = _annuity_payment(balance, monthly_rate, num_months)
        # Verify it's reasonable: should be slightly above 50000/12 = 4166.67
        assert payment > Decimal("4166.67")
        assert payment < Decimal("5000.00")
        # The exact value: ~4280.37
        # Verify precision
        assert payment == payment.quantize(Decimal("0.01"))


# ---------------------------------------------------------------------------
# TestSolveTerm
# ---------------------------------------------------------------------------
class TestSolveTerm:
    def test_standard_calculation(self):
        # If we know 200000 at 0.25% monthly with 843.21 payment -> ~360 months
        balance = Decimal("200000.00")
        monthly_rate = Decimal("3.0") / Decimal("1200")
        payment = Decimal("843.21")
        n = _solve_term(balance, monthly_rate, payment)
        assert n is not None
        assert n == 360

    def test_zero_rate(self):
        balance = Decimal("12000.00")
        monthly_rate = Decimal("0")
        payment = Decimal("1000.00")
        n = _solve_term(balance, monthly_rate, payment)
        assert n == 12

    def test_payment_too_low_returns_none(self):
        # Payment doesn't even cover monthly interest
        balance = Decimal("200000.00")
        monthly_rate = Decimal("6.0") / Decimal("1200")  # 0.5% monthly = 1000/month interest
        payment = Decimal("500.00")  # less than interest
        n = _solve_term(balance, monthly_rate, payment)
        assert n is None


# ---------------------------------------------------------------------------
# TestSimulateAmortization
# ---------------------------------------------------------------------------
class TestSimulateAmortization:
    def test_reduce_payment_strategy(self):
        result = simulate_amortization(
            outstanding_balance=Decimal("150000.00"),
            annual_interest_rate=Decimal("3.0000"),
            remaining_months=300,
            monthly_payment=Decimal("843.21"),
            extra_payment=Decimal("20000.00"),
            strategy="REDUCE_PAYMENT",
        )
        assert result["strategy"] == "REDUCE_PAYMENT"
        # New payment should be lower
        assert Decimal(result["new"]["monthly_payment"]) < Decimal(
            result["current"]["monthly_payment"]
        )
        # Installments unchanged
        assert (
            result["new"]["remaining_installments"]
            == result["current"]["remaining_installments"]
        )
        # Difference in payment should be negative
        assert Decimal(result["difference"]["monthly_payment"]) < Decimal("0")

    def test_reduce_term_strategy(self):
        result = simulate_amortization(
            outstanding_balance=Decimal("150000.00"),
            annual_interest_rate=Decimal("3.0000"),
            remaining_months=300,
            monthly_payment=Decimal("843.21"),
            extra_payment=Decimal("20000.00"),
            strategy="REDUCE_TERM",
        )
        assert result["strategy"] == "REDUCE_TERM"
        # Payment stays the same
        assert result["new"]["monthly_payment"] == result["current"]["monthly_payment"]
        # Fewer installments
        assert (
            result["new"]["remaining_installments"]
            < result["current"]["remaining_installments"]
        )
        # Difference in installments should be negative
        assert result["difference"]["remaining_installments"] < 0

    def test_full_payoff(self):
        result = simulate_amortization(
            outstanding_balance=Decimal("50000.00"),
            annual_interest_rate=Decimal("2.5000"),
            remaining_months=120,
            monthly_payment=Decimal("500.00"),
            extra_payment=Decimal("60000.00"),  # exceeds balance
            strategy="REDUCE_PAYMENT",
        )
        assert result["new"]["monthly_payment"] == "0.00"
        assert result["new"]["remaining_installments"] == 0
        assert result["new"]["total_interest"] == "0.00"
        assert result["new"]["remaining_years"] == 0
        assert result["new"]["remaining_months"] == 0

    def test_difference_calculation(self):
        result = simulate_amortization(
            outstanding_balance=Decimal("100000.00"),
            annual_interest_rate=Decimal("4.0000"),
            remaining_months=240,
            monthly_payment=Decimal("605.98"),
            extra_payment=Decimal("10000.00"),
            strategy="REDUCE_PAYMENT",
        )
        current = result["current"]
        new = result["new"]
        diff = result["difference"]

        # Verify difference = new - current for payment
        expected_diff_payment = Decimal(new["monthly_payment"]) - Decimal(
            current["monthly_payment"]
        )
        assert Decimal(diff["monthly_payment"]) == expected_diff_payment.quantize(
            Decimal("0.01")
        )

        # Verify difference for installments
        expected_diff_inst = (
            new["remaining_installments"] - current["remaining_installments"]
        )
        assert diff["remaining_installments"] == expected_diff_inst

        # Verify difference for total_remaining
        expected_diff_total = Decimal(new["total_remaining"]) - Decimal(
            current["total_remaining"]
        )
        assert Decimal(diff["total_remaining"]) == expected_diff_total.quantize(
            Decimal("0.01")
        )

    def test_zero_interest_rate(self):
        result = simulate_amortization(
            outstanding_balance=Decimal("120000.00"),
            annual_interest_rate=Decimal("0.0000"),
            remaining_months=120,
            monthly_payment=Decimal("1000.00"),
            extra_payment=Decimal("20000.00"),
            strategy="REDUCE_PAYMENT",
        )
        # With 0% interest, new payment = (120000-20000)/120 = 833.33
        assert result["new"]["monthly_payment"] == "833.33"
        assert result["new"]["remaining_installments"] == 120

    def test_zero_interest_rate_reduce_term(self):
        result = simulate_amortization(
            outstanding_balance=Decimal("120000.00"),
            annual_interest_rate=Decimal("0.0000"),
            remaining_months=120,
            monthly_payment=Decimal("1000.00"),
            extra_payment=Decimal("20000.00"),
            strategy="REDUCE_TERM",
        )
        # With 0% interest, new term = ceil(100000/1000) = 100 months
        assert result["new"]["remaining_installments"] == 100
        assert result["new"]["monthly_payment"] == "1000.00"

    def test_small_extra_payment(self):
        result = simulate_amortization(
            outstanding_balance=Decimal("200000.00"),
            annual_interest_rate=Decimal("3.0000"),
            remaining_months=360,
            monthly_payment=Decimal("843.21"),
            extra_payment=Decimal("100.00"),
            strategy="REDUCE_PAYMENT",
        )
        # Very small extra — new payment should be only slightly less
        new_payment = Decimal(result["new"]["monthly_payment"])
        current_payment = Decimal(result["current"]["monthly_payment"])
        assert new_payment < current_payment
        # The difference should be small (less than $1)
        assert current_payment - new_payment < Decimal("1.00")

    def test_exact_payoff(self):
        # Extra payment exactly equals outstanding
        result = simulate_amortization(
            outstanding_balance=Decimal("10000.00"),
            annual_interest_rate=Decimal("5.0000"),
            remaining_months=60,
            monthly_payment=Decimal("188.71"),
            extra_payment=Decimal("10000.00"),
            strategy="REDUCE_TERM",
        )
        assert result["new"]["monthly_payment"] == "0.00"
        assert result["new"]["remaining_installments"] == 0

    def test_monthly_interest_rate_in_result(self):
        result = simulate_amortization(
            outstanding_balance=Decimal("100000.00"),
            annual_interest_rate=Decimal("6.0000"),
            remaining_months=240,
            monthly_payment=Decimal("716.43"),
            extra_payment=Decimal("5000.00"),
            strategy="REDUCE_PAYMENT",
        )
        # 6% annual / 12 = 0.5% monthly
        assert result["monthly_interest_rate"] == "0.5000"

    def test_current_scenario_values(self):
        result = simulate_amortization(
            outstanding_balance=Decimal("150000.00"),
            annual_interest_rate=Decimal("3.0000"),
            remaining_months=300,
            monthly_payment=Decimal("843.21"),
            extra_payment=Decimal("10000.00"),
            strategy="REDUCE_PAYMENT",
        )
        current = result["current"]
        assert current["monthly_payment"] == "843.21"
        assert current["remaining_installments"] == 300
        years, months = _months_to_years_months(300)
        assert current["remaining_years"] == years
        assert current["remaining_months"] == months
