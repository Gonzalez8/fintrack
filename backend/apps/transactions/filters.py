import django_filters
from django.db.models import Q

from .models import Dividend, DividendSuggestion, Interest, OtherIncome, StockSplit, Transaction


class TransactionFilter(django_filters.FilterSet):
    from_date = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    to_date = django_filters.DateFilter(field_name="date", lookup_expr="lte")
    asset_id = django_filters.UUIDFilter(field_name="asset_id")
    account_id = django_filters.UUIDFilter(field_name="account_id")
    type = django_filters.CharFilter(field_name="type")
    search = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = Transaction
        fields = []

    def filter_search(self, queryset, name, value):
        return queryset.filter(Q(asset__name__icontains=value) | Q(asset__ticker__icontains=value))


class DividendFilter(django_filters.FilterSet):
    year = django_filters.NumberFilter(field_name="date", lookup_expr="year")
    asset_id = django_filters.UUIDFilter(field_name="asset_id")
    search = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = Dividend
        fields = []

    def filter_search(self, queryset, name, value):
        return queryset.filter(Q(asset__name__icontains=value) | Q(asset__ticker__icontains=value))


class InterestFilter(django_filters.FilterSet):
    year = django_filters.NumberFilter(field_name="date_end", lookup_expr="year")
    account_id = django_filters.UUIDFilter(field_name="account_id")
    search = django_filters.CharFilter(field_name="account__name", lookup_expr="icontains")

    class Meta:
        model = Interest
        fields = []


class OtherIncomeFilter(django_filters.FilterSet):
    year = django_filters.NumberFilter(field_name="date", lookup_expr="year")
    from_date = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    to_date = django_filters.DateFilter(field_name="date", lookup_expr="lte")
    category = django_filters.CharFilter(field_name="category")
    declared = django_filters.BooleanFilter(field_name="declared")
    account_id = django_filters.UUIDFilter(field_name="account_id")
    search = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = OtherIncome
        fields = []

    def filter_search(self, queryset, name, value):
        return queryset.filter(Q(description__icontains=value) | Q(notes__icontains=value))


class StockSplitFilter(django_filters.FilterSet):
    asset_id = django_filters.UUIDFilter(field_name="asset_id")
    status = django_filters.CharFilter(field_name="status")

    class Meta:
        model = StockSplit
        fields = []


class DividendSuggestionFilter(django_filters.FilterSet):
    asset_id = django_filters.UUIDFilter(field_name="asset_id")
    status = django_filters.CharFilter(field_name="status")

    class Meta:
        model = DividendSuggestion
        fields = []
