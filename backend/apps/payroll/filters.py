import django_filters

from .models import Employer, Payroll


class EmployerFilter(django_filters.FilterSet):
    search = django_filters.CharFilter(field_name="name", lookup_expr="icontains")

    class Meta:
        model = Employer
        fields = []


class PayrollFilter(django_filters.FilterSet):
    year = django_filters.NumberFilter(field_name="period_end", lookup_expr="year")
    month = django_filters.NumberFilter(field_name="period_end", lookup_expr="month")
    employer_id = django_filters.UUIDFilter(field_name="employer_id")

    class Meta:
        model = Payroll
        fields = []
