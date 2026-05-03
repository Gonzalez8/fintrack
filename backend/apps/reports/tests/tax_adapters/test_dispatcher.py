"""Tests for the tax-adapter registry / dispatcher.

Endpoint-level tests for the country gate live in
``apps/reports/tests/test_views.py::TestTaxDeclarationCountryGate``. This file
exercises the registry in isolation.
"""

from apps.reports.tax_adapters import (
    get_adapter,
    register,
    supported_tax_countries,
)


def test_es_adapter_is_registered():
    adapter = get_adapter("ES")
    assert adapter is not None
    assert adapter.country_code == "ES"


def test_get_adapter_is_case_insensitive():
    assert get_adapter("ES") is get_adapter("es")
    assert get_adapter("Es") is get_adapter("ES")


def test_get_adapter_returns_none_for_unsupported():
    assert get_adapter("DE") is None
    assert get_adapter("ZZ") is None


def test_get_adapter_handles_empty_input():
    assert get_adapter("") is None
    assert get_adapter(None) is None


def test_supported_tax_countries_contains_es():
    assert "ES" in supported_tax_countries()


def test_supported_tax_countries_is_immutable():
    assert isinstance(supported_tax_countries(), frozenset)


def test_register_overwrites_previous_adapter():
    """Re-registering the same code replaces the previous adapter (used in tests)."""
    original = get_adapter("ES")

    class _Stub:
        country_code = "ES"

        def declare(self, user, year):
            return {"stub": True}

    stub = _Stub()
    try:
        register("ES", stub)
        assert get_adapter("ES") is stub
    finally:
        register("ES", original)
        assert get_adapter("ES") is original
