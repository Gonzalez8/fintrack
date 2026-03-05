from rest_framework import viewsets
from apps.core.mixins import OwnedByUserMixin
from .models import Transaction, Dividend, Interest
from .serializers import TransactionSerializer, DividendSerializer, InterestSerializer
from .filters import TransactionFilter, DividendFilter, InterestFilter


class TransactionViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
    queryset = Transaction.objects.select_related("asset", "account").all()
    serializer_class = TransactionSerializer
    filterset_class = TransactionFilter
    ordering_fields = ["date", "type", "quantity", "price"]


class DividendViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
    queryset = Dividend.objects.select_related("asset").all()
    serializer_class = DividendSerializer
    filterset_class = DividendFilter
    ordering_fields = ["date", "gross", "net"]


class InterestViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
    queryset = Interest.objects.select_related("account").all()
    serializer_class = InterestSerializer
    filterset_class = InterestFilter
    ordering_fields = ["date", "gross", "net"]
