from decimal import Decimal

from rest_framework import serializers

from .models import Dividend, DividendSuggestion, Interest, StockSplit, Transaction


class _OwnershipValidationMixin:
    """Validate that FK fields point to resources owned by the requesting user."""

    def _validate_owned_fk(self, value, field_name):
        request = self.context.get("request")
        if request and hasattr(value, "owner") and value.owner != request.user:
            raise serializers.ValidationError(f"Invalid {field_name}.")
        return value


class TransactionSerializer(_OwnershipValidationMixin, serializers.ModelSerializer):
    asset_name = serializers.CharField(source="asset.name", read_only=True)
    asset_ticker = serializers.CharField(source="asset.ticker", read_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True)
    split_factor = serializers.SerializerMethodField()

    class Meta:
        model = Transaction
        fields = [
            "id",
            "date",
            "type",
            "asset",
            "asset_name",
            "asset_ticker",
            "account",
            "account_name",
            "quantity",
            "price",
            "commission",
            "tax",
            "notes",
            "split_factor",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "split_factor", "created_at", "updated_at"]

    def get_split_factor(self, obj):
        """Product of APPLIED splits after this trade: shares now = quantity × factor.

        A split on the trade date is excluded (that trade is already post-split).
        Needs ``split_factors`` in the context ({asset_id: [(date, factor)]});
        returns None when it is not provided.
        """
        factors = self.context.get("split_factors")
        if factors is None:
            return None
        factor = Decimal("1")
        for split_date, split_factor in factors.get(obj.asset_id, ()):
            if split_date > obj.date:
                factor *= split_factor
        return str(factor.normalize())

    def validate_asset(self, value):
        return self._validate_owned_fk(value, "asset")

    def validate_account(self, value):
        return self._validate_owned_fk(value, "account")


class DividendSerializer(_OwnershipValidationMixin, serializers.ModelSerializer):
    asset_name = serializers.CharField(source="asset.name", read_only=True)
    asset_ticker = serializers.CharField(source="asset.ticker", read_only=True)
    asset_issuer_country = serializers.CharField(source="asset.issuer_country", read_only=True, default=None)
    withholding_rate = serializers.SerializerMethodField()

    class Meta:
        model = Dividend
        fields = [
            "id",
            "date",
            "asset",
            "asset_name",
            "asset_ticker",
            "asset_issuer_country",
            "shares",
            "gross",
            "tax",
            "commission",
            "net",
            "withholding_rate",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "withholding_rate", "created_at", "updated_at"]

    def get_withholding_rate(self, obj):
        if obj.gross and obj.gross > 0:
            return str((obj.tax / obj.gross * 100).quantize(Decimal("0.01")))
        return None

    def validate_asset(self, value):
        return self._validate_owned_fk(value, "asset")


class InterestSerializer(_OwnershipValidationMixin, serializers.ModelSerializer):
    account_name = serializers.CharField(source="account.name", read_only=True)
    days = serializers.IntegerField(read_only=True)
    tax_effective = serializers.SerializerMethodField()
    tax_is_inferred = serializers.SerializerMethodField()

    class Meta:
        model = Interest
        fields = [
            "id",
            "date_start",
            "date_end",
            "days",
            "account",
            "account_name",
            "gross",
            "tax",
            "tax_effective",
            "tax_is_inferred",
            "commission",
            "net",
            "balance",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "days",
            "tax_effective",
            "tax_is_inferred",
            "created_at",
            "updated_at",
        ]

    def get_tax_effective(self, obj):
        if obj.tax is not None:
            return str(obj.tax)
        inferred = (obj.gross or Decimal("0")) - (obj.net or Decimal("0")) - (obj.commission or Decimal("0"))
        if inferred < Decimal("0"):
            inferred = Decimal("0")
        return str(inferred.quantize(Decimal("0.01")))

    def get_tax_is_inferred(self, obj):
        return obj.tax is None

    def validate_account(self, value):
        return self._validate_owned_fk(value, "account")

    def validate(self, data):
        date_start = data.get("date_start") or (self.instance and self.instance.date_start)
        date_end = data.get("date_end") or (self.instance and self.instance.date_end)
        if date_start and date_end and date_end < date_start:
            raise serializers.ValidationError({"date_end": "date_end must be on or after date_start."})
        return data


class StockSplitSerializer(_OwnershipValidationMixin, serializers.ModelSerializer):
    asset_name = serializers.CharField(source="asset.name", read_only=True)
    asset_ticker = serializers.CharField(source="asset.ticker", read_only=True)

    class Meta:
        model = StockSplit
        fields = [
            "id",
            "date",
            "asset",
            "asset_name",
            "asset_ticker",
            "ratio_from",
            "ratio_to",
            "status",
            "source",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "source", "created_at", "updated_at"]

    def validate_asset(self, value):
        return self._validate_owned_fk(value, "asset")

    def validate(self, attrs):
        asset = attrs.get("asset", getattr(self.instance, "asset", None))
        date = attrs.get("date", getattr(self.instance, "date", None))
        request = self.context.get("request")
        if request and asset and date:
            duplicates = StockSplit.objects.filter(owner=request.user, asset=asset, date=date)
            if self.instance:
                duplicates = duplicates.exclude(pk=self.instance.pk)
            if duplicates.exists():
                raise serializers.ValidationError({"date": "A split for this asset and date already exists."})
        ratio_from = attrs.get("ratio_from", getattr(self.instance, "ratio_from", None))
        ratio_to = attrs.get("ratio_to", getattr(self.instance, "ratio_to", None))
        if ratio_from is not None and ratio_to is not None and ratio_from == ratio_to:
            raise serializers.ValidationError({"ratio_to": "Ratio must change the number of shares."})
        return attrs


class DividendSuggestionSerializer(serializers.ModelSerializer):
    asset_name = serializers.CharField(source="asset.name", read_only=True)
    asset_ticker = serializers.CharField(source="asset.ticker", read_only=True)
    asset_currency = serializers.CharField(source="asset.currency", read_only=True)
    net = serializers.SerializerMethodField()

    class Meta:
        model = DividendSuggestion
        fields = [
            "id",
            "asset",
            "asset_name",
            "asset_ticker",
            "asset_currency",
            "ex_date",
            "amount_per_share",
            "currency",
            "shares",
            "gross",
            "tax",
            "net",
            "status",
            "dividend",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_net(self, obj):
        return str(obj.gross - (obj.tax or Decimal("0")))
