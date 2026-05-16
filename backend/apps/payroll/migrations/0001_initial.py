import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Employer",
            fields=[
                (
                    "id",
                    models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "name",
                    models.CharField(help_text="Razón social del empleador.", max_length=200),
                ),
                (
                    "cif",
                    models.CharField(
                        blank=True,
                        help_text="NIF/CIF del empleador (España). Libre formato para otros países.",
                        max_length=20,
                    ),
                ),
                (
                    "ss_account",
                    models.CharField(
                        blank=True,
                        help_text="Nº de inscripción en la Seguridad Social (España).",
                        max_length=30,
                    ),
                ),
                ("address", models.CharField(blank=True, max_length=300)),
                ("notes", models.TextField(blank=True)),
                (
                    "owner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(app_label)s_%(class)s_set",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.AddConstraint(
            model_name="employer",
            constraint=models.UniqueConstraint(
                fields=("owner", "name"),
                name="unique_employer_name_per_owner",
            ),
        ),
        migrations.CreateModel(
            name="Payroll",
            fields=[
                (
                    "id",
                    models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "period_start",
                    models.DateField(help_text="Primer día del periodo cubierto."),
                ),
                (
                    "period_end",
                    models.DateField(
                        help_text="Último día del periodo. Se usa para filtrar por año (period_end__year).",
                    ),
                ),
                (
                    "gross",
                    models.DecimalField(
                        decimal_places=2,
                        help_text=(
                            "Retribución dineraria total (Total devengado / REM. TOTAL). "
                            "MVP: solo dineraria. Especie y exentos se añadirán como campos separados."
                        ),
                        max_digits=20,
                    ),
                ),
                (
                    "ss_employee",
                    models.DecimalField(
                        decimal_places=2,
                        default=0,
                        help_text=(
                            "Suma de cotizaciones del trabajador a la Seguridad Social "
                            "(contingencias comunes, MEI, solidaridad, formación, desempleo)."
                        ),
                        max_digits=20,
                    ),
                ),
                (
                    "irpf_withholding",
                    models.DecimalField(
                        decimal_places=2,
                        default=0,
                        help_text="Retención por rendimientos del trabajo.",
                        max_digits=20,
                    ),
                ),
                (
                    "net",
                    models.DecimalField(
                        decimal_places=2,
                        help_text=(
                            "Líquido a percibir tal como aparece en la nómina. "
                            "Puede no cuadrar con gross - ss_employee - irpf_withholding "
                            "por anticipos, embargos, dietas exentas, especie u otros ajustes."
                        ),
                        max_digits=20,
                    ),
                ),
                (
                    "base_irpf",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        help_text="Base sujeta a retención IRPF (informativa).",
                        max_digits=20,
                        null=True,
                    ),
                ),
                (
                    "base_cc",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        help_text="Base de cotización de contingencias comunes (informativa).",
                        max_digits=20,
                        null=True,
                    ),
                ),
                (
                    "employer_cost",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        help_text="Coste empresa total (informativo, para reports de coste laboral).",
                        max_digits=20,
                        null=True,
                    ),
                ),
                ("notes", models.TextField(blank=True)),
                ("import_hash", models.CharField(blank=True, max_length=64, null=True)),
                (
                    "employer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="payrolls",
                        to="payroll.employer",
                    ),
                ),
                (
                    "owner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(app_label)s_%(class)s_set",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-period_end", "-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="payroll",
            constraint=models.UniqueConstraint(
                fields=("owner", "employer", "period_start", "period_end"),
                name="unique_payroll_period_per_employer",
            ),
        ),
        migrations.AddConstraint(
            model_name="payroll",
            constraint=models.UniqueConstraint(
                condition=models.Q(("import_hash__isnull", False)),
                fields=("owner", "import_hash"),
                name="unique_payroll_owner_import_hash",
            ),
        ),
    ]
