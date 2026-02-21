from rest_framework import viewsets, status
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Asset, Account, AccountSnapshot, Settings
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
