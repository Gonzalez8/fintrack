"""Spanish rental income: pure calculation, yearly overview from records, Modo Renta block and endpoints."""

import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.assets.models import Settings
from apps.payroll.models import Employer, Payroll
from apps.realestate.models import Lease, Property, RentalExpense
from apps.realestate.mortgage import interest_in_year
from apps.reports.tax_adapters import get_adapter
from apps.reports.tax_adapters.es_rental import RentalInputs, compute_rental, rental_overview, scale_tax
from apps.transactions.models import OtherIncome

User = get_user_model()
D = Decimal


def base_inputs(**overrides):
    values = {
        "year": 2025,
        "income": D("9600"),
        "days_rented": 365,
        "repairs": D("300"),
        "taxes": D("400"),
        "community": D("600"),
        "insurance": D("200"),
        "acquisition_price": D("150000"),
        "acquisition_costs": D("15000"),
        "cadastral_value": D("80000"),
        "cadastral_construction_value": D("48000"),
        "furniture_value": D("5000"),
        "reduction_pct": D("60"),
        "other_general_base": D("30000"),
    }
    values.update(overrides)
    return RentalInputs(**values)


# ---------------------------------------------------------------------------
# Pure calculation
# ---------------------------------------------------------------------------


def test_full_year_with_reduction_and_tax():
    r = compute_rental(base_inputs())
    # 165,000 acquisition > 80,000 cadastral; 60 % construction → 99,000 × 3 %
    assert r["depreciation"] == "2970.00"
    assert r["furniture_depreciation"] == "500.00"
    assert (r["capped_applied"], r["other_expenses"]) == ("300.00", "1200.00")
    # 9,600 − 300 − 1,200 − 2,970 − 500
    assert r["net"] == "4630.00"
    assert (r["reduction"], r["net_reduced"]) == ("2778.00", "1852.00")
    # 1,852 taxed at the 30 % bracket on top of a 30,000 base
    assert (r["estimated_tax"], r["marginal_rate"]) == ("555.60", "30")
    assert r["paid_expenses"] == "1500.00"
    assert r["cash_result"] == "7544.40"
    assert r["warnings"] == []


def test_interest_and_repairs_are_capped_at_income():
    r = compute_rental(base_inputs(income=D("1000"), financing=D("2000"), repairs=D("500")))
    assert (r["capped_applied"], r["excess_carry_forward"]) == ("1000.00", "1500.00")


def test_no_reduction_on_negative_net():
    r = compute_rental(base_inputs(income=D("4680")))
    assert r["net"] == "-290.00"
    assert (r["reduction"], r["net_reduced"]) == ("0.00", "-290.00")
    # A negative rent lowers the general base
    assert D(r["estimated_tax"]) < 0


def test_part_year_prorates_property_costs_and_imputes_vacancy():
    r = compute_rental(
        base_inputs(
            days_rented=182,
            days_vacant=183,
            taxes=D("365"),
            community=D("0"),
            insurance=D("0"),
            repairs=D("0"),
            cadastral_value=D("50000"),
            cadastral_construction_value=D("30000"),
        )
    )
    assert r["expenses_detail"]["taxes"] == "182.00"
    # 50,000 × 1.1 % × 183 / 365
    assert r["imputation"] == "275.75"


def test_unrevised_cadastral_value_imputes_two_percent():
    r = compute_rental(base_inputs(days_rented=0, days_vacant=365, cadastral_revised=False))
    assert r["imputation"] == "1600.00"


def test_ownership_share_scales_everything():
    full = compute_rental(base_inputs())
    half = compute_rental(base_inputs(ownership_pct=D("50")))
    assert half["income"] == "4800.00"
    assert D(half["net"]) == D(full["net"]) / 2


def test_missing_cadastral_data_warns_and_skips_depreciation():
    r = compute_rental(base_inputs(cadastral_value=None, cadastral_construction_value=None))
    assert r["depreciation"] == "0.00"
    assert any("valor catastral" in w for w in r["warnings"])


def test_scale_tax_brackets():
    assert scale_tax(D("12450")) == D("2365.50")
    assert scale_tax(D("20200")) == D("4225.50")
    assert scale_tax(D("0")) == 0


def test_inputs_from_dict_ignores_nulls():
    inp = RentalInputs.from_dict({"year": 2026, "income": "100", "cadastral_value": None, "cadastral_revised": False})
    assert (inp.income, inp.cadastral_value, inp.cadastral_revised) == (D("100"), None, False)


# ---------------------------------------------------------------------------
# Mortgage interest of a calendar year
# ---------------------------------------------------------------------------


@pytest.fixture
def user(db):
    return User.objects.create_user(username="landlord", password="x")


def test_interest_in_year_follows_the_schedule(user):
    prop = Property.objects.create(
        owner=user,
        name="Loan flat",
        current_value=D("100000"),
        purchase_date=datetime.date(2025, 12, 1),
        original_loan_amount=D("12000"),
        annual_interest_rate=D("12"),
        total_term_months=12,
        monthly_payment=D("1066.19"),
    )
    assert interest_in_year(prop, [], 2026, before_month="2026-02") == D("120.00")
    assert D("790") < interest_in_year(prop, [], 2026) < D("800")
    assert interest_in_year(prop, [], 2027) == 0


def test_interest_in_year_without_mortgage(user):
    prop = Property.objects.create(owner=user, name="Paid", current_value=D("1"))
    assert interest_in_year(prop, [], 2026) is None


# ---------------------------------------------------------------------------
# Overview from records
# ---------------------------------------------------------------------------

TODAY = datetime.date(2026, 11, 17)


@pytest.fixture
def flat(user):
    return Property.objects.create(
        owner=user,
        name="Av. Torrente",
        current_value=D("250000"),
        purchase_price=D("150000"),
        acquisition_costs=D("15000"),
        cadastral_value=D("80000"),
        cadastral_construction_value=D("48000"),
    )


@pytest.fixture
def lease(user, flat):
    return Lease.objects.create(
        owner=user,
        property=flat,
        start_date=datetime.date(2025, 1, 1),
        monthly_rent=D("400"),
        reduction=Lease.Reduction.GENERAL,
    )


def pay(user, lease, month, amount="400"):
    return OtherIncome.objects.create(
        owner=user,
        date=datetime.date(2026, month, 1),
        category=OtherIncome.Category.RENTAL,
        description="Rent",
        amount=D(amount),
        lease=lease,
    )


def test_overview_projects_remaining_rent_and_recurring_costs(user, flat, lease):
    for month in range(1, 11):
        pay(user, lease, month)
    RentalExpense.objects.create(
        owner=user, property=flat, date=datetime.date(2025, 6, 1), category="TAXES", amount=D("380")
    )
    RentalExpense.objects.create(
        owner=user, property=flat, date=datetime.date(2026, 3, 1), category="REPAIRS", amount=D("120")
    )

    data = rental_overview(user, 2026, today=TODAY)
    [entry] = data["properties"]
    assert entry["missing_months"] == []
    to_date, projected = entry["to_date"], entry["projected"]
    assert D(to_date["inputs"]["income"]) == 4000
    assert to_date["result"]["days_rented"] == (TODAY - datetime.date(2026, 1, 1)).days + 1
    # November and December still to be paid
    assert D(projected["inputs"]["income"]) == 4800
    assert projected["result"]["days_rented"] == 365
    # IBI not paid yet this year: last year's figure is used and flagged
    assert D(projected["inputs"]["taxes"]) == 380
    assert {"taxes", "income"} <= set(projected["estimated"])
    assert D(to_date["inputs"]["taxes"]) == 0
    assert D(projected["inputs"]["reduction_pct"]) == 50


def test_overview_flags_months_without_payment(user, flat, lease):
    pay(user, lease, 1)
    entry = rental_overview(user, 2026, today=TODAY)["properties"][0]
    assert entry["missing_months"][:2] == ["2026-02", "2026-03"]
    assert "2026-11" not in entry["missing_months"]


def test_overview_uses_payslips_for_the_general_base(user, flat, lease):
    employer = Employer.objects.create(owner=user, name="ACME")
    for month in (1, 2):
        Payroll.objects.create(
            owner=user,
            employer=employer,
            period_start=datetime.date(2025, month, 1),
            period_end=datetime.date(2025, month, 28),
            gross=D("3000"),
            ss_employee=D("200"),
            irpf_withholding=D("400"),
            net=D("2400"),
        )
    data = rental_overview(user, 2025, today=TODAY)
    # Past year: no extrapolation. 2 × (3,000 − 200) − 2,000
    assert (data["other_general_base"], data["other_general_base_projected"]) == ("3600.00", False)


def test_overview_ignores_properties_without_a_lease_that_year(user, flat):
    Lease.objects.create(
        owner=user,
        property=flat,
        start_date=datetime.date(2020, 1, 1),
        end_date=datetime.date(2020, 12, 31),
        monthly_rent=D("300"),
    )
    assert rental_overview(user, 2026, today=TODAY)["properties"] == []


def test_overview_is_per_user(user, flat, lease):
    other = User.objects.create_user(username="other", password="x")
    assert rental_overview(other, 2026, today=TODAY)["properties"] == []


def test_modo_renta_has_a_rental_block(user, flat, lease):
    pay(user, lease, 1)
    data = get_adapter("ES").declare(user, 2026)
    [row] = data["rental_income"]["properties"]
    assert (row["name"], row["income"]) == ("Av. Torrente", "400.00")
    assert data["summary"]["rental_net_reduced"] == data["rental_income"]["net_reduced_total"]
    assert any(w["kind"] == "rental_missing_payments" for w in data["warnings"])


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_overview_endpoint(client, lease):
    resp = client.get("/api/rental/overview/?year=2026")
    assert resp.status_code == 200
    assert resp.data["properties"][0]["property"]["name"] == "Av. Torrente"


def test_rental_endpoints_need_a_spanish_tax_country(client, user, lease):
    s = Settings.load(user)
    s.tax_country = "DE"
    s.save()
    assert client.get("/api/rental/overview/?year=2026").status_code == 404
    assert client.post("/api/rental/simulate/", {"year": 2026}, format="json").status_code == 404


def test_simulate_endpoint(client):
    payload = {
        "year": 2025,
        "income": "9600",
        "days_rented": 365,
        "repairs": "300",
        "taxes": "400",
        "community": "600",
        "insurance": "200",
        "acquisition_price": "150000",
        "acquisition_costs": "15000",
        "cadastral_value": "80000",
        "cadastral_construction_value": "48000",
        "furniture_value": "5000",
        "reduction_pct": "60",
        "other_general_base": "30000",
    }
    resp = client.post("/api/rental/simulate/", payload, format="json")
    assert resp.status_code == 200
    assert resp.data["net_reduced"] == "1852.00"


def test_simulate_rejects_bad_percentages(client):
    resp = client.post("/api/rental/simulate/", {"year": 2025, "reduction_pct": "150"}, format="json")
    assert resp.status_code == 400
