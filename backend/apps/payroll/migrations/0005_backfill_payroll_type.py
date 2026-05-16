"""Data migration: classify existing Payroll rows by their `concept`.

Runs the same keyword inference used at create time. Without this every
existing record stays as MONTHLY (the column default), so a payslip
named "Extra Agosto 2025" would silently be classified as monthly until
the user edits it. The forward step is idempotent. The reverse step is
a no-op because the previous schema simply didn't have the field.
"""

from django.db import migrations


def backfill_payroll_type(apps, schema_editor):
    # Import the helper at runtime so the migration doesn't import the
    # full app graph at load time.
    from apps.payroll.models import infer_payroll_type

    Payroll = apps.get_model("payroll", "Payroll")
    for p in Payroll.objects.all().only("id", "concept", "payroll_type"):
        inferred = infer_payroll_type(p.concept)
        if p.payroll_type != inferred:
            p.payroll_type = inferred
            p.save(update_fields=["payroll_type"])


class Migration(migrations.Migration):
    dependencies = [
        ("payroll", "0004_payroll_payroll_type"),
    ]

    operations = [
        migrations.RunPython(backfill_payroll_type, migrations.RunPython.noop),
    ]
