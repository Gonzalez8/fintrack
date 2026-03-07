from rest_framework import serializers
from .models import Transaction, Dividend, Interest


class TransactionSerializer(serializers.ModelSerializer):
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


class DividendSerializer(serializers.ModelSerializer):
    asset_name = serializers.CharField(source="asset.name", read_only=True)
    asset_ticker = serializers.CharField(source="asset.ticker", read_only=True)
    asset_issuer_country = serializers.CharField(source="asset.issuer_country", read_only=True, default=None)

    class Meta:
        model = Dividend
        fields = [
            "id", "date", "asset", "asset_name", "asset_ticker", "asset_issuer_country",
            "shares", "gross", "tax", "net", "withholding_rate",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class InterestSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source="account.name", read_only=True)

    class Meta:
        model = Interest
        fields = [
            "id", "date", "account", "account_name",
            "gross", "net", "balance", "annual_rate",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
