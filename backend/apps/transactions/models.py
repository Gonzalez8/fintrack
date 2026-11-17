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
    domestic_tax = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=0,
        help_text=(
            "Retención practicada en el país de residencia fiscal por el pagador o broker local "
            "(p. ej. el 19 % español sobre un dividendo extranjero). Se declara como retención, "
            "no como doble imposición."
        ),
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


class OtherIncome(UserOwnedModel):
    """Money received outside payslips, dividends and interests (rent, freelance work, side jobs, gifts...).

    ``amount`` is what was actually received. It counts for savings and estimated spending and never reaches the
    tax views; declaring a kind of income (e.g. rent) belongs in its own feature with the data the tax form needs.
    """

    class Category(models.TextChoices):
        RENTAL = "RENTAL", "Rental"
        SELF_EMPLOYMENT = "SELF_EMPLOYMENT", "Self-employment"
        SIDE_JOB = "SIDE_JOB", "Side job"
        GIFT = "GIFT", "Gift"
        OTHER = "OTHER", "Other"

    date = models.DateField()
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    description = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=20, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    account = models.ForeignKey(
        "assets.Account",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="other_incomes",
    )
    lease = models.ForeignKey(
        "realestate.Lease",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
        help_text="Rent payment of this lease.",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-date", "-created_at"]
        indexes = [models.Index(fields=["owner", "date"], name="idx_otherinc_owner_date")]

    def __str__(self):
        return f"{self.date} {self.description} {self.amount}"


class StockSplit(UserOwnedModel):
    """Stock split (or reverse split) of an asset.

    From ``date`` on, every open share becomes ``ratio_to / ratio_from`` shares
    and its unit cost is divided by the same factor. Total cost is unchanged and
    no gain is realized. Only APPLIED splits affect the portfolio engine;
    PENDING ones are auto-detected suggestions waiting for the user.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPLIED = "APPLIED", "Applied"
        DISMISSED = "DISMISSED", "Dismissed"

    class Source(models.TextChoices):
        MANUAL = "MANUAL", "Manual"
        AUTO = "AUTO", "Auto-detected"

    date = models.DateField()
    asset = models.ForeignKey("assets.Asset", on_delete=models.CASCADE, related_name="splits")
    ratio_from = models.DecimalField(
        max_digits=12,
        decimal_places=6,
        validators=[MinValueValidator(Decimal("0.000001"))],
        help_text="Shares before the split (1 in a 4:1 split).",
    )
    ratio_to = models.DecimalField(
        max_digits=12,
        decimal_places=6,
        validators=[MinValueValidator(Decimal("0.000001"))],
        help_text="Shares after the split (4 in a 4:1 split).",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.APPLIED)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.MANUAL)

    class Meta:
        ordering = ["-date", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["owner", "asset", "date"], name="unique_split_owner_asset_date"),
        ]

    @property
    def factor(self) -> Decimal:
        return self.ratio_to / self.ratio_from

    def __str__(self):
        return f"{self.date} Split {self.asset.name} {self.ratio_to}:{self.ratio_from} ({self.status})"


class DividendSuggestion(UserOwnedModel):
    """Draft dividend detected from Yahoo Finance, waiting for the user's review.

    Kept apart from ``Dividend`` so drafts never reach reports or tax figures.
    Accepting one creates the real ``Dividend`` (with the user's corrected
    figures) and links it; dismissing it means it is never suggested again.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        DISMISSED = "DISMISSED", "Dismissed"

    asset = models.ForeignKey("assets.Asset", on_delete=models.CASCADE, related_name="dividend_suggestions")
    ex_date = models.DateField(help_text="Ex-dividend date reported by Yahoo (payment comes later).")
    amount_per_share = models.DecimalField(max_digits=20, decimal_places=6, help_text="Gross amount per share.")
    currency = models.CharField(max_length=3, help_text="Currency of the Yahoo quote the amount is in.")
    shares = models.DecimalField(max_digits=20, decimal_places=6, help_text="Shares held on the ex-dividend date.")
    gross = models.DecimalField(max_digits=20, decimal_places=2, help_text="Estimated gross = shares × amount.")
    tax = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Estimated withholding from the user's past dividends of this asset; null when unknown.",
    )
    domestic_tax = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Estimated domestic withholding from the user's past dividends of this asset; null when none.",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    dividend = models.ForeignKey(
        "transactions.Dividend",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text="Dividend created when the suggestion was accepted.",
    )

    class Meta:
        ordering = ["-ex_date", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["owner", "asset", "ex_date"], name="unique_divsugg_owner_asset_exdate"),
        ]

    def __str__(self):
        return f"{self.ex_date} Dividend draft {self.asset.name} {self.gross} {self.currency} ({self.status})"
