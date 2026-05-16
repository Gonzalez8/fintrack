from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("payroll", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="payroll",
            name="concept",
            field=models.CharField(
                blank=True,
                default="",
                help_text=(
                    "Etiqueta del payslip tal como aparece en el PDF "
                    "(p. ej. 'Mensual', 'Atrasos Convenio', 'INCENT. EMPRESA 1S'). "
                    "Permite distinguir varias nóminas del mismo mes."
                ),
                max_length=120,
            ),
        ),
    ]
