"""
Tests for dividend drafts: matching rules, Yahoo detection (mocked), the
/api/dividend-suggestions/ endpoints, the daily task and backup round-trip.
"""

import datetime
import json
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.assets.models import Account, Asset
from apps.transactions.models import Dividend, DividendSuggestion, Transaction
from apps.transactions.serializers import DividendSuggestionSerializer
from apps.transactions.services import detect_dividends, uncovered_events

User = get_user_model()

FETCH = "apps.transactions.services._fetch_yahoo_dividend_data"
TODAY = datetime.date(2026, 11, 16)
D = datetime.date


# ---------------------------------------------------------------------------
# Fixtures & helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def user(db):
    return User.objects.create_user(username="divuser", password="testpass123")


@pytest.fixture
def user2(db):
    return User.objects.create_user(username="otherdiv", password="testpass123")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def account(user):
    return Account.objects.create(owner=user, name="Trade Republic", type=Account.AccountType.INVERSION, currency="EUR")


@pytest.fixture
def asset(user):
    return Asset.objects.create(
        owner=user,
        name="Apple",
        ticker="AAPL",
        currency="USD",
        price_mode=Asset.PriceMode.AUTO,
        current_price=Decimal("200"),
    )


def _buy(user, asset, account, date, qty, tx_type="BUY"):
    return Transaction.objects.create(
        owner=user,
        asset=asset,
        account=account,
        type=tx_type,
        date=date,
        quantity=Decimal(str(qty)),
        price=Decimal("10"),
    )


def _dividend(user, asset, date, gross="10.00", tax="1.50", domestic_tax="0"):
    gross, tax, domestic = Decimal(gross), Decimal(tax), Decimal(domestic_tax)
    return Dividend.objects.create(
        owner=user, asset=asset, date=date, gross=gross, tax=tax, domestic_tax=domestic, net=gross - tax - domestic
    )


def _yahoo(dividends, splits=(), currency="USD"):
    return patch(FETCH, return_value=(list(dividends), list(splits), currency))


QUARTERLY = [(D(2026, 2, 9), 0.26), (D(2026, 5, 11), 0.27), (D(2026, 8, 10), 0.27), (D(2026, 11, 12), 0.27)]


# ---------------------------------------------------------------------------
# Matching rule
# ---------------------------------------------------------------------------


class TestUncoveredEvents:
    def test_recorded_on_payment_date_covers_the_event(self):
        events = [(D(2026, 8, 10), 0.27), (D(2026, 11, 12), 0.27)]
        assert uncovered_events(events, [D(2026, 8, 14)]) == [(D(2026, 11, 12), 0.27)]

    def test_each_recorded_dividend_covers_one_event(self):
        monthly = [(D(2026, m, 1), 0.1) for m in (1, 2, 3)]
        # One record in January only covers January
        assert [d for d, _ in uncovered_events(monthly, [D(2026, 1, 15)])] == [D(2026, 2, 1), D(2026, 3, 1)]

    def test_small_margin_before_ex_date(self):
        events = [(D(2026, 8, 10), 0.27)]
        assert uncovered_events(events, [D(2026, 8, 5)]) == []
        assert uncovered_events(events, [D(2026, 7, 20)]) == events

    def test_last_event_window_is_bounded(self):
        events = [(D(2026, 1, 10), 0.5)]
        assert uncovered_events(events, [D(2026, 9, 1)]) == events


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestDetection:
    def test_only_the_missing_recent_dividend_is_suggested(self, user, asset, account):
        """User's case: dividends recorded up to August, Yahoo also has November."""
        _buy(user, asset, account, D(2025, 1, 10), 10)
        for paid in (D(2026, 2, 12), D(2026, 5, 14), D(2026, 8, 14)):
            _dividend(user, asset, paid)
        with _yahoo(QUARTERLY):
            created = detect_dividends(user, today=TODAY)
        assert [s.ex_date for s in created] == [D(2026, 11, 12)]
        s = created[0]
        assert s.status == DividendSuggestion.Status.PENDING
        assert (s.shares, s.amount_per_share, s.gross, s.currency) == (
            Decimal("10"),
            Decimal("0.27"),
            Decimal("2.70"),
            "USD",
        )

    def test_old_unrecorded_dividends_before_the_last_one_are_not_suggested(self, user, asset, account):
        """Rule 1: everything before the latest recorded dividend counts as handled."""
        _buy(user, asset, account, D(2025, 1, 10), 10)
        _dividend(user, asset, D(2026, 8, 14))
        with _yahoo(QUARTERLY):
            created = detect_dividends(user, today=TODAY)
        assert [s.ex_date for s in created] == [D(2026, 11, 12)]

    def test_asset_without_recorded_dividends_looks_back_one_year(self, user, asset, account):
        _buy(user, asset, account, D(2020, 1, 10), 10)
        events = [(D(2024, 11, 10), 0.25), (D(2025, 11, 10), 0.26), (D(2026, 5, 11), 0.27)]
        with _yahoo(events):
            created = detect_dividends(user, today=TODAY)
        assert [s.ex_date for s in created] == [D(2026, 5, 11)]

    def test_backfill_goes_back_to_the_first_purchase(self, user, asset, account):
        _buy(user, asset, account, D(2024, 1, 10), 10)
        _dividend(user, asset, D(2026, 5, 14))
        events = [(D(2023, 11, 10), 0.24), (D(2024, 11, 10), 0.25), (D(2025, 11, 10), 0.26), (D(2026, 5, 11), 0.27)]
        with _yahoo(events):
            created = detect_dividends(user, asset=asset, backfill=True, today=TODAY)
        # 2023 is before the first purchase; May 2026 is recorded
        assert [s.ex_date for s in created] == [D(2024, 11, 10), D(2025, 11, 10)]

    def test_shares_held_on_the_ex_date(self, user, asset, account):
        _buy(user, asset, account, D(2025, 1, 10), 10)
        _buy(user, asset, account, D(2026, 10, 1), 4, tx_type="SELL")
        _buy(user, asset, account, D(2026, 11, 12), 5)  # same day as ex-date: not entitled
        with _yahoo([(D(2026, 11, 12), 0.27)]):
            created = detect_dividends(user, today=TODAY)
        assert created[0].shares == Decimal("6")
        assert created[0].gross == Decimal("1.62")

    def test_no_draft_when_nothing_was_held(self, user, asset, account):
        _buy(user, asset, account, D(2025, 1, 10), 10)
        _buy(user, asset, account, D(2026, 10, 1), 10, tx_type="SELL")
        with _yahoo([(D(2026, 11, 12), 0.27)]):
            assert detect_dividends(user, today=TODAY) == []

    def test_split_adjusted_amount_is_scaled_back(self, user, asset, account):
        """BYD: 3:1 split on the same ex-date as the dividend; Yahoo divides that dividend by 3."""
        asset.ticker, asset.name, asset.currency = "1211.HK", "BYD", "HKD"
        asset.save()
        _buy(user, asset, account, D(2024, 4, 2), 15)
        _buy(user, asset, account, D(2026, 1, 27), 20)
        yahoo_dividends = [(D(2025, 6, 10), 1.4453), (D(2026, 6, 11), 0.4114)]
        with _yahoo(yahoo_dividends, splits=[(D(2025, 6, 10), 3.0)], currency="HKD"):
            created = detect_dividends(user, asset=asset, backfill=True, today=TODAY)
        by_date = {s.ex_date: s for s in created}
        before = by_date[D(2025, 6, 10)]
        assert (before.shares, before.amount_per_share, before.gross) == (
            Decimal("15"),
            Decimal("4.3359"),
            Decimal("65.04"),
        )
        after = by_date[D(2026, 6, 11)]
        assert (after.shares, after.amount_per_share, after.gross) == (
            Decimal("65"),
            Decimal("0.4114"),
            Decimal("26.74"),
        )

    def test_withholding_is_estimated_from_past_dividends(self, user, asset, account):
        _buy(user, asset, account, D(2025, 1, 10), 100)
        _dividend(user, asset, D(2026, 5, 14), gross="20.00", tax="3.00")
        _dividend(user, asset, D(2026, 8, 14), gross="20.00", tax="3.00")
        with _yahoo(QUARTERLY):
            s = detect_dividends(user, today=TODAY)[0]
        assert s.gross == Decimal("27.00")
        assert s.tax == Decimal("4.05")  # 15 %
        assert s.domestic_tax is None

    def test_domestic_retention_is_estimated_from_past_dividends(self, user, asset, account):
        _buy(user, asset, account, D(2025, 1, 10), 100)
        _dividend(user, asset, D(2026, 8, 14), gross="20.00", tax="3.00", domestic_tax="3.80")
        with _yahoo(QUARTERLY):
            s = detect_dividends(user, today=TODAY)[0]
        assert (s.tax, s.domestic_tax) == (Decimal("4.05"), Decimal("5.13"))  # 15 % and 19 % of 27.00
        res = DividendSuggestionSerializer(s).data
        assert Decimal(res["net"]) == Decimal("17.82")

    def test_no_withholding_estimate_without_history(self, user, asset, account):
        _buy(user, asset, account, D(2025, 1, 10), 10)
        with _yahoo(QUARTERLY):
            created = detect_dividends(user, today=TODAY)
        assert all(s.tax is None for s in created)

    def test_is_idempotent_and_respects_dismissed(self, user, asset, account):
        _buy(user, asset, account, D(2025, 1, 10), 10)
        _dividend(user, asset, D(2026, 8, 14))
        with _yahoo(QUARTERLY):
            s = detect_dividends(user, today=TODAY)[0]
            s.status = DividendSuggestion.Status.DISMISSED
            s.save()
            assert detect_dividends(user, today=TODAY) == []
        assert DividendSuggestion.objects.filter(owner=user).count() == 1

    def test_pending_draft_is_dismissed_once_recorded_manually(self, user, asset, account):
        _buy(user, asset, account, D(2025, 1, 10), 10)
        _dividend(user, asset, D(2026, 8, 14))
        with _yahoo(QUARTERLY):
            s = detect_dividends(user, today=TODAY)[0]
            _dividend(user, asset, D(2026, 11, 16))  # user adds it by hand
            detect_dividends(user, today=TODAY)
        s.refresh_from_db()
        assert s.status == DividendSuggestion.Status.DISMISSED

    def test_manual_priced_assets_are_skipped(self, user, asset, account):
        asset.price_mode = Asset.PriceMode.MANUAL
        asset.save()
        _buy(user, asset, account, D(2025, 1, 10), 10)
        with _yahoo(QUARTERLY) as fetch:
            assert detect_dividends(user, today=TODAY) == []
        fetch.assert_not_called()

    def test_yahoo_error_is_skipped(self, user, asset, account):
        _buy(user, asset, account, D(2025, 1, 10), 10)
        with patch(FETCH, side_effect=RuntimeError("boom")):
            assert detect_dividends(user, today=TODAY) == []


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


NOVEMBER_EX_DATE = D(2026, 11, 12)


def _draft(user, asset, ex_date=NOVEMBER_EX_DATE, status=DividendSuggestion.Status.PENDING):
    return DividendSuggestion.objects.create(
        owner=user,
        asset=asset,
        ex_date=ex_date,
        amount_per_share=Decimal("0.27"),
        currency="USD",
        shares=Decimal("10"),
        gross=Decimal("2.70"),
        tax=Decimal("0.41"),
        status=status,
    )


@pytest.mark.django_db
class TestSuggestionAPI:
    def test_list_pending(self, client, user, user2, asset):
        _draft(user, asset)
        _draft(user, asset, ex_date=D(2026, 8, 10), status=DividendSuggestion.Status.DISMISSED)
        other = Asset.objects.create(owner=user2, name="X", ticker="X", currency="USD")
        _draft(user2, other)

        res = client.get("/api/dividend-suggestions/", {"status": "PENDING"})
        assert res.data["count"] == 1
        row = res.data["results"][0]
        assert row["asset_ticker"] == "AAPL" and Decimal(row["net"]) == Decimal("2.29")

    def test_accept_creates_the_reviewed_dividend(self, client, user, asset):
        s = _draft(user, asset)
        payload = {
            "date": "2026-11-16",
            "shares": "10",
            "gross": "2.30",
            "tax": "0.35",
            "domestic_tax": "0.37",
            "net": "1.58",
        }
        res = client.post(f"/api/dividend-suggestions/{s.id}/accept/", payload, format="json")
        assert res.status_code == 201, res.data
        dividend = Dividend.objects.get(owner=user)
        # The user's corrected figures win over the draft's estimate
        assert (dividend.date, dividend.gross, dividend.domestic_tax, dividend.net, dividend.asset_id) == (
            D(2026, 11, 16),
            Decimal("2.30"),
            Decimal("0.37"),
            Decimal("1.58"),
            asset.id,
        )
        s.refresh_from_db()
        assert s.status == DividendSuggestion.Status.ACCEPTED and s.dividend_id == dividend.id

    def test_accept_ignores_a_different_asset_in_the_body(self, client, user, user2, asset):
        s = _draft(user, asset)
        other = Asset.objects.create(owner=user2, name="X", ticker="X", currency="USD")
        payload = {"date": "2026-11-16", "asset": str(other.id), "gross": "2.30", "tax": "0", "net": "2.30"}
        assert client.post(f"/api/dividend-suggestions/{s.id}/accept/", payload, format="json").status_code == 201
        assert Dividend.objects.get(owner=user).asset_id == asset.id

    def test_accept_twice_is_rejected(self, client, user, asset):
        s = _draft(user, asset, status=DividendSuggestion.Status.ACCEPTED)
        payload = {"date": "2026-11-16", "gross": "2.30", "tax": "0", "net": "2.30"}
        assert client.post(f"/api/dividend-suggestions/{s.id}/accept/", payload, format="json").status_code == 400
        assert not Dividend.objects.exists()

    def test_invalid_figures_do_not_accept(self, client, user, asset):
        s = _draft(user, asset)
        res = client.post(f"/api/dividend-suggestions/{s.id}/accept/", {"date": "nope"}, format="json")
        assert res.status_code == 400
        s.refresh_from_db()
        assert s.status == DividendSuggestion.Status.PENDING

    def test_other_users_draft_is_not_found(self, user2, user, asset):
        s = _draft(user, asset)
        c = APIClient()
        c.force_authenticate(user=user2)
        assert c.post(f"/api/dividend-suggestions/{s.id}/dismiss/").status_code == 404

    def test_dismiss_and_dismiss_all(self, client, user, asset):
        a = _draft(user, asset)
        _draft(user, asset, ex_date=D(2026, 8, 10))
        assert client.post(f"/api/dividend-suggestions/{a.id}/dismiss/").data["status"] == "DISMISSED"
        assert client.post("/api/dividend-suggestions/dismiss-all/").data == {"dismissed": 1}
        assert not DividendSuggestion.objects.filter(status="PENDING").exists()

    def test_restore_dismissed_draft(self, client, user, asset):
        s = _draft(user, asset)
        client.post(f"/api/dividend-suggestions/{s.id}/dismiss/")
        assert client.post(f"/api/dividend-suggestions/{s.id}/restore/").data["status"] == "PENDING"
        # Only dismissed ones: a pending draft cannot be "restored" again
        assert client.post(f"/api/dividend-suggestions/{s.id}/restore/").status_code == 400

    def test_restore_is_owner_only(self, user2, user, asset):
        s = _draft(user, asset)
        s.status = DividendSuggestion.Status.DISMISSED
        s.save()
        c = APIClient()
        c.force_authenticate(user=user2)
        assert c.post(f"/api/dividend-suggestions/{s.id}/restore/").status_code == 404

    def test_detect_endpoint(self, client, user, asset, account):
        _buy(user, asset, account, D(2025, 1, 10), 10)
        _dividend(user, asset, D(2026, 8, 14))
        with _yahoo(QUARTERLY):
            res = client.post("/api/dividend-suggestions/detect/", {}, format="json")
        assert [s["ex_date"] for s in res.data["created"]] == ["2026-11-12"]

    def test_detect_backfill_for_one_asset(self, client, user, asset, account):
        _buy(user, asset, account, D(2025, 1, 10), 10)
        _dividend(user, asset, D(2026, 8, 14))
        with _yahoo(QUARTERLY):
            res = client.post(
                "/api/dividend-suggestions/detect/", {"asset_id": str(asset.id), "backfill": True}, format="json"
            )
        assert [s["ex_date"] for s in res.data["created"]] == ["2026-02-09", "2026-05-11", "2026-11-12"]

    def test_detect_unknown_asset(self, client):
        res = client.post(
            "/api/dividend-suggestions/detect/", {"asset_id": "00000000-0000-0000-0000-000000000000"}, format="json"
        )
        assert res.status_code == 404


# ---------------------------------------------------------------------------
# Task & backup
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_daily_task_runs_per_user(user, user2):
    from apps.transactions.tasks import detect_dividends_all_users_task

    with patch("apps.transactions.services.detect_dividends", side_effect=[[], RuntimeError("boom")]) as detect:
        detect_dividends_all_users_task()
    assert detect.call_count == 2


@pytest.mark.django_db
def test_backup_roundtrip_keeps_drafts_and_links(client, user, asset):
    dividend = _dividend(user, asset, D(2026, 11, 16))
    s = _draft(user, asset, status=DividendSuggestion.Status.ACCEPTED)
    s.dividend = dividend
    s.save()
    exported = json.loads(client.get("/api/backup/export/").content)
    assert len(exported["dividend_suggestions"]) == 1

    DividendSuggestion.objects.all().delete()
    file = SimpleUploadedFile("backup.json", json.dumps(exported).encode(), content_type="application/json")
    res = client.post("/api/backup/import/", {"file": file}, format="multipart")
    assert res.status_code == 200, res.data
    assert res.data["counts"]["dividend_suggestions"] == 1
    restored = DividendSuggestion.objects.get(owner=user)
    assert restored.dividend_id == dividend.id and restored.status == DividendSuggestion.Status.ACCEPTED
