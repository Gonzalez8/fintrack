from django.db import transaction as db_transaction
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.mixins import OwnedByUserMixin

from .filters import (
    DividendFilter,
    DividendSuggestionFilter,
    InterestFilter,
    OtherIncomeFilter,
    StockSplitFilter,
    TransactionFilter,
)
from .models import Dividend, DividendSuggestion, Interest, OtherIncome, StockSplit, Transaction
from .serializers import (
    DividendSerializer,
    DividendSuggestionSerializer,
    InterestSerializer,
    OtherIncomeSerializer,
    StockSplitSerializer,
    TransactionSerializer,
)
from .services import detect_dividends, detect_splits


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


class OtherIncomeViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
    queryset = OtherIncome.objects.select_related("account").all()
    serializer_class = OtherIncomeSerializer
    filterset_class = OtherIncomeFilter
    ordering_fields = ["date", "amount", "category"]


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


class DividendSuggestionViewSet(
    OwnedByUserMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """Dividend drafts detected from Yahoo. Read-only; changed through the actions."""

    queryset = DividendSuggestion.objects.select_related("asset").all()
    serializer_class = DividendSuggestionSerializer
    filterset_class = DividendSuggestionFilter
    ordering_fields = ["ex_date"]

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        """Create the Dividend from the user's reviewed figures and link it to the draft.

        Body: the same fields as ``POST /api/dividends/``; the asset always comes
        from the draft.
        """
        suggestion = self.get_object()
        if suggestion.status != DividendSuggestion.Status.PENDING:
            return Response({"detail": "This suggestion was already reviewed."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = DividendSerializer(
            data={**request.data, "asset": str(suggestion.asset_id)}, context=self.get_serializer_context()
        )
        serializer.is_valid(raise_exception=True)
        with db_transaction.atomic():
            dividend = serializer.save(owner=request.user)
            suggestion.status = DividendSuggestion.Status.ACCEPTED
            suggestion.dividend = dividend
            suggestion.save(update_fields=["status", "dividend", "updated_at"])
        self._invalidate()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def dismiss(self, request, pk=None):
        suggestion = self.get_object()
        suggestion.status = DividendSuggestion.Status.DISMISSED
        suggestion.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(suggestion).data)

    @action(detail=False, methods=["post"], url_path="dismiss-all")
    def dismiss_all(self, request):
        dismissed = (
            self.get_queryset()
            .filter(status=DividendSuggestion.Status.PENDING)
            .update(status=DividendSuggestion.Status.DISMISSED)
        )
        return Response({"dismissed": dismissed})

    @action(detail=False, methods=["post"])
    def detect(self, request):
        """Look up Yahoo dividends and create drafts.

        Body (optional): ``asset_id`` to limit to one asset and ``backfill: true``
        (only with ``asset_id``) to look back to the first purchase.
        """
        from apps.assets.models import Asset

        asset = None
        asset_id = request.data.get("asset_id")
        if asset_id:
            asset = Asset.objects.filter(owner=request.user, pk=asset_id).first()
            if asset is None:
                return Response({"detail": "Asset not found."}, status=status.HTTP_404_NOT_FOUND)
        backfill = bool(request.data.get("backfill")) and asset is not None
        created = detect_dividends(request.user, asset=asset, backfill=backfill)
        return Response({"created": self.get_serializer(created, many=True).data})
