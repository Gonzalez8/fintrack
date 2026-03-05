"""
Data migration: assign all existing data to the first superuser (admin).

This migration runs after adding nullable owner/user fields to all models.
It ensures existing single-user data is correctly attributed before the
owner fields are made non-nullable in the next migration.
"""

from django.db import migrations


def assign_to_first_superuser(apps, schema_editor):
    User = apps.get_model("auth", "User")
    admin = User.objects.filter(is_superuser=True).order_by("date_joined").first()
    if admin is None:
        # Fresh database with no users yet — nothing to migrate.
        return

    Asset = apps.get_model("assets", "Asset")
    Account = apps.get_model("assets", "Account")
    AccountSnapshot = apps.get_model("assets", "AccountSnapshot")
    PortfolioSnapshot = apps.get_model("assets", "PortfolioSnapshot")
    PositionSnapshot = apps.get_model("assets", "PositionSnapshot")
    Settings = apps.get_model("assets", "Settings")

    Asset.objects.filter(owner__isnull=True).update(owner=admin)
    Account.objects.filter(owner__isnull=True).update(owner=admin)
    AccountSnapshot.objects.filter(owner__isnull=True).update(owner=admin)
    PortfolioSnapshot.objects.filter(owner__isnull=True).update(owner=admin)
    PositionSnapshot.objects.filter(owner__isnull=True).update(owner=admin)
    Settings.objects.filter(user__isnull=True).update(user=admin)


def assign_to_first_superuser_transactions(apps, schema_editor):
    """Transactions live in a different app but we reference them here for atomicity."""
    User = apps.get_model("auth", "User")
    admin = User.objects.filter(is_superuser=True).order_by("date_joined").first()
    if admin is None:
        return

    Transaction = apps.get_model("transactions", "Transaction")
    Dividend = apps.get_model("transactions", "Dividend")
    Interest = apps.get_model("transactions", "Interest")

    Transaction.objects.filter(owner__isnull=True).update(owner=admin)
    Dividend.objects.filter(owner__isnull=True).update(owner=admin)
    Interest.objects.filter(owner__isnull=True).update(owner=admin)


class Migration(migrations.Migration):
    dependencies = [
        ("assets", "0018_add_owner_nullable"),
        ("transactions", "0002_add_owner_nullable"),
    ]

    operations = [
        migrations.RunPython(
            assign_to_first_superuser,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.RunPython(
            assign_to_first_superuser_transactions,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
