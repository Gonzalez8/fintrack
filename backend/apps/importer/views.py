import json
from datetime import datetime, timezone

from django.db import transaction as db_transaction
from django.http import HttpResponse
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assets.models import Asset, Account, AccountSnapshot, PortfolioSnapshot, PositionSnapshot, PriceSnapshot, Settings
from apps.assets.serializers import SettingsSerializer
from apps.transactions.models import Transaction, Dividend, Interest

from .serializers import (
    BackupAssetSerializer,
    BackupAccountSerializer,
    BackupAccountSnapshotSerializer,
    BackupPortfolioSnapshotSerializer,
    BackupPositionSnapshotSerializer,
    BackupPriceSnapshotSerializer,
    BackupTransactionSerializer,
    BackupDividendSerializer,
    BackupInterestSerializer,
    BackupSettingsSerializer,
)

class BackupExportView(APIView):
    def get(self, request):
        payload = {
            "version": "1.0",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "settings": BackupSettingsSerializer(Settings.load()).data,
            "assets": BackupAssetSerializer(Asset.objects.all(), many=True).data,
            "accounts": BackupAccountSerializer(Account.objects.all(), many=True).data,
            "account_snapshots": BackupAccountSnapshotSerializer(
                AccountSnapshot.objects.select_related("account").all(), many=True
            ).data,
            "price_snapshots": BackupPriceSnapshotSerializer(
                PriceSnapshot.objects.select_related("asset").all(), many=True
            ).data,
            "portfolio_snapshots": BackupPortfolioSnapshotSerializer(
                PortfolioSnapshot.objects.all(), many=True
            ).data,
            "position_snapshots": BackupPositionSnapshotSerializer(
                PositionSnapshot.objects.select_related("asset").all(), many=True
            ).data,
            "transactions": BackupTransactionSerializer(
                Transaction.objects.all(), many=True
            ).data,
            "dividends": BackupDividendSerializer(
                Dividend.objects.all(), many=True
            ).data,
            "interests": BackupInterestSerializer(
                Interest.objects.all(), many=True
            ).data,
        }
        content = json.dumps(payload, indent=2, default=str)
        filename = datetime.now(timezone.utc).strftime("fintrack-backup-%Y%m%d-%H%M%S.json")
        response = HttpResponse(content, content_type="application/json")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class BackupImportView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response(
                {"detail": "No file provided"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            payload = json.loads(file.read())
        except (json.JSONDecodeError, UnicodeDecodeError):
            return Response(
                {"detail": "Invalid JSON file"}, status=status.HTTP_400_BAD_REQUEST
            )

        if not isinstance(payload, dict) or "version" not in payload:
            return Response(
                {"detail": "Invalid backup format"}, status=status.HTTP_400_BAD_REQUEST
            )

        counts = {
            "assets": 0,
            "accounts": 0,
            "account_snapshots": 0,
            "price_snapshots": 0,
            "portfolio_snapshots": 0,
            "position_snapshots": 0,
            "transactions": 0,
            "dividends": 0,
            "interests": 0,
            "settings": False,
        }

        def to_defaults(item, fk_fields=()):
            """Build defaults dict renaming FK fields to field_id so Django ORM
            accepts UUID strings without needing model instances."""
            result = {}
            for k, v in item.items():
                if k == "id":
                    continue
                result[f"{k}_id" if k in fk_fields else k] = v
            return result

        try:
            with db_transaction.atomic():
                if "settings" in payload:
                    settings_obj = Settings.load()
                    ser = SettingsSerializer(
                        settings_obj, data=payload["settings"], partial=True
                    )
                    if ser.is_valid(raise_exception=True):
                        ser.save()
                        counts["settings"] = True

                for item in payload.get("assets", []):
                    record_id = item["id"]
                    Asset.objects.update_or_create(id=record_id, defaults=to_defaults(item))
                    counts["assets"] += 1

                for item in payload.get("accounts", []):
                    record_id = item["id"]
                    Account.objects.update_or_create(id=record_id, defaults=to_defaults(item))
                    counts["accounts"] += 1

                for item in payload.get("account_snapshots", []):
                    record_id = item["id"]
                    AccountSnapshot.objects.update_or_create(
                        id=record_id, defaults=to_defaults(item, fk_fields=("account",))
                    )
                    counts["account_snapshots"] += 1

                for item in payload.get("price_snapshots", []):
                    record_id = item["id"]
                    PriceSnapshot.objects.update_or_create(
                        id=record_id, defaults=to_defaults(item, fk_fields=("asset",))
                    )
                    counts["price_snapshots"] += 1

                for item in payload.get("portfolio_snapshots", []):
                    record_id = item["id"]
                    PortfolioSnapshot.objects.update_or_create(
                        id=record_id, defaults=to_defaults(item)
                    )
                    counts["portfolio_snapshots"] += 1

                for item in payload.get("position_snapshots", []):
                    record_id = item["id"]
                    PositionSnapshot.objects.update_or_create(
                        id=record_id, defaults=to_defaults(item, fk_fields=("asset",))
                    )
                    counts["position_snapshots"] += 1

                for item in payload.get("transactions", []):
                    record_id = item["id"]
                    Transaction.objects.update_or_create(
                        id=record_id, defaults=to_defaults(item, fk_fields=("asset", "account"))
                    )
                    counts["transactions"] += 1

                for item in payload.get("dividends", []):
                    record_id = item["id"]
                    Dividend.objects.update_or_create(
                        id=record_id, defaults=to_defaults(item, fk_fields=("asset",))
                    )
                    counts["dividends"] += 1

                for item in payload.get("interests", []):
                    record_id = item["id"]
                    Interest.objects.update_or_create(
                        id=record_id, defaults=to_defaults(item, fk_fields=("account",))
                    )
                    counts["interests"] += 1

        except Exception as e:
            return Response(
                {"detail": f"Import failed: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Reset sequences for tables that use integer PKs so the next
        # auto-generated ID doesn't collide with the imported rows.
        from django.db import connection
        int_pk_tables = [
            "assets_portfoliosnapshot",
            "assets_positionsnapshot",
        ]
        with connection.cursor() as cursor:
            for table in int_pk_tables:
                cursor.execute(
                    f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                    f"COALESCE(MAX(id), 1)) FROM {table};"
                )

        return Response({"counts": counts})
