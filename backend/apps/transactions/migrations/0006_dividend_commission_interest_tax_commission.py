from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("transactions", "0005_replace_unique_together_with_constraints"),
    ]

    operations = [
        migrations.AddField(
            model_name="dividend",
            name="commission",
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text="Gastos de administración / custodia asociados al dividendo.",
                max_digits=20,
            ),
        ),
        migrations.AlterField(
            model_name="dividend",
            name="tax",
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text="Impuestos retenidos en origen sobre el dividendo (withholding tax).",
                max_digits=20,
            ),
        ),
        migrations.AddField(
            model_name="interest",
            name="tax",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text=(
                    "Impuestos retenidos en origen sobre el interés (withholding tax). "
                    "NULL = no informado (se infiere desde gross - net - commission). "
                    "0 = confirmado sin retención."
                ),
                max_digits=20,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="interest",
            name="commission",
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text="Comisiones o gastos asociados al pago de intereses.",
                max_digits=20,
            ),
        ),
    ]
