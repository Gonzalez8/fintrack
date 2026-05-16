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

    def test_unique_period_concept_per_employer(self, client, employer, payroll):
        """Same (employer, period, concept) → conflict on the unique constraint."""
        payload = {
            "employer": str(employer.id),
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
            # Match the default concept of the `payroll` fixture (which is "")
            "concept": payroll.concept,
            "gross": "5000",
            "ss_employee": "300",
            "irpf_withholding": "1400",
            "net": "3300",
        }
        res = client.post("/api/payrolls/", payload, format="json")
        assert res.status_code == 400

    def test_same_period_different_concept_is_allowed(self, client, employer, payroll):
        """Two payslips sharing the same period but with different concepts
        (e.g. monthly salary + bonus for the same window) must coexist."""
        payload = {
            "employer": str(employer.id),
            "period_start": str(payroll.period_start),
            "period_end": str(payroll.period_end),
            "concept": "Bono extraordinario",
            "gross": "1500",
            "ss_employee": "0",
            "irpf_withholding": "300",
            "net": "1200",
        }
        res = client.post("/api/payrolls/", payload, format="json")
        assert res.status_code == 201
        assert res.data["concept"] == "Bono extraordinario"

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


# ---------------------------------------------------------------------------
# Payroll type (machine-readable classification)
# ---------------------------------------------------------------------------


class TestInferPayrollType:
    """Pure unit tests for the keyword inference. No DB."""

    @pytest.mark.parametrize(
        "concept,expected",
        [
            ("", "MONTHLY"),
            (None, "MONTHLY"),
            ("Mensual", "MONTHLY"),
            ("Enero 2025", "MONTHLY"),
            ("Diciembre 2025", "MONTHLY"),
            # Pagas extra y bonus comparten categoría — la analítica los
            # trata igual ("non-monthly extra payments").
            ("Extra Febrero 2025", "BONUS"),
            ("Paga Extra Verano", "BONUS"),
            ("EXTRA AGOSTO 2025 Part 2", "BONUS"),
            ("Bono Q3", "BONUS"),
            ("Bonus anual", "BONUS"),
            ("INCENTIVO EMPRESA 1S", "BONUS"),
            ("Variable", "BONUS"),
            ("Objetivos 2024", "BONUS"),
            ("Atrasos Convenio", "ATRASOS"),
            ("Atraso Junio", "ATRASOS"),
            ("Regularización IRPF", "ATRASOS"),
            ("Liquidación final", "OTHER"),
            ("Finiquito", "OTHER"),
            ("Indemnización", "OTHER"),
        ],
    )
    def test_classification(self, concept, expected):
        from apps.payroll.models import infer_payroll_type

        assert infer_payroll_type(concept) == expected

    def test_atrasos_wins_over_bonus_when_both_present(self):
        """An 'atrasos' payslip can mention 'extra' or 'bonus' in the
        period covered. The more specific keyword (atrasos) must win."""
        from apps.payroll.models import infer_payroll_type

        assert infer_payroll_type("Atrasos Extra Diciembre 2024") == "ATRASOS"


@pytest.mark.django_db
class TestPayrollTypeField:
    def test_create_defaults_to_monthly(self, client, employer):
        payload = {
            "employer": str(employer.id),
            "period_start": "2026-02-01",
            "period_end": "2026-02-28",
            "gross": "5000",
            "ss_employee": "300",
            "irpf_withholding": "1200",
            "net": "3500",
        }
        res = client.post("/api/payrolls/", payload, format="json")
        assert res.status_code == 201
        assert res.data["payroll_type"] == "MONTHLY"

    def test_create_accepts_explicit_type(self, client, employer):
        payload = {
            "employer": str(employer.id),
            "period_start": "2026-02-01",
            "period_end": "2026-02-28",
            "concept": "Bono Q1",
            "payroll_type": "BONUS",
            "gross": "5000",
            "ss_employee": "300",
            "irpf_withholding": "1200",
            "net": "3500",
        }
        res = client.post("/api/payrolls/", payload, format="json")
        assert res.status_code == 201
        assert res.data["payroll_type"] == "BONUS"

    def test_update_changes_type(self, client, payroll):
        # payroll fixture defaults to MONTHLY; flip to ATRASOS via PATCH.
        res = client.patch(
            f"/api/payrolls/{payroll.id}/",
            {"payroll_type": "ATRASOS"},
            format="json",
        )
        assert res.status_code == 200
        assert res.data["payroll_type"] == "ATRASOS"

    def test_invalid_type_rejected(self, client, employer):
        payload = {
            "employer": str(employer.id),
            "period_start": "2026-02-01",
            "period_end": "2026-02-28",
            "payroll_type": "NOT_A_TYPE",
            "gross": "5000",
            "ss_employee": "300",
            "irpf_withholding": "1200",
            "net": "3500",
        }
        res = client.post("/api/payrolls/", payload, format="json")
        assert res.status_code == 400


# ---------------------------------------------------------------------------
# Bulk endpoints
# ---------------------------------------------------------------------------


def _payload(employer_id, year, month, end_day, concept="Mensual"):
    return {
        "employer": str(employer_id),
        "period_start": f"{year}-{month:02d}-01",
        "period_end": f"{year}-{month:02d}-{end_day:02d}",
        "concept": concept,
        "gross": "5000.00",
        "ss_employee": "300.00",
        "irpf_withholding": "1200.00",
        "net": "3500.00",
    }


@pytest.mark.django_db
class TestPayrollBulkDelete:
    def test_deletes_only_requested_ids(self, client, user, employer):
        ids = []
        for m in (1, 2, 3):
            p = Payroll.objects.create(
                owner=user,
                employer=employer,
                period_start=datetime.date(2025, m, 1),
                period_end=datetime.date(2025, m, 28),
                gross=Decimal("5000"),
                ss_employee=Decimal("300"),
                irpf_withholding=Decimal("1200"),
                net=Decimal("3500"),
            )
            ids.append(str(p.id))
        # Delete only the first two
        res = client.post(
            "/api/payrolls/bulk-delete/",
            {"ids": ids[:2]},
            format="json",
        )
        assert res.status_code == 200
        assert res.data["deleted"] == 2
        assert Payroll.objects.filter(owner=user).count() == 1

    def test_empty_list_is_a_noop(self, client):
        res = client.post(
            "/api/payrolls/bulk-delete/",
            {"ids": []},
            format="json",
        )
        assert res.status_code == 200
        assert res.data["deleted"] == 0

    def test_rejects_non_list_input(self, client):
        res = client.post(
            "/api/payrolls/bulk-delete/",
            {"ids": "not-a-list"},
            format="json",
        )
        assert res.status_code == 400

    def test_cannot_delete_other_users_payrolls(self, client, client2, other_user, employer_other):
        # user2 has a payroll under their own employer
        p = Payroll.objects.create(
            owner=other_user,
            employer=employer_other,
            period_start=datetime.date(2025, 1, 1),
            period_end=datetime.date(2025, 1, 31),
            gross=Decimal("1000"),
            ss_employee=Decimal("0"),
            irpf_withholding=Decimal("0"),
            net=Decimal("1000"),
        )
        # user1 tries to delete it
        res = client.post(
            "/api/payrolls/bulk-delete/",
            {"ids": [str(p.id)]},
            format="json",
        )
        assert res.status_code == 200
        # Reports 0 deletions and the record still exists.
        assert res.data["deleted"] == 0
        assert Payroll.objects.filter(id=p.id).exists()


@pytest.mark.django_db
class TestPayrollBulkCreate:
    def test_creates_all_in_one_transaction(self, client, employer):
        payloads = [
            _payload(employer.id, 2025, 1, 31),
            _payload(employer.id, 2025, 2, 28),
            _payload(employer.id, 2025, 3, 31),
        ]
        res = client.post(
            "/api/payrolls/bulk-create/",
            {"payrolls": payloads},
            format="json",
        )
        assert res.status_code == 201
        assert len(res.data["created"]) == 3
        # Verify they were actually persisted
        assert Payroll.objects.count() == 3

    def test_rolls_back_when_any_row_invalid(self, client, employer):
        payloads = [
            _payload(employer.id, 2025, 1, 31),
            # period_end < period_start → hard error
            {
                "employer": str(employer.id),
                "period_start": "2025-02-28",
                "period_end": "2025-02-01",
                "concept": "Invalid",
                "gross": "5000",
                "ss_employee": "300",
                "irpf_withholding": "1200",
                "net": "3500",
            },
            _payload(employer.id, 2025, 3, 31),
        ]
        res = client.post(
            "/api/payrolls/bulk-create/",
            {"payrolls": payloads},
            format="json",
        )
        assert res.status_code == 400
        assert "errors" in res.data
        assert res.data["errors"][0] is None  # row 0 OK
        assert res.data["errors"][1] is not None  # row 1 bad
        assert res.data["errors"][2] is None  # row 2 OK
        # Nothing was persisted
        assert Payroll.objects.count() == 0

    def test_empty_list_returns_empty_array(self, client):
        res = client.post(
            "/api/payrolls/bulk-create/",
            {"payrolls": []},
            format="json",
        )
        assert res.status_code == 201
        assert res.data["created"] == []

    def test_rejects_non_list_input(self, client):
        res = client.post(
            "/api/payrolls/bulk-create/",
            {"payrolls": "not-a-list"},
            format="json",
        )
        assert res.status_code == 400

    def test_owner_is_injected_per_item(self, client, user, employer):
        payloads = [_payload(employer.id, 2025, 4, 30)]
        res = client.post(
            "/api/payrolls/bulk-create/",
            {"payrolls": payloads},
            format="json",
        )
        assert res.status_code == 201
        # Loaded record must belong to the authenticated user
        p = Payroll.objects.get()
        assert p.owner == user

    def test_cannot_create_under_other_users_employer(self, client, employer_other):
        """Cross-tenant employer FK on bulk-create must be rejected like the
        single endpoint already does."""
        payloads = [_payload(employer_other.id, 2025, 5, 31)]
        res = client.post(
            "/api/payrolls/bulk-create/",
            {"payrolls": payloads},
            format="json",
        )
        assert res.status_code == 400
        assert Payroll.objects.count() == 0
