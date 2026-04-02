"""
Tests for SettingsView (GET/PUT /api/settings/).
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(username="testuser", password="testpass123")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
class TestSettingsView:
    def test_get_settings_creates_default(self, client, user):
        resp = client.get("/api/settings/")
        assert resp.status_code == 200
        assert resp.data["base_currency"] == "EUR"
        assert resp.data["cost_basis_method"] == "FIFO"

    def test_update_settings(self, client, user):
        # Ensure settings exist first
        client.get("/api/settings/")
        resp = client.put(
            "/api/settings/",
            {
                "base_currency": "USD",
                "cost_basis_method": "WAC",
                "fiscal_cost_method": "FIFO",
                "gift_cost_mode": "ZERO",
                "rounding_money": 2,
                "rounding_qty": 6,
                "price_update_interval": 0,
                "default_price_source": "YAHOO",
                "snapshot_frequency": 1440,
                "data_retention_days": None,
                "purge_portfolio_snapshots": True,
                "purge_position_snapshots": True,
            },
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["base_currency"] == "USD"
        assert resp.data["cost_basis_method"] == "WAC"

    def test_partial_update_settings(self, client, user):
        # Ensure settings exist first
        client.get("/api/settings/")
        resp = client.patch(
            "/api/settings/",
            {"base_currency": "GBP"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["base_currency"] == "GBP"

    def test_settings_unauthenticated(self):
        client = APIClient()
        resp = client.get("/api/settings/")
        assert resp.status_code == 401

    def test_settings_per_user_isolation(self, user):
        other_user = User.objects.create_user(username="other", password="pass123")
        c1 = APIClient()
        c1.force_authenticate(user=user)
        c2 = APIClient()
        c2.force_authenticate(user=other_user)

        # User 1 changes currency to USD
        c1.get("/api/settings/")
        c1.patch("/api/settings/", {"base_currency": "USD"}, format="json")

        # User 2 should still have default EUR
        resp = c2.get("/api/settings/")
        assert resp.data["base_currency"] == "EUR"
