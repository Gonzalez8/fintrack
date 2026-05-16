"""Tests for the payslip-parser strategy registry.

The registry is the boundary between the view and any concrete parser
implementation, so the tests focus on the contract: swap a parser via
settings, fail loudly on misspelt names, register/unregister cycle.
"""

from io import BytesIO
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.payroll.services.parsers import (
    BUILTIN_DEFAULT,
    PayslipParseResult,
    get_default_parser,
    get_parser,
    list_parsers,
    register,
    unregister,
)
from apps.payroll.services.parsers.regex_es import RegexEsPayslipParser

User = get_user_model()


# ---------------------------------------------------------------------------
# Registry contract
# ---------------------------------------------------------------------------


def test_builtin_regex_parser_is_registered():
    parser = get_parser("regex-es")
    assert parser is not None
    assert parser.name == "regex-es"
    assert isinstance(parser, RegexEsPayslipParser)


def test_list_parsers_returns_at_least_the_default():
    names = list_parsers()
    assert BUILTIN_DEFAULT in names


def test_get_default_parser_returns_settings_choice(settings):
    settings.PAYSLIP_PARSER = "regex-es"
    parser = get_default_parser()
    assert parser.name == "regex-es"


def test_get_default_parser_fails_loudly_when_misconfigured(settings):
    settings.PAYSLIP_PARSER = "ai-claude-not-installed"
    with pytest.raises(RuntimeError) as exc:
        get_default_parser()
    msg = str(exc.value)
    assert "ai-claude-not-installed" in msg
    assert "Available" in msg


def test_register_then_unregister_roundtrip():
    class _Stub:
        name = "stub-parser"

        def parse(self, file_obj):
            return PayslipParseResult(suggested={}, confidence=0.0, parser_name=self.name)

    stub = _Stub()
    try:
        register(stub)
        assert get_parser("stub-parser") is stub
        assert "stub-parser" in list_parsers()
    finally:
        unregister("stub-parser")
    assert get_parser("stub-parser") is None


# ---------------------------------------------------------------------------
# View delegates to whatever parser the registry serves
# ---------------------------------------------------------------------------


@pytest.fixture
def user(db):
    return User.objects.create_user(username="registry-user", password="testpass123")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_view_uses_the_settings_selected_parser(settings, client):
    """Swap the default to a stub parser and check the view returns its
    output verbatim. Demonstrates that the view never calls the regex
    parser directly — Open/Closed satisfied."""

    class _FakeAiParser:
        name = "fake-ai"

        def parse(self, file_obj):
            return PayslipParseResult(
                suggested={
                    "period_start": "2030-01-01",
                    "period_end": "2030-01-31",
                    "concept": "AI-extracted",
                    "gross": "9999.99",
                    "ss_employee": "0",
                    "irpf_withholding": "0",
                    "net": "9999.99",
                    "base_irpf": None,
                    "base_cc": None,
                    "employer_cost": None,
                    "employer_name": None,
                    "employer_cif": None,
                },
                confidence=1.0,
                warnings=[],
                extracted_text="fake raw text",
                parser_name=self.name,
            )

    fake = _FakeAiParser()
    register(fake)
    settings.PAYSLIP_PARSER = "fake-ai"
    try:
        upload = BytesIO(b"any-bytes")
        upload.name = "any.pdf"
        res = client.post("/api/payrolls/parse-pdf/", {"file": upload}, format="multipart")
    finally:
        unregister("fake-ai")
    assert res.status_code == 200
    assert res.data["parser"] == "fake-ai"
    assert res.data["suggested"]["concept"] == "AI-extracted"
    assert res.data["suggested"]["gross"] == "9999.99"
    assert res.data["extracted_text"] == "fake raw text"


@pytest.mark.django_db
def test_view_returns_422_when_parser_says_low_confidence(settings, client):
    class _NoMatch:
        name = "no-match"

        def parse(self, file_obj):
            return PayslipParseResult(suggested={}, confidence=0.1, parser_name=self.name)

    register(_NoMatch())
    settings.PAYSLIP_PARSER = "no-match"
    try:
        upload = BytesIO(b"any-bytes")
        upload.name = "any.pdf"
        res = client.post("/api/payrolls/parse-pdf/", {"file": upload}, format="multipart")
    finally:
        unregister("no-match")
    assert res.status_code == 422
    assert res.data["parser"] == "no-match"


@pytest.mark.django_db
def test_view_uses_default_regex_parser_under_real_payslip(settings, client):
    """Sanity: with the built-in default, the view returns the same shape
    we've always returned for a known-good payslip. Confirms the new
    strategy layer didn't regress the regex parser."""
    from apps.payroll.tests.test_pdf_parser import PAYSLIP_TEXT

    settings.PAYSLIP_PARSER = "regex-es"
    upload = BytesIO(b"%PDF-fake")
    upload.name = "test.pdf"
    with patch(
        "apps.payroll.services.pdf_parser.extract_text",
        return_value=PAYSLIP_TEXT,
    ):
        res = client.post("/api/payrolls/parse-pdf/", {"file": upload}, format="multipart")
    assert res.status_code == 200
    assert res.data["parser"] == "regex-es"
    assert res.data["suggested"]["gross"] == "5523.40"
