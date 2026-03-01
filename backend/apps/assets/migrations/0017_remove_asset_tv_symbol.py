from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("assets", "0016_asset_tv_symbol"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="asset",
            name="tv_symbol",
        ),
    ]
