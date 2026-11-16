from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.mixins import OwnedByUserMixin

from .filters import DividendFilter, InterestFilter, StockSplitFilter, TransactionFilter
from .models import Dividend, Interest, StockSplit, Transaction
from .serializers import DividendSerializer, InterestSerializer, StockSplitSerializer, TransactionSerializer
from .services import detect_splits


class TransactionViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
    queryset = Transaction.objects.select_related("asset", "account").all()
    serializer_class = TransactionSerializer
    filterset_class = TransactionFilter
    ordering_fields = ["date", "type", "quantity", "price"]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request and self.request.user.is_authenticated:
            factors = {}
            for asset_id, split_date, ratio_from, ratio_to in StockSplit.objects.filter(
                owner=self.request.user, status=StockSplit.Status.APPLIED
            ).values_list("asset_id", "date", "ratio_from", "ratio_to"):
                factors.setdefault(asset_id, []).append((split_date, ratio_to / ratio_from))
            context["split_factors"] = factors
        return context


class DividendViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
    queryset = Dividend.objects.select_related("asset").all()
    serializer_class = DividendSerializer
    filterset_class = DividendFilter
    ordering_fields = ["date", "gross", "net"]


class InterestViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
    queryset = Interest.objects.select_related("account").all()
    serializer_class = InterestSerializer
    filterset_class = InterestFilter
    ordering_fields = ["date_end", "gross", "net"]


class StockSplitViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
    queryset = StockSplit.objects.select_related("asset").all()
    serializer_class = StockSplitSerializer
    filterset_class = StockSplitFilter
    ordering_fields = ["date", "status"]

    def _set_status(self, status):
        split = self.get_object()
        split.status = status
        split.save(update_fields=["status", "updated_at"])
        self._invalidate()
        return Response(self.get_serializer(split).data)

    @action(detail=True, methods=["post"])
    def apply(self, request, pk=None):
        return self._set_status(StockSplit.Status.APPLIED)

    @action(detail=True, methods=["post"])
    def dismiss(self, request, pk=None):
        return self._set_status(StockSplit.Status.DISMISSED)

    @action(detail=False, methods=["post"])
    def detect(self, request):
        """Look up Yahoo Finance splits for the user's assets and create PENDING suggestions."""
        created = detect_splits(request.user)
        return Response({"created": self.get_serializer(created, many=True).data})
