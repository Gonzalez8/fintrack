import csv
from datetime import timedelta
from decimal import Decimal

from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.cache import (
    NS_REPORTS_ANNUAL_SAVINGS,
    NS_REPORTS_PATRIMONIO,
    NS_REPORTS_RV,
    NS_REPORTS_SAVINGS,
    NS_REPORTS_YEAR,
    get_user_cache,
    set_user_cache,
)
from apps.core.mixins import OwnedByUserMixin
from apps.transactions.models import Dividend, Interest, Transaction

from .models import SavingsGoal
from .serializers import SavingsGoalSerializer
from .services import (
    annual_savings,
    monthly_savings,
    patrimonio_evolution,
    rv_evolution,
    savings_projection,
    tax_declaration,
    year_summary,
)

_REPORT_TTL = 120  # 2 minutes


class YearSummaryView(APIView):
    def get(self, request):
        cached = get_user_cache(request.user.pk, NS_REPORTS_YEAR)
        if cached is not None:
            return Response(cached)
        data = year_summary(request.user)
        set_user_cache(request.user.pk, NS_REPORTS_YEAR, data, timeout=_REPORT_TTL)
        return Response(data)


class PatrimonioEvolutionView(APIView):
    def get(self, request):
        cached = get_user_cache(request.user.pk, NS_REPORTS_PATRIMONIO)
        if cached is not None:
            return Response(cached)
        data = patrimonio_evolution(request.user)
        set_user_cache(request.user.pk, NS_REPORTS_PATRIMONIO, data, timeout=_REPORT_TTL)
        return Response(data)


class RVEvolutionView(APIView):
    def get(self, request):
        cached = get_user_cache(request.user.pk, NS_REPORTS_RV)
        if cached is not None:
            return Response(cached)
        data = rv_evolution(request.user)
        set_user_cache(request.user.pk, NS_REPORTS_RV, data, timeout=_REPORT_TTL)
        return Response(data)


class MonthlySavingsView(APIView):
    def get(self, request):
        from_month = request.query_params.get("from")
        to_month = request.query_params.get("to")
        if not from_month and not to_month:
            cached = get_user_cache(request.user.pk, NS_REPORTS_SAVINGS)
            if cached is not None:
                return Response(cached)
        result = monthly_savings(request.user, start_date=from_month, end_date=to_month)
        if not from_month and not to_month:
            set_user_cache(request.user.pk, NS_REPORTS_SAVINGS, result, timeout=_REPORT_TTL)
        return Response(result)


class SnapshotStatusView(APIView):
    def get(self, request):
        import math

        from apps.assets.models import PortfolioSnapshot, Settings

        settings = Settings.load(request.user)
        freq = settings.snapshot_frequency
        last = PortfolioSnapshot.objects.filter(owner=request.user).order_by("-captured_at").first()

        next_snapshot = None
        if last and freq > 0:
            elapsed = (timezone.now() - last.captured_at).total_seconds() / 60
            cycles = math.floor(elapsed / freq)
            next_snapshot = (last.captured_at + timedelta(minutes=freq * (cycles + 1))).isoformat()

        return Response(
            {
                "frequency_minutes": freq,
                "last_snapshot": last.captured_at.isoformat() if last else None,
                "next_snapshot": next_snapshot,
            }
        )


class TaxDeclarationView(APIView):
    def get(self, request):
        year_param = request.query_params.get("year")
        if not year_param:
            return Response({"detail": "year query parameter is required"}, status=400)
        try:
            year = int(year_param)
        except (TypeError, ValueError):
            return Response({"detail": "year must be an integer"}, status=400)
        return Response(tax_declaration(request.user, year))


class AnnualSavingsView(APIView):
    def get(self, request):
        cached = get_user_cache(request.user.pk, NS_REPORTS_ANNUAL_SAVINGS)
        if cached is not None:
            return Response(cached)
        data = annual_savings(request.user)
        set_user_cache(request.user.pk, NS_REPORTS_ANNUAL_SAVINGS, data, timeout=_REPORT_TTL)
        return Response(data)


class SavingsGoalViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
    queryset = SavingsGoal.objects.all()
    serializer_class = SavingsGoalSerializer
    invalidates_financial_cache = False


class SavingsProjectionView(APIView):
    def get(self, request, goal_id):
        from django.shortcuts import get_object_or_404

        get_object_or_404(SavingsGoal, pk=goal_id, owner=request.user)
        data = savings_projection(request.user, goal_id)
        return Response(data)


class Echo:
    def write(self, value):
        return value


class ExportTransactionsCSV(APIView):
    def get(self, request):
        qs = Transaction.objects.filter(owner=request.user).select_related("asset", "account").order_by("date")
        writer_buffer = Echo()

        def rows():
            writer = csv.writer(writer_buffer)
            yield writer.writerow(
                ["Date", "Type", "Asset", "Ticker", "Account", "Quantity", "Price", "Commission", "Tax"]
            )
            for tx in qs.iterator():
                yield writer.writerow(
                    [
                        tx.date,
                        tx.type,
                        tx.asset.name,
                        tx.asset.ticker or "",
                        tx.account.name,
                        tx.quantity,
                        tx.price or "",
                        tx.commission,
                        tx.tax,
                    ]
                )

        response = StreamingHttpResponse(rows(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="transactions.csv"'
        return response


class ExportDividendsCSV(APIView):
    def get(self, request):
        qs = Dividend.objects.filter(owner=request.user).select_related("asset").order_by("date")
        writer_buffer = Echo()

        def rows():
            writer = csv.writer(writer_buffer)
            yield writer.writerow(["Date", "Asset", "Shares", "Gross", "Tax", "Net", "Withholding Rate"])
            for d in qs.iterator():
                rate = (d.tax / d.gross * 100).quantize(Decimal("0.01")) if d.gross and d.gross > 0 else ""
                yield writer.writerow(
                    [
                        d.date,
                        d.asset.name,
                        d.shares or "",
                        d.gross,
                        d.tax,
                        d.net,
                        rate,
                    ]
                )

        response = StreamingHttpResponse(rows(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="dividends.csv"'
        return response


class ExportInterestsCSV(APIView):
    def get(self, request):
        qs = Interest.objects.filter(owner=request.user).select_related("account").order_by("date_end")
        writer_buffer = Echo()

        def rows():
            writer = csv.writer(writer_buffer)
            yield writer.writerow(["Date Start", "Date End", "Days", "Account", "Gross", "Net", "Balance"])
            for i in qs.iterator():
                yield writer.writerow(
                    [
                        i.date_start,
                        i.date_end,
                        i.days,
                        i.account.name,
                        i.gross,
                        i.net,
                        i.balance or "",
                    ]
                )

        response = StreamingHttpResponse(rows(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="interests.csv"'
        return response
