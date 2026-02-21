from rest_framework import serializers
from .models import Asset, Account, AccountSnapshot, PriceSnapshot, Settings


class AssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = [
            "id", "name", "ticker", "isin", "type", "currency",
            "current_price", "price_mode",
            "issuer_country", "domicile_country", "withholding_country",
            "price_source", "price_status", "price_updated_at",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "current_price", "price_status", "price_updated_at",
            "created_at", "updated_at",
        ]


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ["id", "name", "type", "currency", "balance", "created_at", "updated_at"]
        read_only_fields = ["id", "balance", "created_at", "updated_at"]


class AccountSnapshotSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source="account.name", read_only=True)

    class Meta:
        model = AccountSnapshot
        fields = ["id", "account", "account_name", "date", "balance", "note", "created_at"]
        read_only_fields = ["id", "created_at"]


class BulkSnapshotItemSerializer(serializers.Serializer):
    account = serializers.UUIDField()
    balance = serializers.DecimalField(max_digits=20, decimal_places=2)
    note = serializers.CharField(required=False, default="", allow_blank=True)


class BulkSnapshotSerializer(serializers.Serializer):
    date = serializers.DateField()
    snapshots = BulkSnapshotItemSerializer(many=True)


class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Settings
        fields = [
            "base_currency", "cost_basis_method", "gift_cost_mode",
            "rounding_money", "rounding_qty", "price_update_interval",
            "default_price_source", "snapshot_frequency",
        ]
