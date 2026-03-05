from django.conf import settings as django_settings
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from apps.core.models import TimeStampedModel, UserOwnedModel


class Asset(UserOwnedModel):
    class AssetType(models.TextChoices):
        STOCK = "STOCK", "Stock"
        ETF = "ETF", "ETF"
        FUND = "FUND", "Fund"
        CRYPTO = "CRYPTO", "Crypto"

    class PriceMode(models.TextChoices):
        MANUAL = "MANUAL", "Manual"
        AUTO = "AUTO", "Auto"

    class PriceSource(models.TextChoices):
        YAHOO = "YAHOO", "Yahoo Finance"
        MANUAL = "MANUAL", "Manual"

    class PriceStatus(models.TextChoices):
        OK = "OK", "OK"
        ERROR = "ERROR", "Error"
        NO_TICKER = "NO_TICKER", "No ticker"

    name = models.CharField(max_length=200)
    ticker = models.CharField(max_length=20, null=True, blank=True)
    isin = models.CharField(max_length=12, null=True, blank=True)
    type = models.CharField(max_length=10, choices=AssetType.choices, default=AssetType.STOCK)
    currency = models.CharField(max_length=3, default="EUR")
    current_price = models.DecimalField(max_digits=20, decimal_places=6, null=True, blank=True)
    price_mode = models.CharField(max_length=10, choices=PriceMode.choices, default=PriceMode.MANUAL)
    issuer_country = models.CharField(max_length=2, null=True, blank=True)
    domicile_country = models.CharField(max_length=2, null=True, blank=True)
    withholding_country = models.CharField(max_length=2, null=True, blank=True)
    price_source = models.CharField(max_length=10, choices=PriceSource.choices, default=PriceSource.YAHOO)
    price_status = models.CharField(max_length=10, choices=PriceStatus.choices, null=True, blank=True)
    price_updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["name"]
        unique_together = [("owner", "ticker"), ("owner", "isin")]

    def save(self, *args, **kwargs):
        if self.isin and not self.issuer_country:
            self.issuer_country = self.isin[:2].upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.ticker or 'N/A'})"


class Account(UserOwnedModel):
    class AccountType(models.TextChoices):
        OPERATIVA = "OPERATIVA", "Operativa"
        AHORRO = "AHORRO", "Ahorro"
        INVERSION = "INVERSION", "Inversión"
        DEPOSITOS = "DEPOSITOS", "Depósitos"
        ALTERNATIVOS = "ALTERNATIVOS", "Alternativos"

    name = models.CharField(max_length=200)
    type = models.CharField(max_length=15, choices=AccountType.choices, default=AccountType.OPERATIVA)
    currency = models.CharField(max_length=3, default="EUR")
    balance = models.DecimalField(max_digits=20, decimal_places=2, default=0)

    class Meta:
        ordering = ["name"]
        unique_together = [("owner", "name")]

    def __str__(self):
        return self.name


class AccountSnapshot(UserOwnedModel):
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="snapshots")
    date = models.DateField()
    balance = models.DecimalField(max_digits=20, decimal_places=2)
    note = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        unique_together = ["account", "date"]
        ordering = ["-date"]

    def __str__(self):
        return f"{self.account.name} @ {self.date}: {self.balance}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self._sync_account_balance()

    def _sync_account_balance(self):
        latest = AccountSnapshot.objects.filter(account=self.account).order_by("-date").first()
        if latest:
            Account.objects.filter(pk=self.account_id).update(balance=latest.balance)


@receiver(post_delete, sender=AccountSnapshot)
def sync_account_balance_on_delete(sender, instance, **kwargs):
    latest = AccountSnapshot.objects.filter(account_id=instance.account_id).order_by("-date").first()
    Account.objects.filter(pk=instance.account_id).update(
        balance=latest.balance if latest else 0
    )


class PortfolioSnapshot(models.Model):
    owner = models.ForeignKey(
        django_settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="assets_portfoliosnapshot_set",
    )
    captured_at = models.DateTimeField(db_index=True)
    batch_id = models.UUIDField(db_index=True)
    total_market_value = models.DecimalField(max_digits=20, decimal_places=2)
    total_cost = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    total_unrealized_pnl = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)

    class Meta:
        ordering = ["-captured_at"]

    def __str__(self):
        return f"Portfolio @ {self.captured_at}: {self.total_market_value}"


class PositionSnapshot(models.Model):
    """Per-asset position snapshot linked to a PortfolioSnapshot via batch_id."""

    owner = models.ForeignKey(
        django_settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="assets_positionsnapshot_set",
    )
    batch_id = models.UUIDField(db_index=True)
    captured_at = models.DateTimeField(db_index=True)
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="position_snapshots")
    quantity = models.DecimalField(max_digits=20, decimal_places=6)
    cost_basis = models.DecimalField(max_digits=20, decimal_places=2)
    market_value = models.DecimalField(max_digits=20, decimal_places=2)
    unrealized_pnl = models.DecimalField(max_digits=20, decimal_places=2)
    unrealized_pnl_pct = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ["-captured_at"]

    def __str__(self):
        return f"{self.asset.name} @ {self.captured_at}: {self.market_value}"


class Settings(models.Model):
    class CostBasisMethod(models.TextChoices):
        FIFO = "FIFO", "First In, First Out"

    class GiftCostMode(models.TextChoices):
        ZERO = "ZERO", "Zero cost"
        MARKET = "MARKET", "Market price"

    user = models.OneToOneField(
        django_settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="fintrack_settings",
    )
    base_currency = models.CharField(max_length=3, default="EUR")
    cost_basis_method = models.CharField(
        max_length=10, choices=CostBasisMethod.choices, default=CostBasisMethod.FIFO
    )
    gift_cost_mode = models.CharField(
        max_length=10, choices=GiftCostMode.choices, default=GiftCostMode.ZERO
    )
    rounding_money = models.PositiveSmallIntegerField(default=2)
    rounding_qty = models.PositiveSmallIntegerField(default=6)
    price_update_interval = models.PositiveIntegerField(
        default=0,
        help_text="Auto-update interval in minutes. 0 = disabled (manual only).",
    )
    default_price_source = models.CharField(
        max_length=10,
        choices=[("YAHOO", "Yahoo Finance"), ("MANUAL", "Manual")],
        default="YAHOO",
    )
    snapshot_frequency = models.PositiveIntegerField(
        default=1440,
        help_text="Snapshot frequency in minutes. 0 = disabled. Default 1440 (daily).",
    )
    data_retention_days = models.PositiveIntegerField(
        null=True,
        blank=True,
        default=None,
        help_text="Delete data older than this many days. Null = never delete.",
    )

    class Meta:
        verbose_name_plural = "settings"

    @classmethod
    def load(cls, user):
        obj, _ = cls.objects.get_or_create(user=user)
        return obj

    def __str__(self):
        return f"Settings ({self.user})"
