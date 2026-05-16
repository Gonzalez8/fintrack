"""Tests for the Spanish payslip text-parser.

These tests exercise ``parse_payslip_text`` (a pure function from raw text to
a suggestion dict) so we don't need real PDFs in CI. The thin pdfplumber
wrapper ``extract_text`` is covered via mocking in ``test_parse_pdf_view``.
"""

from decimal import Decimal
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.payroll.services.pdf_parser import (
    parse_es_decimal,
    parse_payslip_text,
)

User = get_user_model()

FIXTURE_DIR = Path(__file__).parent / "fixtures"
PAYSLIP_TEXT = (FIXTURE_DIR / "payslip_sample.txt").read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# parse_es_decimal
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("1.594,05", Decimal("1594.05")),
        ("5.523,40", Decimal("5523.40")),
        ("259,84", Decimal("259.84")),
        ("0,00", Decimal("0.00")),
        ("100", Decimal("100")),
        ("-100,50", Decimal("-100.50")),
        ("", None),
        ("abc", None),
        ("--", None),
    ],
)
def test_parse_es_decimal(raw, expected):
    assert parse_es_decimal(raw) == expected


# ---------------------------------------------------------------------------
# parse_payslip_text — known-good fixture
# ---------------------------------------------------------------------------


def test_parses_full_spanish_payslip():
    result = parse_payslip_text(PAYSLIP_TEXT)
    s = result["suggested"]

    assert s["period_start"] == "2026-01-01"
    assert s["period_end"] == "2026-01-31"
    assert s["concept"] == "Mensual"

    # The fixture mirrors the user's January 2026 payslip with anonymised
    # employer data. The numeric assertions track the real payslip values.
    assert s["gross"] == "5523.40"
    assert s["net"] == "3596.97"
    assert s["irpf_withholding"] == "1594.05"
    assert s["base_irpf"] == "5523.40"
    assert s["base_cc"] == "5101.20"
    assert s["employer_cost"] == "7195.54"

    # ss_employee = 239.76 + 7.65 + 0.80 + 5.10 + 79.07 = 332.38
    assert s["ss_employee"] == "332.38"

    # Employer extracted from header
    assert s["employer_name"] == "ACME DEMO S.L."
    assert s["employer_cif"] == "B12345678"

    # All 7 numeric fields detected → confidence == 1.0
    assert result["confidence"] == 1.0


def test_period_split_across_lines():
    """pdfplumber sometimes splits the period across rows. The fallback
    normalises whitespace (collapses every \\s+ run to a single space) so the
    regex still matches.

    Real example from "Extra Febrero 2025": the year of the period_end ends
    up on the next line.
    """
    text = "08/13216175-88 1 000098 INCENTIVO 2S 2024 - 1 Julio 2024 a 31 Diciembre\n2024 180\n"
    out = parse_payslip_text(text)
    assert out["suggested"]["concept"] == "INCENTIVO 2S 2024"
    assert out["suggested"]["period_start"] == "2024-07-01"
    assert out["suggested"]["period_end"] == "2024-12-31"


def test_period_with_em_dash():
    """Some templates use Unicode em-dash (—) instead of ASCII '-'. The
    normaliser should map it before the regex runs."""
    text = "Atrasos Convenio — 1 Enero 2025 a 31 Agosto 2025\n"
    out = parse_payslip_text(text)
    assert out["suggested"]["concept"] == "Atrasos Convenio"
    assert out["suggested"]["period_start"] == "2025-01-01"


def test_period_with_en_dash():
    """En-dash variant (–) should also be normalised to '-'."""
    text = "Mensual – 1 Agosto 2025 a 31 Agosto 2025\n"
    out = parse_payslip_text(text)
    assert out["suggested"]["concept"] == "Mensual"
    assert out["suggested"]["period_start"] == "2025-08-01"


def test_period_chaos_layout():
    """If pdfplumber outputs every column as a separate line we still
    recover both period and concept via whitespace normalisation."""
    text = "08/13216175-88 1\n000098 Mensual -\n1 Junio 2025 a\n30 Junio 2025\n30\n"
    out = parse_payslip_text(text)
    assert out["suggested"]["concept"] == "Mensual"
    assert out["suggested"]["period_start"] == "2025-06-01"
    assert out["suggested"]["period_end"] == "2025-06-30"


def test_parses_concept_from_extras():
    """Concept extraction works for non-monthly payslips: incentivos, atrasos…"""
    incentivo = (
        "0807907203 000098 INCENT. EMPRESA 1S - 1 Enero 2025 a 30 Junio 2025 180\n"
        "Líquido a Percibir\n4435,33\n"
        "REM. TOTAL\n6320,00\nTributación IRPF(28.28%) 1787,28\n"
        "Base sujeta a retención I.R.P.F. 6320,00\n"
    )
    out = parse_payslip_text(incentivo)
    assert out["suggested"]["concept"] == "INCENT. EMPRESA 1S"
    assert out["suggested"]["period_start"] == "2025-01-01"
    assert out["suggested"]["period_end"] == "2025-06-30"

    atrasos = (
        "000098 Atrasos Convenio - 1 Enero 2025 a 31 Agosto 2025 240\n"
        "Líquido a Percibir\n318,86\n"
        "REM. TOTAL\n453,90\nTributación IRPF(29.57%) 134,24\n"
        "Base sujeta a retención I.R.P.F. 453,90\n"
    )
    out = parse_payslip_text(atrasos)
    assert out["suggested"]["concept"] == "Atrasos Convenio"


def test_base_cc_returns_none_when_line_has_no_real_base():
    """Atrasos-style payslips collapse the IT line to a single number (the
    empresa contribution). Parser must NOT mistake that for the base."""
    text = (
        "Mensual - 1 Enero 2025 a 31 Agosto 2025 240\n"
        "Líquido a Percibir\n318,86\n"
        "REM. TOTAL\n453,90\nTributación IRPF(29.57%) 134,24\n"
        "Base Incapacidad Temporal Total 3,76\n"
        "Base sujeta a retención I.R.P.F. 453,90\n"
    )
    out = parse_payslip_text(text)
    assert out["suggested"]["base_cc"] is None


def test_base_cc_extracted_when_line_has_rate_and_aportacion():
    """Standard mensual line "<base> <rate>% <aportación>" → take the base."""
    text = "Mensual - 1 Enero 2025 a 31 Agosto 2025\nBase Incapacidad Temporal Total 4909,50 23,60 % 1158,64\n"
    out = parse_payslip_text(text)
    assert out["suggested"]["base_cc"] == "4909.50"


def test_employer_cost_uses_explicit_footer_when_present():
    """If "Coste Empresa : NNNN,NN" is present we trust it directly."""
    text = (
        "Mensual - 1 Enero 2026 a 31 Enero 2026\n"
        "Coste Empresa : 7195,54\n"
        "DETERMINACIÓN DE LAS BASES DE COTIZACIÓN\n"
        "Base Incapacidad Temporal Total 5101,20 23,60 % 1203,88\n"
    )
    out = parse_payslip_text(text)
    assert out["suggested"]["employer_cost"] == "7195.54"


def test_employer_cost_sums_aportacion_lines_when_footer_missing():
    """Most monthly templates omit the explicit footer — sum APORTACIÓN
    EMPRESA from the bottom block."""
    text = (
        "Mensual - 1 Agosto 2025 a 31 Agosto 2025\n"
        "DETERMINACIÓN DE LAS BASES DE COTIZACIÓN\n"
        "Base Incapacidad Temporal Total 4909,50 23,60 % 1158,64\n"
        "AT y EP 4909,50 2,05 % 100,65\n"
        "Desempleo 4909,50 5,50 % 270,02\n"
        "Formación Profesional 4909,50 0,60 % 29,46\n"
        "Fondo de garantía salarial 4909,50 0,20 % 9,82\n"
    )
    out = parse_payslip_text(text)
    # 1158.64 + 100.65 + 270.02 + 29.46 + 9.82 = 1568.59
    assert out["suggested"]["employer_cost"] == "1568.59"


def test_employer_cost_supports_variable_rate_layout():
    """Incentivo/extra payslips use "% Variable" instead of a numeric
    percentage; the empresa contribution is still the last number on the line."""
    text = (
        "INCENT. EMPRESA 1S - 1 Enero 2025 a 30 Junio 2025\n"
        "DETERMINACIÓN DE LAS BASES DE COTIZACIÓN\n"
        "Base Incapacidad Temporal Total 1380,85 % Variable 325,90\n"
        "AT y EP 1380,85 % Variable 28,30\n"
        "Desempleo 1380,85 % Variable 75,95\n"
        "Formación Profesional 1380,85 % Variable 8,30\n"
        "Fondo de garantía salarial 1380,85 % Variable 2,75\n"
    )
    out = parse_payslip_text(text)
    # 325.90 + 28.30 + 75.95 + 8.30 + 2.75 = 441.20
    assert out["suggested"]["employer_cost"] == "441.20"


def test_employer_cost_handles_atrasos_with_only_solidaridad():
    """Atrasos collapse the bottom block to a single line — sum still works."""
    text = (
        "Atrasos Convenio - 1 Enero 2025 a 31 Agosto 2025\n"
        "DETERMINACIÓN DE LAS BASES DE COTIZACIÓN\n"
        "Base Incapacidad Temporal Total 3,76\n"
    )
    out = parse_payslip_text(text)
    assert out["suggested"]["employer_cost"] == "3.76"


def test_base_cc_extracted_when_rate_is_variable():
    """% Variable layout (incentives) still has 2 numbers → take the base."""
    text = "Mensual - 1 Enero 2025 a 31 Agosto 2025\nBase Incapacidad Temporal Total 1380,85 % Variable 325,90\n"
    out = parse_payslip_text(text)
    assert out["suggested"]["base_cc"] == "1380.85"


def test_parses_payslip_without_period_block():
    """If the period sentence is missing we still return numeric fields."""
    text = PAYSLIP_TEXT.replace("Mensual - 1 Enero 2026 a 31 Enero 2026", "Mensual")
    result = parse_payslip_text(text)
    assert result["suggested"]["period_start"] is None
    assert result["suggested"]["period_end"] is None
    # Numeric extraction unaffected
    assert result["suggested"]["gross"] == "5523.40"
    assert any("Periodo no detectado" in w for w in result["warnings"])


# ---------------------------------------------------------------------------
# parse_payslip_text — irrelevant inputs
# ---------------------------------------------------------------------------


def test_irrelevant_text_yields_low_confidence():
    text = "This is just an invoice. No payroll fields here.\nAmount: 100€"
    result = parse_payslip_text(text)
    assert result["confidence"] < 0.3
    assert result["suggested"]["gross"] is None


def test_empty_text_yields_zero_confidence():
    result = parse_payslip_text("")
    assert result["confidence"] == 0.0
    for field in (
        "gross",
        "ss_employee",
        "irpf_withholding",
        "net",
        "base_irpf",
        "base_cc",
        "employer_cost",
    ):
        assert result["suggested"][field] is None


# ---------------------------------------------------------------------------
# View — POST /api/payrolls/parse-pdf/
# ---------------------------------------------------------------------------


@pytest.fixture
def user(db):
    return User.objects.create_user(username="parse-user", password="testpass123")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
class TestParsePdfView:
    def _upload(self, client, *, content=b"%PDF-fake", text=PAYSLIP_TEXT):
        """Upload `content` as the PDF file, mocking pdfplumber to return `text`."""
        upload = BytesIO(content)
        upload.name = "test.pdf"
        # Patch extract_text so we don't need a real PDF in tests.
        with patch(
            "apps.payroll.services.pdf_parser.extract_text",
            return_value=text,
        ):
            return client.post("/api/payrolls/parse-pdf/", {"file": upload}, format="multipart")

    def test_success_returns_suggested_fields(self, client):
        res = self._upload(client)
        assert res.status_code == 200
        assert res.data["suggested"]["gross"] == "5523.40"
        assert res.data["confidence"] == 1.0

    def test_unrecognised_pdf_returns_422(self, client):
        res = self._upload(client, text="This is just text without payroll terms.")
        assert res.status_code == 422
        assert "PDF no reconocido" in res.data["detail"]

    def test_missing_file_returns_400(self, client):
        res = client.post("/api/payrolls/parse-pdf/", {}, format="multipart")
        assert res.status_code == 400

    def test_anonymous_request_is_rejected(self):
        c = APIClient()
        upload = BytesIO(b"%PDF-fake")
        upload.name = "test.pdf"
        res = c.post("/api/payrolls/parse-pdf/", {"file": upload}, format="multipart")
        assert res.status_code == 401

    def test_pdfplumber_failure_returns_422(self, client):
        upload = BytesIO(b"corrupted")
        upload.name = "test.pdf"
        with patch(
            "apps.payroll.services.pdf_parser.extract_text",
            side_effect=ValueError("invalid PDF"),
        ):
            res = client.post("/api/payrolls/parse-pdf/", {"file": upload}, format="multipart")
        assert res.status_code == 422
