import json
from datetime import UTC, datetime

from django.db import transaction as db_transaction
from django.http import HttpResponse
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assets.models import Account, AccountSnapshot, Asset, PortfolioSnapshot, Settings
from apps.assets.serializers import SettingsSerializer
from apps.reports.models import SavingsGoal
from apps.transactions.models import Dividend, Interest, Transaction

from .serializers import (
    BackupAccountSerializer,
    BackupAccountSnapshotSerializer,
    BackupAssetSerializer,
    BackupDividendSerializer,
    BackupInterestSerializer,
    BackupPortfolioSnapshotSerializer,
    BackupSavingsGoalSerializer,
    BackupSettingsSerializer,
    BackupTransactionSerializer,
)


class BackupExportView(APIView):
    def get(self, request):
        user = request.user
        payload = {
            "version": "1.0",
            "exported_at": datetime.now(UTC).isoformat(),
            "settings": BackupSettingsSerializer(Settings.load(user)).data,
            "assets": BackupAssetSerializer(Asset.objects.filter(owner=user), many=True).data,
            "accounts": BackupAccountSerializer(Account.objects.filter(owner=user), many=True).data,
            "account_snapshots": BackupAccountSnapshotSerializer(
                AccountSnapshot.objects.filter(owner=user).select_related("account"), many=True
            ).data,
            "portfolio_snapshots": BackupPortfolioSnapshotSerializer(
                PortfolioSnapshot.objects.filter(owner=user), many=True
            ).data,
            "transactions": BackupTransactionSerializer(Transaction.objects.filter(owner=user), many=True).data,
            "dividends": BackupDividendSerializer(Dividend.objects.filter(owner=user), many=True).data,
            "interests": BackupInterestSerializer(Interest.objects.filter(owner=user), many=True).data,
            "savings_goals": BackupSavingsGoalSerializer(SavingsGoal.objects.filter(owner=user), many=True).data,
        }
        content = json.dumps(payload, indent=2, default=str)
        filename = datetime.now(UTC).strftime("fintrack-backup-%Y%m%d-%H%M%S.json")
        response = HttpResponse(content, content_type="application/json")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class BackupImportView(APIView):
    parser_classes = [MultiPartParser]

    MAX_BACKUP_SIZE = 50 * 1024 * 1024  # 50 MB

    def post(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)

        if file.size and file.size > self.MAX_BACKUP_SIZE:
            return Response(
                {"detail": "File too large. Maximum size is 50 MB."},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        try:
            payload = json.loads(file.read())
        except (json.JSONDecodeError, UnicodeDecodeError):
            return Response({"detail": "Invalid JSON file"}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(payload, dict) or "version" not in payload:
            return Response({"detail": "Invalid backup format"}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        counts = {
            "assets": 0,
            "accounts": 0,
            "account_snapshots": 0,
            "portfolio_snapshots": 0,
            "transactions": 0,
            "dividends": 0,
            "interests": 0,
            "savings_goals": 0,
            "settings": False,
        }

        def to_defaults(item, fk_fields=(), exclude=()):
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
                    ser = SettingsSerializer(settings_obj, data=payload["settings"], partial=True)
                    if ser.is_valid(raise_exception=True):
                        ser.save()
                        counts["settings"] = True

                for item in payload.get("assets", []):
                    Asset.objects.update_or_create(
                        id=item["id"],
                        owner=user,
                        defaults=to_defaults(item),
                    )
                    counts["assets"] += 1

                for item in payload.get("accounts", []):
                    Account.objects.update_or_create(
                        id=item["id"],
                        owner=user,
                        defaults=to_defaults(item),
                    )
                    counts["accounts"] += 1

                for item in payload.get("account_snapshots", []):
                    AccountSnapshot.objects.update_or_create(
                        id=item["id"],
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

                for item in payload.get("transactions", []):
                    Transaction.objects.update_or_create(
                        id=item["id"],
                        owner=user,
                        defaults=to_defaults(item, fk_fields=("asset", "account")),
                    )
                    counts["transactions"] += 1

                for item in payload.get("dividends", []):
                    item.pop("withholding_rate", None)
                    Dividend.objects.update_or_create(
                        id=item["id"],
                        owner=user,
                        defaults=to_defaults(item, fk_fields=("asset",)),
                    )
                    counts["dividends"] += 1

                for item in payload.get("interests", []):
                    # Backward compat: old backups have "date" instead of "date_start"/"date_end"
                    if "date" in item and "date_start" not in item:
                        item["date_start"] = item.pop("date")
                        item["date_end"] = item["date_start"]
                    # Remove fields that no longer exist
                    item.pop("annual_rate", None)
                    Interest.objects.update_or_create(
                        id=item["id"],
                        owner=user,
                        defaults=to_defaults(item, fk_fields=("account",)),
                    )
                    counts["interests"] += 1

                for item in payload.get("savings_goals", []):
                    SavingsGoal.objects.update_or_create(
                        id=item["id"],
                        owner=user,
                        defaults=to_defaults(item),
                    )
                    counts["savings_goals"] += 1

        except Exception:
            return Response(
                {"detail": "Import failed. Check file format and try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({"counts": counts})
