"""Tests for the Spanish (ES) tax-declaration adapter — Modo Renta backend."""

import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from apps.assets.models import Account, Asset, Settings
from apps.reports.tax_adapters import get_adapter
from apps.transactions.models import Dividend, Interest, Transaction


def tax_declaration(user, year):
    """Test shim for backwards compatibility with the previous import path."""
    return get_adapter("ES").declare(user, year)


User = get_user_model()

YEAR = 2025


@pytest.fixture
def user(db):
    return User.objects.create_user(username="rentauser", password="testpass123")


@pytest.fixture
def account(user):
    return Account.objects.create(
        owner=user,
        name="Main",
        type=Account.AccountType.OPERATIVA,
        currency="EUR",
        balance=Decimal("0"),
    )


@pytest.fixture
def account_tr(user):
    return Account.objects.create(
        owner=user,
        name="Trade Republic",
        type=Account.AccountType.OPERATIVA,
        currency="EUR",
        balance=Decimal("0"),
    )


@pytest.fixture
def account_big(user):
    return Account.objects.create(
        owner=user,
        name="Banco Big",
        type=Account.AccountType.OPERATIVA,
        currency="EUR",
        balance=Decimal("0"),
    )


@pytest.fixture
def asset_es(user):
    return Asset.objects.create(
        owner=user,
        name="Iberdrola",
        ticker="IBE",
        type=Asset.AssetType.STOCK,
        currency="EUR",
        issuer_country="ES",
        withholding_country="ES",
        current_price=Decimal("12.00"),
    )


@pytest.fixture
def asset_us(user):
    return Asset.objects.create(
        owner=user,
        name="Apple",
        ticker="AAPL",
        type=Asset.AssetType.STOCK,
        currency="USD",
        issuer_country="US",
        withholding_country="US",
        current_price=Decimal("180.00"),
    )


@pytest.fixture
def asset_cn(user):
    return Asset.objects.create(
        owner=user,
        name="Tencent",
        ticker="TCEHY",
        type=Asset.AssetType.STOCK,
        currency="USD",
        issuer_country="CN",
        withholding_country="CN",
        current_price=Decimal("40.00"),
    )


@pytest.fixture
def asset_no_country(user):
    return Asset.objects.create(
        owner=user,
        name="Mystery Stock",
        ticker="MYST",
        type=Asset.AssetType.STOCK,
        currency="EUR",
        current_price=Decimal("5.00"),
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _div(user, asset, date, gross, tax, net, commission=Decimal("0")):
    return Dividend.objects.create(
        owner=user,
        asset=asset,
        date=date,
        gross=gross,
        tax=tax,
        commission=commission,
        net=net,
    )


def _interest(user, account, date_end, gross, net, tax=None, commission=Decimal("0")):
    return Interest.objects.create(
        owner=user,
        account=account,
        date_start=date_end - datetime.timedelta(days=30),
        date_end=date_end,
        gross=gross,
        tax=tax,
        commission=commission,
        net=net,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_dividends_separates_es_vs_foreign(user, asset_es, asset_us):
    _div(user, asset_es, datetime.date(YEAR, 6, 1), Decimal("100.00"), Decimal("19.00"), Decimal("81.00"))
    _div(user, asset_us, datetime.date(YEAR, 6, 1), Decimal("88.39"), Decimal("17.47"), Decimal("70.92"))

    out = tax_declaration(user, YEAR)
    div = out["dividends"]

    assert div["gross_total"] == "188.39"
    # Spanish withholding only includes ES rows
    assert div["withholding_es"] == "19.00"
    # Total withholding includes both ES and foreign
    assert div["withholding_total"] == "36.47"
    # net_informative = sum(net), already discounts ALL withholdings (ES + foreign)
    assert div["net_informative"] == "151.92"


def test_double_taxation_per_country_default_15_pct(user, asset_us, asset_cn):
    # Plan example: US 88.39 → 13.26, CN 7.11 → 0.85
    _div(user, asset_us, datetime.date(YEAR, 7, 1), Decimal("88.39"), Decimal("17.47"), Decimal("70.92"))
    _div(user, asset_cn, datetime.date(YEAR, 8, 1), Decimal("7.11"), Decimal("0.85"), Decimal("6.26"))

    out = tax_declaration(user, YEAR)
    dt = out["double_taxation"]

    assert dt["foreign_gross_total"] == "95.50"
    by_country = {row["country"]: row for row in dt["by_country"]}

    us = by_country["US"]
    assert us["gross"] == "88.39"
    assert us["withholding"] == "17.47"
    assert us["limit"] == "13.26"  # 88.39 * 0.15
    assert us["deductible"] == "13.26"  # min(17.47, 13.26)
    assert us["is_default_rate"] is True

    cn = by_country["CN"]
    assert cn["gross"] == "7.11"
    assert cn["withholding"] == "0.85"
    assert cn["limit"] == "1.07"  # 7.11 * 0.15 = 1.0665 → 1.07
    assert cn["deductible"] == "0.85"  # min(0.85, 1.07)

    # Total deductible 13.26 + 0.85 = 14.11 (NOT 17.47 — we cap per country)
    assert dt["deductible_total"] == "14.11"


def test_double_taxation_uses_user_treaty_override(user, asset_us):
    _div(user, asset_us, datetime.date(YEAR, 7, 1), Decimal("88.39"), Decimal("17.47"), Decimal("70.92"))

    s = Settings.load(user)
    s.tax_treaty_limits = {"US": "0.10"}
    s.save()

    out = tax_declaration(user, YEAR)
    us = next(row for row in out["double_taxation"]["by_country"] if row["country"] == "US")

    assert us["rate_applied"] == "0.10"
    assert us["is_default_rate"] is False
    # 88.39 * 0.10 = 8.839 → quantize 0.01 → 8.84
    assert us["limit"] == "8.84"
    assert us["deductible"] == "8.84"


def test_double_taxation_info_appears_when_foreign_present(user, asset_us):
    _div(user, asset_us, datetime.date(YEAR, 7, 1), Decimal("100.00"), Decimal("15.00"), Decimal("85.00"))

    out = tax_declaration(user, YEAR)

    info_kinds = [i["kind"] for i in out["infos"]]
    assert "double_taxation_applied" in info_kinds


def test_interests_uses_explicit_tax_when_not_null(user, account_big):
    # Big with explicit withholding tax = 4.00
    _interest(
        user,
        account_big,
        datetime.date(YEAR, 12, 31),
        gross=Decimal("20.00"),
        tax=Decimal("4.00"),
        net=Decimal("16.00"),
    )

    out = tax_declaration(user, YEAR)
    intr = out["interests"]

    assert intr["gross"] == "20.00"
    assert intr["withholding"] == "4.00"
    assert intr["net"] == "16.00"


def test_interests_zero_tax_explicit_is_respected(user, account_tr):
    # Trade Republic pre-IBAN ES: confirmed no withholding (tax = 0, NOT null)
    _interest(
        user,
        account_tr,
        datetime.date(YEAR, 12, 31),
        gross=Decimal("12.00"),
        tax=Decimal("0"),
        net=Decimal("12.00"),
    )

    out = tax_declaration(user, YEAR)
    assert out["interests"]["gross"] == "12.00"
    assert out["interests"]["withholding"] == "0.00"


def test_interests_null_tax_is_inferred(user, account_tr):
    # Imported / legacy row: tax is NULL → infer from gross - net - commission
    _interest(
        user,
        account_tr,
        datetime.date(YEAR, 12, 31),
        gross=Decimal("20.00"),
        tax=None,
        net=Decimal("16.00"),
    )

    out = tax_declaration(user, YEAR)
    # Inferred withholding = 20 - 16 - 0 = 4
    assert out["interests"]["withholding"] == "4.00"


def test_capital_gains_uses_realized_pnl_directly_no_double_discount(user, account, asset_es, settings=None):
    # Buy 10 @ 10 with 1.00 commission → cost basis = 100 + 1 = 101
    Transaction.objects.create(
        owner=user,
        asset=asset_es,
        account=account,
        date=datetime.date(YEAR - 1, 1, 10),
        type=Transaction.TransactionType.BUY,
        quantity=Decimal("10"),
        price=Decimal("10.00"),
        commission=Decimal("1.00"),
        tax=Decimal("0"),
    )
    # Sell 10 @ 15 with 2.00 commission → proceeds = 150 - 2 = 148, pnl = 148 - 101 = 47
    Transaction.objects.create(
        owner=user,
        asset=asset_es,
        account=account,
        date=datetime.date(YEAR, 6, 1),
        type=Transaction.TransactionType.SELL,
        quantity=Decimal("10"),
        price=Decimal("15.00"),
        commission=Decimal("2.00"),
        tax=Decimal("0"),
    )

    out = tax_declaration(user, YEAR)
    cg = out["capital_gains"]

    assert cg["transmission_total"] == "148.00"
    assert cg["acquisition_total"] == "101.00"
    assert cg["net_result"] == "47.00"
    assert cg["total_gains"] == "47.00"
    assert cg["total_losses"] == "0.00"
    assert len(cg["rows"]) == 1


def test_warning_missing_tax_country_for_foreign_div(user, asset_no_country):
    _div(user, asset_no_country, datetime.date(YEAR, 6, 1), Decimal("50.00"), Decimal("5.00"), Decimal("45.00"))

    out = tax_declaration(user, YEAR)
    kinds = [w["kind"] for w in out["warnings"]]
    assert "missing_tax_country" in kinds


def test_warning_net_mismatch_in_dividend(user, asset_es):
    # gross 100, tax 0, commission 0, net 90 → 100 - 0 - 0 = 100, but net = 90 → mismatch
    _div(user, asset_es, datetime.date(YEAR, 6, 1), Decimal("100.00"), Decimal("0"), Decimal("90.00"))

    out = tax_declaration(user, YEAR)
    kinds = [w["kind"] for w in out["warnings"]]
    assert "net_mismatch" in kinds


def test_year_filter_only_returns_year_data(user, asset_es):
    _div(user, asset_es, datetime.date(YEAR - 1, 6, 1), Decimal("100.00"), Decimal("19.00"), Decimal("81.00"))
    _div(user, asset_es, datetime.date(YEAR, 6, 1), Decimal("50.00"), Decimal("9.50"), Decimal("40.50"))

    out = tax_declaration(user, YEAR)
    assert out["dividends"]["gross_total"] == "50.00"


def test_summary_replicates_block_totals(user, asset_es, asset_us):
    _div(user, asset_es, datetime.date(YEAR, 6, 1), Decimal("100.00"), Decimal("19.00"), Decimal("81.00"))
    _div(user, asset_us, datetime.date(YEAR, 6, 1), Decimal("88.39"), Decimal("17.47"), Decimal("70.92"))

    out = tax_declaration(user, YEAR)
    s = out["summary"]

    assert s["dividends_gross"] == out["dividends"]["gross_total"]
    assert s["dividends_withholding_es"] == out["dividends"]["withholding_es"]
    assert s["double_taxation_foreign_gross"] == out["double_taxation"]["foreign_gross_total"]
    assert s["double_taxation_deductible"] == out["double_taxation"]["deductible_total"]
