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


@pytest.mark.django_db
def test_backup_round_trips_other_income_and_interest_retention(client, user):
    from apps.transactions.models import Interest, OtherIncome

    account = Account.objects.create(owner=user, name="Bank")
    OtherIncome.objects.create(
        owner=user,
        date=datetime.date(2026, 10, 1),
        category=OtherIncome.Category.RENTAL,
        description="Rent flat",
        amount=Decimal("390"),
        account=account,
        notes="October",
    )
    Interest.objects.create(
        owner=user,
        account=account,
        date_start=datetime.date(2026, 9, 1),
        date_end=datetime.date(2026, 9, 30),
        gross=Decimal("10"),
        tax=Decimal("1.90"),
        commission=Decimal("0.10"),
        net=Decimal("8"),
    )
    exported = client.get("/api/backup/export/").json()
    assert exported["other_incomes"][0]["description"] == "Rent flat"
    exported["other_incomes"][0]["declared"] = True  # field of v2.19.0 backups, ignored on import

    OtherIncome.objects.all().delete()
    Interest.objects.all().delete()
    file = SimpleUploadedFile("b.json", json.dumps(exported).encode(), content_type="application/json")
    res = client.post("/api/backup/import/", {"file": file}, format="multipart")
    assert res.data["counts"]["other_incomes"] == 1
    income = OtherIncome.objects.get(owner=user)
    assert (income.category, income.amount, income.account) == ("RENTAL", Decimal("390"), account)
    interest = Interest.objects.get(owner=user)
    assert (interest.tax, interest.commission) == (Decimal("1.90"), Decimal("0.10"))


@pytest.mark.django_db
def test_backup_round_trips_employers_and_payrolls(client, user):
    from apps.payroll.models import Employer, Payroll

    employer = Employer.objects.create(owner=user, name="ACME", cif="B12345678", ss_account="28/123", notes="HQ")
    Payroll.objects.create(
        owner=user,
        employer=employer,
        period_start=datetime.date(2026, 10, 1),
        period_end=datetime.date(2026, 10, 31),
        concept="Mensual",
        payroll_type=Payroll.PayrollType.BONUS,
        gross=Decimal("3000"),
        ss_employee=Decimal("190.50"),
        irpf_withholding=Decimal("450"),
        net=Decimal("2359.50"),
        base_irpf=Decimal("2950"),
        employer_cost=Decimal("3900"),
    )
    exported = client.get("/api/backup/export/").json()
    assert (len(exported["employers"]), len(exported["payrolls"])) == (1, 1)

    Payroll.objects.all().delete()
    Employer.objects.all().delete()
    file = SimpleUploadedFile("b.json", json.dumps(exported).encode(), content_type="application/json")
    res = client.post("/api/backup/import/", {"file": file}, format="multipart")
    assert (res.data["counts"]["employers"], res.data["counts"]["payrolls"]) == (1, 1)

    restored = Payroll.objects.select_related("employer").get(owner=user)
    assert (restored.employer.cif, restored.employer.notes) == ("B12345678", "HQ")
    assert (restored.payroll_type, restored.net, restored.base_irpf) == ("BONUS", Decimal("2359.50"), Decimal("2950"))
    assert restored.employer_cost == Decimal("3900")


@pytest.mark.django_db
def test_backup_round_trips_rentals(client, user):
    from apps.realestate.models import Lease, Property, RentalExpense
    from apps.transactions.models import OtherIncome

    prop = Property.objects.create(
        owner=user,
        name="Flat",
        current_value=Decimal("200000"),
        cadastral_value=Decimal("80000"),
        cadastral_construction_value=Decimal("48000"),
        ownership_pct=Decimal("50"),
    )
    lease = Lease.objects.create(
        owner=user,
        property=prop,
        start_date=datetime.date(2025, 1, 1),
        monthly_rent=Decimal("400"),
        reduction="PRE_2023",
    )
    RentalExpense.objects.create(
        owner=user, property=prop, date=datetime.date(2026, 3, 1), category="TAXES", amount=Decimal("380")
    )
    OtherIncome.objects.create(
        owner=user, date=datetime.date(2026, 11, 1), description="Rent", amount=Decimal("400"), lease=lease
    )
    exported = client.get("/api/backup/export/").json()

    OtherIncome.objects.all().delete()
    Property.objects.all().delete()  # cascades to leases and expenses
    file = SimpleUploadedFile("b.json", json.dumps(exported).encode(), content_type="application/json")
    res = client.post("/api/backup/import/", {"file": file}, format="multipart")
    assert (res.data["counts"]["leases"], res.data["counts"]["rental_expenses"]) == (1, 1)

    restored = Property.objects.get(owner=user)
    assert (restored.cadastral_construction_value, restored.ownership_pct) == (Decimal("48000"), Decimal("50"))
    assert Lease.objects.get(owner=user).reduction == "PRE_2023"
    assert OtherIncome.objects.get(owner=user).lease_id == lease.id


@pytest.mark.django_db
def test_backup_round_trips_avatar(client, user):
    from apps.core.models import UserAvatar

    png = b"\x89PNG\r\n\x1a\n" + b"\x01" * 32
    UserAvatar.objects.create(user=user, content_type="image/png", data=png)
    exported = json.loads(client.get("/api/backup/export/").content)
    assert exported["avatar"]["content_type"] == "image/png"

    UserAvatar.objects.all().delete()
    file = SimpleUploadedFile("backup.json", json.dumps(exported).encode(), content_type="application/json")
    res = client.post("/api/backup/import/", {"file": file}, format="multipart")
    assert res.status_code == 200
    assert res.json()["counts"]["avatar"] is True
    assert bytes(UserAvatar.objects.get(user=user).data) == png
