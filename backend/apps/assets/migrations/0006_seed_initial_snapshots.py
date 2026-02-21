import datetime
from decimal import Decimal
from django.db import migrations


def seed_snapshots(apps, schema_editor):
    Account = apps.get_model("assets", "Account")
    AccountSnapshot = apps.get_model("assets", "AccountSnapshot")
    today = datetime.date.today()
    for account in Account.objects.filter(balance__gt=Decimal("0")):
        AccountSnapshot.objects.get_or_create(
            account=account,
            date=today,
            defaults={"balance": account.balance},
        )


class Migration(migrations.Migration):

    dependencies = [
        ("assets", "0005_add_account_snapshot"),
    ]

    operations = [
        migrations.RunPython(seed_snapshots, migrations.RunPython.noop),
    ]
