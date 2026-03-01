from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("assets", "0015_delete_pricesnapshot"),
    ]

    operations = [
        migrations.AddField(
            model_name="asset",
            name="tv_symbol",
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
    ]
