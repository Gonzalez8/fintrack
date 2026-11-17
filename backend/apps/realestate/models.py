from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import UserOwnedModel

PERCENT = [MinValueValidator(Decimal("0.01")), MaxValueValidator(Decimal("100"))]


class Property(UserOwnedModel):
    name = models.CharField(max_length=200)
    current_value = models.DecimalField(max_digits=14, decimal_places=2)
    purchase_price = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
    )
    purchase_date = models.DateField(null=True, blank=True)
    currency = models.CharField(max_length=3, default="EUR")
    notes = models.TextField(blank=True, default="")

    # Mortgage fields (all nullable — property may be fully owned)
    original_loan_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
    )
    outstanding_balance = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
    )
    annual_interest_rate = models.DecimalField(
        max_digits=6,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Annual interest rate as percentage, e.g. 2.5000 for 2.5%",
    )
    total_term_months = models.PositiveIntegerField(null=True, blank=True)
    months_paid = models.PositiveIntegerField(null=True, blank=True)
    monthly_payment = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )

    # Rental / tax data (all optional): the base of the yearly depreciation and the vacancy imputation
    acquisition_costs = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True, help_text="Notary, registry, transfer taxes, agency."
    )
    cadastral_value = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    cadastral_construction_value = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True, help_text="Construction part of the cadastral value."
    )
    cadastral_revised = models.BooleanField(
        default=True, help_text="Cadastral value revised since 1994 (1.1 % imputation instead of 2 %)."
    )
    furniture_value = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    ownership_pct = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("100"), validators=PERCENT)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "properties"

    def __str__(self):
        return f"{self.name} ({self.current_value} {self.currency})"


class Amortization(UserOwnedModel):
    STRATEGY_CHOICES = [
        ("REDUCE_PAYMENT", "Reduce monthly payment"),
        ("REDUCE_TERM", "Reduce term"),
    ]

    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name="amortizations",
    )
    month = models.PositiveIntegerField(
        help_text="Month number in the schedule (1-based) where the extra payment is applied.",
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    strategy = models.CharField(max_length=20, choices=STRATEGY_CHOICES)

    class Meta:
        ordering = ["month"]
        unique_together = [("property", "month")]

    def __str__(self):
        return f"{self.property.name} m{self.month}: {self.amount} ({self.strategy})"


class Lease(UserOwnedModel):
    """A rental contract of a property. Rent payments are ``OtherIncome`` rows linked to it."""

    class Reduction(models.TextChoices):
        # Spanish reduction on the positive net rent of a tenant's main home (art. 23.2 LIRPF)
        PRE_2023 = "PRE_2023", "Contract before 26/05/2023 (60 %)"
        GENERAL = "GENERAL", "General (50 %)"
        RENT_DROP = "RENT_DROP", "Stressed area, rent lowered over 5 % (90 %)"
        YOUNG = "YOUNG", "Stressed area, young tenant or social housing (70 %)"
        REHAB = "REHAB", "Renovation in the previous 2 years (60 %)"
        NONE = "NONE", "No reduction (not the tenant's main home)"

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="leases")
    tenant = models.CharField(max_length=200, blank=True, default="")
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    monthly_rent = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])
    deposit = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    reduction = models.CharField(max_length=10, choices=Reduction.choices, default=Reduction.GENERAL)
    rented_share_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("100"),
        validators=PERCENT,
        help_text="Share of the property rented (e.g. one room).",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-start_date"]

    def __str__(self):
        return f"{self.property.name} {self.start_date} {self.monthly_rent}"


class RentalExpense(UserOwnedModel):
    class Category(models.TextChoices):
        TAXES = "TAXES", "IBI and local taxes"
        COMMUNITY = "COMMUNITY", "Community fees"
        INSURANCE = "INSURANCE", "Insurance"
        REPAIRS = "REPAIRS", "Repairs and maintenance"
        FINANCING = "FINANCING", "Loan interest and financing costs"
        UTILITIES = "UTILITIES", "Utilities"
        SERVICES = "SERVICES", "Agency, management, legal"
        IMPROVEMENT = "IMPROVEMENT", "Improvement (depreciated, not an expense)"
        OTHER = "OTHER", "Other deductible"

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="rental_expenses")
    date = models.DateField()
    category = models.CharField(max_length=12, choices=Category.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    description = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        ordering = ["-date", "-created_at"]
        indexes = [models.Index(fields=["owner", "property", "date"], name="idx_rentexp_owner_prop_date")]

    def __str__(self):
        return f"{self.date} {self.category} {self.amount}"
