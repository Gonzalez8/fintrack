from django.db import models

from apps.core.models import UserOwnedModel


class Employer(UserOwnedModel):
    """Pagador de nóminas. Datos relativamente estáticos que se reutilizan
    a lo largo del tiempo en cada nómina mensual.

    Campos opcionales (CIF, n.º SS, dirección) están pensados para España
    pero no son obligatorios — el modelo sirve para cualquier país; los
    adaptadores fiscales por país son los que añaden semántica."""

    name = models.CharField(max_length=200, help_text="Razón social del empleador.")
    cif = models.CharField(
        max_length=20,
        blank=True,
        help_text="NIF/CIF del empleador (España). Libre formato para otros países.",
    )
    ss_account = models.CharField(
        max_length=30,
        blank=True,
        help_text="Nº de inscripción en la Seguridad Social (España).",
    )
    address = models.CharField(max_length=300, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "name"],
                name="unique_employer_name_per_owner",
            ),
        ]

    def __str__(self):
        return self.name


class Payroll(UserOwnedModel):
    """Una nómina (payslip) emitida por un Employer a este usuario.

    `gross` representa la **retribución dineraria total** del periodo
    (lo que en una nómina española aparece como "Total devengado" /
    "REM. TOTAL"). Excluye explícitamente la retribución en especie y
    los rendimientos exentos, que se modelarán en campos separados en
    futuras iteraciones (`gross_in_kind`, `gross_exempt`,
    `non_salary_adjustments`).

    La igualdad ``gross - ss_employee - irpf_withholding == net`` no se
    valida como error: muchas nóminas reales incluyen anticipos,
    embargos, dietas exentas, retribución en especie o regularizaciones
    que rompen esa relación. El descuadre se trata como warning
    informativo a nivel de serializer / Modo Renta."""

    employer = models.ForeignKey(
        Employer,
        on_delete=models.PROTECT,
        related_name="payrolls",
    )
    period_start = models.DateField(help_text="Primer día del periodo cubierto.")
    period_end = models.DateField(
        help_text="Último día del periodo. Se usa para filtrar por año (period_end__year).",
    )
    concept = models.CharField(
        max_length=120,
        blank=True,
        default="",
        help_text=(
            "Etiqueta del payslip tal como aparece en el PDF "
            "(p. ej. 'Mensual', 'Atrasos Convenio', 'INCENT. EMPRESA 1S'). "
            "Permite distinguir varias nóminas del mismo mes."
        ),
    )

    gross = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        help_text=(
            "Retribución dineraria total (Total devengado / REM. TOTAL). "
            "MVP: solo dineraria. Especie y exentos se añadirán como campos separados."
        ),
    )
    ss_employee = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=0,
        help_text=(
            "Suma de cotizaciones del trabajador a la Seguridad Social "
            "(contingencias comunes, MEI, solidaridad, formación, desempleo)."
        ),
    )
    irpf_withholding = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=0,
        help_text="Retención por rendimientos del trabajo.",
    )
    net = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        help_text=(
            "Líquido a percibir tal como aparece en la nómina. "
            "Puede no cuadrar con gross - ss_employee - irpf_withholding "
            "por anticipos, embargos, dietas exentas, especie u otros ajustes."
        ),
    )

    base_irpf = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Base sujeta a retención IRPF (informativa).",
    )
    base_cc = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Base de cotización de contingencias comunes (informativa).",
    )
    employer_cost = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Coste empresa total (informativo, para reports de coste laboral).",
    )

    notes = models.TextField(blank=True)
    import_hash = models.CharField(max_length=64, null=True, blank=True)

    class Meta:
        ordering = ["-period_end", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "employer", "period_start", "period_end"],
                name="unique_payroll_period_per_employer",
            ),
            models.UniqueConstraint(
                fields=["owner", "import_hash"],
                name="unique_payroll_owner_import_hash",
                condition=models.Q(import_hash__isnull=False),
            ),
        ]

    def __str__(self):
        return f"{self.period_start}→{self.period_end} {self.employer.name} net={self.net}"
