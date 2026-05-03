from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("assets", "0006_settings_tax_treaty_limits"),
    ]

    operations = [
        migrations.AddField(
            model_name="settings",
            name="tax_country",
            field=models.CharField(
                default="ES",
                help_text=(
                    "User's country of fiscal residence (ISO 3166-1 alpha-2). "
                    "Drives which tax-declaration adapter is shown. "
                    "Currently only 'ES' has a Modo Renta adapter; other countries hide the tab."
                ),
                max_length=2,
            ),
        ),
    ]
