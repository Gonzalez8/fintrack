from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import UserOwnedModel


class Transaction(UserOwnedModel):
    class TransactionType(models.TextChoices):
        BUY = "BUY", "Buy"
        SELL = "SELL", "Sell"
        GIFT = "GIFT", "Gift"

    date = models.DateField()
    type = models.CharField(max_length=4, choices=TransactionType.choices)
    asset = models.ForeignKey("assets.Asset", on_delete=models.PROTECT, related_name="transactions")
    account = models.ForeignKey("assets.Account", on_delete=models.PROTECT, related_name="transactions")
    quantity = models.DecimalField(
        max_digits=20,
        decimal_places=6,
        validators=[MinValueValidator(Decimal("0.000001"))],
    )
    price = models.DecimalField(max_digits=20, decimal_places=6, null=True, blank=True)
    commission = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default="")
    import_hash = models.CharField(max_length=64, null=True, blank=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["owner", "import_hash"], name="unique_tx_owner_import_hash"),
        ]
        indexes = [
            models.Index(fields=["owner", "date", "created_at"], name="idx_tx_owner_date"),
        ]

    def __str__(self):
        return f"{self.date} {self.type} {self.asset.name} x{self.quantity}"


class Dividend(UserOwnedModel):
    date = models.DateField()
    asset = models.ForeignKey("assets.Asset", on_delete=models.PROTECT, related_name="dividends")
    shares = models.DecimalField(max_digits=20, decimal_places=6, null=True, blank=True)
    gross = models.DecimalField(max_digits=20, decimal_places=2)
    tax = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=0,
        help_text="Impuestos retenidos en origen sobre el dividendo (withholding tax).",
    )
    commission = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=0,
        help_text="Gastos de administración / custodia asociados al dividendo.",
    )
    net = models.DecimalField(max_digits=20, decimal_places=2)
    import_hash = models.CharField(max_length=64, null=True, blank=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["owner", "import_hash"], name="unique_div_owner_import_hash"),
        ]

    def __str__(self):
        return f"{self.date} Dividend {self.asset.name} {self.net}"


class Interest(UserOwnedModel):
    date_start = models.DateField()
    date_end = models.DateField()
    account = models.ForeignKey("assets.Account", on_delete=models.PROTECT, related_name="interests")
    gross = models.DecimalField(max_digits=20, decimal_places=2)
    tax = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=(
            "Impuestos retenidos en origen sobre el interés (withholding tax). "
            "NULL = no informado (se infiere desde gross - net - commission). "
            "0 = confirmado sin retención."
        ),
    )
    commission = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=0,
        help_text="Comisiones o gastos asociados al pago de intereses.",
    )
    net = models.DecimalField(max_digits=20, decimal_places=2)
    balance = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    import_hash = models.CharField(max_length=64, null=True, blank=True)

    class Meta:
        ordering = ["-date_end", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["owner", "import_hash"], name="unique_int_owner_import_hash"),
        ]

    @property
    def days(self):
        return (self.date_end - self.date_start).days

    def __str__(self):
        return f"{self.date_start}→{self.date_end} Interest {self.account.name} {self.net}"
