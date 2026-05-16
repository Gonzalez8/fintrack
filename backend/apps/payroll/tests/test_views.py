"""Tests for Payroll/Employer CRUD endpoints."""

import contextlib
import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.payroll.models import Employer, Payroll

User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def user(db):
    return User.objects.create_user(username="payroll-user", password="testpass123")


@pytest.fixture
def other_user(db):
    return User.objects.create_user(username="payroll-other", password="otherpass123")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def client2(other_user):
    c = APIClient()
    c.force_authenticate(user=other_user)
    return c


@pytest.fixture
def employer(user):
    return Employer.objects.create(owner=user, name="Acme Corp", cif="B12345678")


@pytest.fixture
def employer_other(other_user):
    return Employer.objects.create(owner=other_user, name="Other Corp", cif="B99999999")


@pytest.fixture
def payroll(user, employer):
    return Payroll.objects.create(
        owner=user,
        employer=employer,
        period_start=datetime.date(2026, 1, 1),
        period_end=datetime.date(2026, 1, 31),
        gross=Decimal("5523.40"),
        ss_employee=Decimal("332.38"),
        irpf_withholding=Decimal("1594.05"),
        net=Decimal("3596.97"),
        base_irpf=Decimal("5523.40"),
        base_cc=Decimal("5101.20"),
        employer_cost=Decimal("7195.54"),
    )


# ---------------------------------------------------------------------------
# Employer CRUD
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEmployerCRUD:
    def test_create_employer(self, client):
        payload = {"name": "Test S.L.", "cif": "B11111111"}
        res = client.post("/api/employers/", payload, format="json")
        assert res.status_code == 201
        assert res.data["name"] == "Test S.L."

    def test_list_employers(self, client, employer):
        res = client.get("/api/employers/")
        assert res.status_code == 200
        results = res.data.get("results", res.data)
        assert len(results) == 1
        assert results[0]["name"] == "Acme Corp"

    def test_update_employer(self, client, employer):
        res = client.patch(
            f"/api/employers/{employer.id}/",
            {"address": "C/ Mayor 1, Madrid"},
            format="json",
        )
        assert res.status_code == 200
        assert res.data["address"] == "C/ Mayor 1, Madrid"

    def test_delete_employer_without_payrolls(self, client, employer):
        res = client.delete(f"/api/employers/{employer.id}/")
        assert res.status_code == 204
        assert Employer.objects.filter(id=employer.id).count() == 0

    def test_delete_employer_with_payrolls_is_protected(self, client, employer, payroll):
        # PROTECT raises ProtectedError; we only assert the employer survives
        # the delete attempt regardless of the response shape.
        with contextlib.suppress(Exception):
            client.delete(f"/api/employers/{employer.id}/")
        assert Employer.objects.filter(id=employer.id).exists()

    def test_employer_unique_name_per_owner(self, client, employer):
        res = client.post("/api/employers/", {"name": "Acme Corp"}, format="json")
        assert res.status_code == 400

    def test_two_users_can_have_same_employer_name(self, client, client2, employer):
        # user1 already has "Acme Corp"; user2 should be able to create one too
        res = client2.post("/api/employers/", {"name": "Acme Corp"}, format="json")
        assert res.status_code == 201

    def test_employer_multi_tenancy(self, client, client2, employer):
        # user2 cannot see user1's employers
        res = client2.get("/api/employers/")
        results = res.data.get("results", res.data)
        assert len(results) == 0

        res = client2.get(f"/api/employers/{employer.id}/")
        assert res.status_code == 404


# ---------------------------------------------------------------------------
# Payroll CRUD
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPayrollCRUD:
    def test_create_payroll(self, client, employer):
        payload = {
            "employer": str(employer.id),
            "period_start": "2026-02-01",
            "period_end": "2026-02-28",
            "gross": "5523.40",
            "ss_employee": "332.38",
            "irpf_withholding": "1594.05",
            "net": "3596.97",
        }
        res = client.post("/api/payrolls/", payload, format="json")
        assert res.status_code == 201
        assert res.data["gross"] == "5523.40"
        assert res.data["irpf_rate"] == "28.86"
        assert res.data["employer_name"] == "Acme Corp"

    def test_list_payrolls(self, client, payroll):
        res = client.get("/api/payrolls/")
        assert res.status_code == 200
        results = res.data.get("results", res.data)
        assert len(results) == 1
        assert results[0]["employer_name"] == "Acme Corp"

    def test_filter_by_year(self, client, user, employer):
        Payroll.objects.create(
            owner=user,
            employer=employer,
            period_start=datetime.date(2025, 12, 1),
            period_end=datetime.date(2025, 12, 31),
            gross=Decimal("5000"),
            ss_employee=Decimal("300"),
            irpf_withholding=Decimal("1400"),
            net=Decimal("3300"),
        )
        Payroll.objects.create(
            owner=user,
            employer=employer,
            period_start=datetime.date(2026, 1, 1),
            period_end=datetime.date(2026, 1, 31),
            gross=Decimal("5500"),
            ss_employee=Decimal("330"),
            irpf_withholding=Decimal("1590"),
            net=Decimal("3580"),
        )
        res = client.get("/api/payrolls/?year=2026")
        results = res.data.get("results", res.data)
        assert len(results) == 1

    def test_filter_by_employer(self, client, user, employer):
        other_employer = Employer.objects.create(owner=user, name="Other Inc")
        Payroll.objects.create(
            owner=user,
            employer=employer,
            period_start=datetime.date(2026, 1, 1),
            period_end=datetime.date(2026, 1, 31),
            gross=Decimal("5000"),
            ss_employee=Decimal("300"),
            irpf_withholding=Decimal("1400"),
            net=Decimal("3300"),
        )
        Payroll.objects.create(
            owner=user,
            employer=other_employer,
            period_start=datetime.date(2026, 1, 1),
            period_end=datetime.date(2026, 1, 31),
            gross=Decimal("3000"),
            ss_employee=Decimal("180"),
            irpf_withholding=Decimal("600"),
            net=Decimal("2220"),
        )
        res = client.get(f"/api/payrolls/?employer_id={other_employer.id}")
        results = res.data.get("results", res.data)
        assert len(results) == 1
        assert results[0]["gross"] == "3000.00"

    def test_period_end_before_start_is_rejected(self, client, employer):
        payload = {
            "employer": str(employer.id),
            "period_start": "2026-02-28",
            "period_end": "2026-02-01",
            "gross": "5000",
            "ss_employee": "300",
            "irpf_withholding": "1400",
            "net": "3300",
        }
        res = client.post("/api/payrolls/", payload, format="json")
        assert res.status_code == 400
        assert "period_end" in res.data

    def test_unique_period_per_employer(self, client, employer, payroll):
        # Same period for the same employer → conflict on the unique constraint
        payload = {
            "employer": str(employer.id),
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
            "gross": "5000",
            "ss_employee": "300",
            "irpf_withholding": "1400",
            "net": "3300",
        }
        res = client.post("/api/payrolls/", payload, format="json")
        assert res.status_code == 400

    def test_payroll_multi_tenancy(self, client, client2, payroll):
        res = client2.get("/api/payrolls/")
        results = res.data.get("results", res.data)
        assert len(results) == 0

        res = client2.get(f"/api/payrolls/{payroll.id}/")
        assert res.status_code == 404

    def test_cannot_use_other_users_employer(self, client, employer_other):
        """Cross-tenant FK validation — even if you guess the UUID, the
        serializer must reject an employer you don't own."""
        payload = {
            "employer": str(employer_other.id),
            "period_start": "2026-02-01",
            "period_end": "2026-02-28",
            "gross": "5000",
            "ss_employee": "300",
            "irpf_withholding": "1400",
            "net": "3300",
        }
        res = client.post("/api/payrolls/", payload, format="json")
        assert res.status_code == 400


# ---------------------------------------------------------------------------
# Computed fields & soft validations (warnings, never errors)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPayrollSoftValidations:
    def test_irpf_rate_computed(self, client, payroll):
        res = client.get(f"/api/payrolls/{payroll.id}/")
        assert res.data["irpf_rate"] == "28.86"

    def test_irpf_rate_null_when_gross_zero(self, client, user, employer):
        p = Payroll.objects.create(
            owner=user,
            employer=employer,
            period_start=datetime.date(2026, 1, 1),
            period_end=datetime.date(2026, 1, 31),
            gross=Decimal("0"),
            ss_employee=Decimal("0"),
            irpf_withholding=Decimal("0"),
            net=Decimal("0"),
        )
        res = client.get(f"/api/payrolls/{p.id}/")
        assert res.data["irpf_rate"] is None

    def test_net_mismatch_field_reports_delta(self, client, user, employer):
        # Anticipo de 100 €: gross - ss - irpf = 3500 pero net = 3400
        p = Payroll.objects.create(
            owner=user,
            employer=employer,
            period_start=datetime.date(2026, 1, 1),
            period_end=datetime.date(2026, 1, 31),
            gross=Decimal("5000"),
            ss_employee=Decimal("300"),
            irpf_withholding=Decimal("1200"),
            net=Decimal("3400"),
        )
        res = client.get(f"/api/payrolls/{p.id}/")
        # Expected = 5000 - 300 - 1200 = 3500. Net = 3400. Delta = +100.
        assert res.data["net_mismatch"] == "100.00"

    def test_payroll_with_mismatched_net_is_still_saved(self, client, employer):
        """Conciliation is informational — saving must succeed even when
        gross - ss - irpf != net (anticipos, embargos, dietas exentas, etc.)."""
        payload = {
            "employer": str(employer.id),
            "period_start": "2026-03-01",
            "period_end": "2026-03-31",
            "gross": "5000",
            "ss_employee": "300",
            "irpf_withholding": "1200",
            "net": "3400",  # mismatched on purpose
        }
        res = client.post("/api/payrolls/", payload, format="json")
        assert res.status_code == 201

    def test_payroll_with_irpf_above_gross_is_still_saved(self, client, employer):
        """Withholding > gross can happen with regularizations / atrasos.
        The serializer must not reject it."""
        payload = {
            "employer": str(employer.id),
            "period_start": "2026-04-01",
            "period_end": "2026-04-30",
            "gross": "1000",
            "ss_employee": "0",
            "irpf_withholding": "1500",
            "net": "-500",
        }
        res = client.post("/api/payrolls/", payload, format="json")
        assert res.status_code == 201
