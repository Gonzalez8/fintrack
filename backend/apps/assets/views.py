from decimal import Decimal, InvalidOperation

from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.mixins import OwnedByUserMixin
from .models import Asset, Account, AccountSnapshot, Settings, PositionSnapshot
from .serializers import (
    AssetSerializer, AccountSerializer, AccountSnapshotSerializer,
    BulkSnapshotSerializer, SettingsSerializer,
)


class AssetViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
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
        snapshots = PositionSnapshot.objects.filter(
            owner=request.user, asset_id=pk
        ).order_by("captured_at")
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

    @action(detail=True, methods=["get"], url_path="price-history")
    def price_history(self, request, pk=None):
        import yfinance as yf

        asset = self.get_object()
        if not asset.ticker:
            return Response({"detail": "Este activo no tiene ticker."}, status=status.HTTP_400_BAD_REQUEST)

        period = request.query_params.get("period", "1y")
        if period not in {"1mo", "3mo", "6mo", "1y", "2y", "5y", "max"}:
            period = "1y"

        try:
            hist = yf.Ticker(asset.ticker).history(period=period)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

        if hist.empty:
            return Response([])

        data = [
            {
                "time": date.strftime("%Y-%m-%d"),
                "open": round(float(row["Open"]), 6),
                "high": round(float(row["High"]), 6),
                "low": round(float(row["Low"]), 6),
                "close": round(float(row["Close"]), 6),
            }
            for date, row in hist.iterrows()
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
        from apps.assets.tasks import update_prices_task
        task = update_prices_task.delay(request.user.pk)
        return Response({"task_id": task.id, "status": "queued"}, status=status.HTTP_202_ACCEPTED)


class AccountViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
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


class AccountSnapshotViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
    queryset = AccountSnapshot.objects.select_related("account").all()
    serializer_class = AccountSnapshotSerializer
    filterset_fields = ["account"]

    def perform_create(self, serializer):
        account = serializer.validated_data["account"]
        date = serializer.validated_data["date"]
        snapshot, created = AccountSnapshot.objects.update_or_create(
            account=account,
            date=date,
            owner=self.request.user,
            defaults={
                "balance": serializer.validated_data["balance"],
                "note": serializer.validated_data.get("note", ""),
            },
        )
        snapshot._sync_account_balance()
        serializer.instance = snapshot


class BulkSnapshotView(APIView):
    def post(self, request):
        serializer = BulkSnapshotSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        date = serializer.validated_data["date"]

        item_account_ids = [item["account"] for item in serializer.validated_data["snapshots"]]
        valid_ids = set(
            Account.objects.filter(owner=request.user, id__in=item_account_ids)
            .values_list("id", flat=True)
        )
        invalid = [str(aid) for aid in item_account_ids if aid not in valid_ids]
        if invalid:
            return Response(
                {"detail": f"Cuentas no encontradas: {', '.join(invalid)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = []
        for item in serializer.validated_data["snapshots"]:
            snapshot, created = AccountSnapshot.objects.update_or_create(
                account_id=item["account"],
                date=date,
                owner=request.user,
                defaults={"balance": item["balance"], "note": item.get("note", "")},
            )
            snapshot._sync_account_balance()
            results.append(AccountSnapshotSerializer(snapshot).data)
        return Response(results, status=status.HTTP_201_CREATED)


class SettingsView(RetrieveUpdateAPIView):
    serializer_class = SettingsSerializer

    def get_object(self):
        return Settings.load(self.request.user)


_APP_TABLE_PREFIXES = ("assets_", "transactions_", "portfolio_", "reports_", "importer_", "core_")


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
            if row[0].startswith(_APP_TABLE_PREFIXES)
        ]
        total_mb = round(sum(t["size_mb"] for t in tables), 3)
        return Response({"total_mb": total_mb, "tables": tables})
