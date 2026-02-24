from decimal import Decimal, InvalidOperation

from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Asset, Account, AccountSnapshot, Settings, PositionSnapshot
from .serializers import (
    AssetSerializer, AccountSerializer, AccountSnapshotSerializer,
    BulkSnapshotSerializer, SettingsSerializer,
)
from .services import update_prices


class AssetViewSet(viewsets.ModelViewSet):
    queryset = Asset.objects.all()
    serializer_class = AssetSerializer
    search_fields = ["name", "ticker"]
    filterset_fields = ["type", "issuer_country", "price_status"]
    ordering_fields = ["name", "ticker", "type"]

    def destroy(self, request, *args, **kwargs):
        from django.db.models import ProtectedError
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "No se puede eliminar este activo porque tiene operaciones o dividendos asociados."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["get"], url_path="position-history")
    def position_history(self, request, pk=None):
        snapshots = PositionSnapshot.objects.filter(asset_id=pk).order_by("captured_at")
        data = [
            {
                "captured_at": s.captured_at.isoformat(),
                "market_value": str(s.market_value),
                "cost_basis": str(s.cost_basis),
                "unrealized_pnl": str(s.unrealized_pnl),
                "unrealized_pnl_pct": str(s.unrealized_pnl_pct),
                "quantity": str(s.quantity),
            }
            for s in snapshots
        ]
        return Response(data)

    @action(detail=True, methods=["post"], url_path="set-price")
    def set_price(self, request, pk=None):
        asset = self.get_object()
        if asset.price_mode != Asset.PriceMode.MANUAL:
            return Response(
                {"detail": "El activo no esta en modo de precio manual."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        price_raw = request.data.get("price")
        if price_raw is None:
            return Response(
                {"detail": "El campo 'price' es obligatorio."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            price = Decimal(str(price_raw))
        except (InvalidOperation, ValueError):
            return Response(
                {"detail": "Precio no valido."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        now = timezone.now()
        asset.current_price = price
        asset.price_source = Asset.PriceSource.MANUAL
        asset.price_status = Asset.PriceStatus.OK
        asset.price_updated_at = now
        asset.save(update_fields=[
            "current_price", "price_source", "price_status", "price_updated_at", "updated_at",
        ])
        return Response(AssetSerializer(asset).data)


class UpdatePricesView(APIView):
    def post(self, request):
        try:
            result = update_prices()
        except Exception as e:
            return Response(
                {"detail": f"Price update failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(result)


class AccountViewSet(viewsets.ModelViewSet):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer

    def destroy(self, request, *args, **kwargs):
        from django.db.models import ProtectedError
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "No se puede eliminar esta cuenta porque tiene operaciones o intereses asociados."},
                status=status.HTTP_400_BAD_REQUEST,
            )


class AccountSnapshotViewSet(viewsets.ModelViewSet):
    queryset = AccountSnapshot.objects.select_related("account").all()
    serializer_class = AccountSnapshotSerializer
    filterset_fields = ["account"]

    def perform_create(self, serializer):
        account = serializer.validated_data["account"]
        date = serializer.validated_data["date"]
        snapshot, created = AccountSnapshot.objects.update_or_create(
            account=account,
            date=date,
            defaults={
                "balance": serializer.validated_data["balance"],
                "note": serializer.validated_data.get("note", ""),
            },
        )
        # Trigger balance sync (update_or_create bypasses model save when updating)
        snapshot._sync_account_balance()
        serializer.instance = snapshot


class BulkSnapshotView(APIView):
    def post(self, request):
        serializer = BulkSnapshotSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        date = serializer.validated_data["date"]
        results = []
        for item in serializer.validated_data["snapshots"]:
            snapshot, created = AccountSnapshot.objects.update_or_create(
                account_id=item["account"],
                date=date,
                defaults={"balance": item["balance"], "note": item.get("note", "")},
            )
            snapshot._sync_account_balance()
            results.append(AccountSnapshotSerializer(snapshot).data)
        return Response(results, status=status.HTTP_201_CREATED)


class SettingsView(RetrieveUpdateAPIView):
    serializer_class = SettingsSerializer

    def get_object(self):
        return Settings.load()


class StorageInfoView(APIView):
    def get(self, request):
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT relname, pg_total_relation_size(quote_ident(relname))
                FROM pg_stat_user_tables
                ORDER BY 2 DESC
            """)
            rows = cursor.fetchall()
        tables = [
            {"table": row[0], "size_mb": round(row[1] / (1024 * 1024), 3)}
            for row in rows
        ]
        total_mb = round(sum(t["size_mb"] for t in tables), 3)
        return Response({"total_mb": total_mb, "tables": tables})
