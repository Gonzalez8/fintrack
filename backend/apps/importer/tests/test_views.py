"""
Tests for backup export/import: roundtrip integrity, validation.
"""

import datetime
import json
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.assets.models import Account, Asset
from apps.reports.models import SavingsGoal
from apps.transactions.models import Dividend, Transaction

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(username="exportuser", password="testpass123")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def populated_data(user):
    """Create a set of data for export testing."""
    asset = Asset.objects.create(
        owner=user,
        name="Export Stock",
        ticker="EXP",
        type=Asset.AssetType.STOCK,
        currency="EUR",
        current_price=Decimal("25.00"),
    )
    account = Account.objects.create(
        owner=user,
        name="Export Account",
        type=Account.AccountType.OPERATIVA,
        currency="EUR",
    )
    tx = Transaction.objects.create(
        owner=user,
        asset=asset,
        account=account,
        type="BUY",
        date="2025-01-15",
        quantity=Decimal("10"),
        price=Decimal("20"),
        commission=Decimal("1"),
        tax=Decimal("0"),
    )
    div = Dividend.objects.create(
        owner=user,
        asset=asset,
        date="2025-03-15",
        gross=Decimal("50"),
        tax=Decimal("7.50"),
        net=Decimal("42.50"),
    )
    goal = SavingsGoal.objects.create(
        owner=user,
        name="House",
        target_amount=Decimal("200000"),
        base_type="PATRIMONY",
        icon="house",
    )
    return {"asset": asset, "account": account, "tx": tx, "div": div, "goal": goal}


@pytest.mark.django_db
class TestBackupRoundtrip:
    def test_export_contains_all_data(self, client, populated_data):
        res = client.get("/api/backup/export/")
        assert res.status_code == 200
        data = json.loads(res.content)

        assert len(data["assets"]) == 1
        assert len(data["accounts"]) == 1
        assert len(data["transactions"]) == 1
        assert len(data["dividends"]) == 1
        assert len(data["savings_goals"]) == 1
        assert data["assets"][0]["ticker"] == "EXP"
        assert data["savings_goals"][0]["name"] == "House"

    def test_reimport_own_data(self, client, user, populated_data):
        """Export and re-import to same user (update_or_create path)."""
        res = client.get("/api/backup/export/")
        exported = json.loads(res.content)

        file = SimpleUploadedFile(
            "backup.json",
            json.dumps(exported).encode(),
            content_type="application/json",
        )
        res = client.post("/api/backup/import/", {"file": file}, format="multipart")
        assert res.status_code == 200, res.data

        counts = res.data["counts"]
        assert counts["assets"] == 1
        assert counts["accounts"] == 1
        assert counts["transactions"] == 1
        assert counts["dividends"] == 1
        assert counts["savings_goals"] == 1

        # Data should still be intact (not duplicated)
        assert Asset.objects.filter(owner=user, ticker="EXP").count() == 1
        assert SavingsGoal.objects.filter(owner=user, name="House").count() == 1


@pytest.mark.django_db
class TestImportValidation:
    def test_invalid_json(self, client):
        file = SimpleUploadedFile("bad.json", b"not json", content_type="application/json")
        res = client.post("/api/backup/import/", {"file": file}, format="multipart")
        assert res.status_code == 400

    def test_missing_version(self, client):
        file = SimpleUploadedFile(
            "no_version.json",
            json.dumps({"assets": []}).encode(),
            content_type="application/json",
        )
        res = client.post("/api/backup/import/", {"file": file}, format="multipart")
        assert res.status_code == 400

    def test_no_file(self, client):
        res = client.post("/api/backup/import/", {}, format="multipart")
        assert res.status_code == 400

    def test_backward_compat_withholding_rate(self, client, user):
        """Old backups with withholding_rate should import fine."""
        asset = Asset.objects.create(
            owner=user,
            name="Div Stock",
            ticker="DIV",
            type=Asset.AssetType.STOCK,
            currency="EUR",
        )
        backup = {
            "version": "1.0",
            "assets": [{"id": str(asset.id), "name": "Div Stock", "ticker": "DIV", "type": "STOCK", "currency": "EUR"}],
            "dividends": [
                {
                    "id": "00000000-0000-0000-0000-000000000099",
                    "date": "2025-01-15",
                    "asset": str(asset.id),
                    "shares": "10",
                    "gross": "100.00",
                    "tax": "15.00",
                    "net": "85.00",
                    "withholding_rate": "15.00",
                }
            ],
        }
        file = SimpleUploadedFile(
            "old_backup.json",
            json.dumps(backup).encode(),
            content_type="application/json",
        )
        res = client.post("/api/backup/import/", {"file": file}, format="multipart")
        assert res.status_code == 200
        assert Dividend.objects.filter(owner=user, gross=Decimal("100")).exists()


@pytest.mark.django_db
def test_backup_keeps_fiscal_country_and_mcp_url(client, user):
    from apps.assets.models import Settings

    s = Settings.load(user)
    s.tax_country = "DE"
    s.mcp_backend_url = "https://fintrack-api.example.com"
    s.save()
    exported = json.loads(client.get("/api/backup/export/").content)
    assert exported["settings"]["tax_country"] == "DE"
    assert exported["settings"]["mcp_backend_url"] == "https://fintrack-api.example.com"

    s.tax_country, s.mcp_backend_url = "ES", ""
    s.save()
    file = SimpleUploadedFile("backup.json", json.dumps(exported).encode(), content_type="application/json")
    assert client.post("/api/backup/import/", {"file": file}, format="multipart").status_code == 200
    s = Settings.load(user)
    assert (s.tax_country, s.mcp_backend_url) == ("DE", "https://fintrack-api.example.com")


@pytest.mark.django_db
def test_backup_keeps_dividend_retentions_and_commission(client, user):
    asset = Asset.objects.create(owner=user, name="US Stock", ticker="USS", currency="USD")
    Dividend.objects.create(
        owner=user,
        asset=asset,
        date=datetime.date(2025, 6, 1),
        gross=Decimal("100"),
        tax=Decimal("15"),
        domestic_tax=Decimal("19"),
        commission=Decimal("1"),
        net=Decimal("65"),
    )
    exported = client.get("/api/backup/export/").json()
    row = exported["dividends"][0]
    assert (row["domestic_tax"], row["commission"]) == ("19.00", "1.00")

    Dividend.objects.all().delete()
    file = SimpleUploadedFile("b.json", json.dumps(exported).encode(), content_type="application/json")
    assert client.post("/api/backup/import/", {"file": file}, format="multipart").status_code == 200
    d = Dividend.objects.get(owner=user)
    assert (d.domestic_tax, d.commission) == (Decimal("19.00"), Decimal("1.00"))
