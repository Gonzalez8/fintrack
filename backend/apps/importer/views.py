import json
from datetime import datetime, timezone

from django.db import transaction as db_transaction
from django.http import HttpResponse
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assets.models import Asset, Account, AccountSnapshot, PortfolioSnapshot, PositionSnapshot, Settings
from apps.assets.serializers import SettingsSerializer
from apps.transactions.models import Transaction, Dividend, Interest

from .serializers import (
    BackupAssetSerializer,
    BackupAccountSerializer,
    BackupAccountSnapshotSerializer,
    BackupPortfolioSnapshotSerializer,
    BackupPositionSnapshotSerializer,
    BackupTransactionSerializer,
    BackupDividendSerializer,
    BackupInterestSerializer,
    BackupSettingsSerializer,
)


class BackupExportView(APIView):
    def get(self, request):
        user = request.user
        payload = {
            "version": "1.0",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "settings": BackupSettingsSerializer(Settings.load(user)).data,
            "assets": BackupAssetSerializer(Asset.objects.filter(owner=user), many=True).data,
            "accounts": BackupAccountSerializer(Account.objects.filter(owner=user), many=True).data,
            "account_snapshots": BackupAccountSnapshotSerializer(
                AccountSnapshot.objects.filter(owner=user).select_related("account"), many=True
            ).data,
            "portfolio_snapshots": BackupPortfolioSnapshotSerializer(
                PortfolioSnapshot.objects.filter(owner=user), many=True
            ).data,
            "position_snapshots": BackupPositionSnapshotSerializer(
                PositionSnapshot.objects.filter(owner=user).select_related("asset"), many=True
            ).data,
            "transactions": BackupTransactionSerializer(
                Transaction.objects.filter(owner=user), many=True
            ).data,
            "dividends": BackupDividendSerializer(
                Dividend.objects.filter(owner=user), many=True
            ).data,
            "interests": BackupInterestSerializer(
                Interest.objects.filter(owner=user), many=True
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

        user = request.user
        counts = {
            "assets": 0,
            "accounts": 0,
            "account_snapshots": 0,
            "portfolio_snapshots": 0,
            "position_snapshots": 0,
            "transactions": 0,
            "dividends": 0,
            "interests": 0,
            "settings": False,
        }

        def to_defaults(item, fk_fields=(), exclude=()):
            """Build defaults dict renaming FK fields to field_id so Django ORM
            accepts UUID strings without needing model instances."""
            skip = {"id"} | set(exclude)
            result = {}
            for k, v in item.items():
                if k in skip:
                    continue
                result[f"{k}_id" if k in fk_fields else k] = v
            return result

        try:
            with db_transaction.atomic():
                if "settings" in payload:
                    settings_obj = Settings.load(user)
                    ser = SettingsSerializer(
                        settings_obj, data=payload["settings"], partial=True
                    )
                    if ser.is_valid(raise_exception=True):
                        ser.save()
                        counts["settings"] = True

                for item in payload.get("assets", []):
                    record_id = item["id"]
                    Asset.objects.update_or_create(
                        id=record_id,
                        owner=user,
                        defaults=to_defaults(item),
                    )
                    counts["assets"] += 1

                for item in payload.get("accounts", []):
                    record_id = item["id"]
                    Account.objects.update_or_create(
                        id=record_id,
                        owner=user,
                        defaults=to_defaults(item),
                    )
                    counts["accounts"] += 1

                for item in payload.get("account_snapshots", []):
                    record_id = item["id"]
                    AccountSnapshot.objects.update_or_create(
                        id=record_id,
                        owner=user,
                        defaults=to_defaults(item, fk_fields=("account",)),
                    )
                    counts["account_snapshots"] += 1

                for item in payload.get("portfolio_snapshots", []):
                    PortfolioSnapshot.objects.update_or_create(
                        batch_id=item["batch_id"],
                        owner=user,
                        defaults=to_defaults(item, exclude=("batch_id",)),
                    )
                    counts["portfolio_snapshots"] += 1

                for item in payload.get("position_snapshots", []):
                    PositionSnapshot.objects.update_or_create(
                        batch_id=item["batch_id"],
                        asset_id=item["asset"],
                        owner=user,
                        defaults=to_defaults(item, fk_fields=("asset",), exclude=("batch_id",)),
                    )
                    counts["position_snapshots"] += 1

                for item in payload.get("transactions", []):
                    record_id = item["id"]
                    Transaction.objects.update_or_create(
                        id=record_id,
                        owner=user,
                        defaults=to_defaults(item, fk_fields=("asset", "account")),
                    )
                    counts["transactions"] += 1

                for item in payload.get("dividends", []):
                    record_id = item["id"]
                    Dividend.objects.update_or_create(
                        id=record_id,
                        owner=user,
                        defaults=to_defaults(item, fk_fields=("asset",)),
                    )
                    counts["dividends"] += 1

                for item in payload.get("interests", []):
                    record_id = item["id"]
                    Interest.objects.update_or_create(
                        id=record_id,
                        owner=user,
                        defaults=to_defaults(item, fk_fields=("account",)),
                    )
                    counts["interests"] += 1

        except Exception as e:
            return Response(
                {"detail": f"Import failed: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({"counts": counts})
