from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("assets", "0005_remove_position_snapshot"),
    ]

    operations = [
        migrations.AddField(
            model_name="settings",
            name="tax_treaty_limits",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text=(
                    "Mapping of ISO country code to bilateral tax treaty rate "
                    '(as string Decimal). Example: {"US": "0.15", "CH": "0.15"}. '
                    "Used to cap the foreign withholding tax deductible per country in "
                    "the double-taxation block. Missing countries fall back to 0.15 (15%)."
                ),
            ),
        ),
    ]
