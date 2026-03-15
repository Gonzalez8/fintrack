from decimal import Decimal

from rest_framework import serializers

from .models import Transaction, Dividend, Interest


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

    class Meta:
        model = Transaction
        fields = [
            "id", "date", "type", "asset", "asset_name", "asset_ticker",
            "account", "account_name", "quantity", "price", "commission",
            "tax", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

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
            "id", "date", "asset", "asset_name", "asset_ticker", "asset_issuer_country",
            "shares", "gross", "tax", "net", "withholding_rate",
            "created_at", "updated_at",
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

    class Meta:
        model = Interest
        fields = [
            "id", "date_start", "date_end", "days",
            "account", "account_name",
            "gross", "net", "balance",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "days", "created_at", "updated_at"]

    def validate_account(self, value):
        return self._validate_owned_fk(value, "account")

    def validate(self, data):
        date_start = data.get("date_start") or (self.instance and self.instance.date_start)
        date_end = data.get("date_end") or (self.instance and self.instance.date_end)
        if date_start and date_end and date_end < date_start:
            raise serializers.ValidationError(
                {"date_end": "date_end must be on or after date_start."}
            )
        return data
