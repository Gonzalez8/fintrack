import csv
from django.http import StreamingHttpResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.transactions.models import Transaction, Dividend, Interest
from .services import year_summary, patrimonio_evolution, rv_evolution


class YearSummaryView(APIView):
    def get(self, request):
        return Response(year_summary())


class PatrimonioEvolutionView(APIView):
    def get(self, request):
        return Response(patrimonio_evolution())


class RVEvolutionView(APIView):
    def get(self, request):
        return Response(rv_evolution())


class Echo:
    def write(self, value):
        return value


class ExportTransactionsCSV(APIView):
    def get(self, request):
        qs = Transaction.objects.select_related("asset", "account").order_by("date")
        writer_buffer = Echo()

        def rows():
            writer = csv.writer(writer_buffer)
            yield writer.writerow(["Date", "Type", "Asset", "Ticker", "Account", "Quantity", "Price", "Commission", "Tax"])
            for tx in qs.iterator():
                yield writer.writerow([
                    tx.date, tx.type, tx.asset.name, tx.asset.ticker or "",
                    tx.account.name, tx.quantity, tx.price or "", tx.commission, tx.tax,
                ])

        response = StreamingHttpResponse(rows(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="transactions.csv"'
        return response


class ExportDividendsCSV(APIView):
    def get(self, request):
        qs = Dividend.objects.select_related("asset").order_by("date")
        writer_buffer = Echo()

        def rows():
            writer = csv.writer(writer_buffer)
            yield writer.writerow(["Date", "Asset", "Shares", "Gross", "Tax", "Net", "Withholding Rate"])
            for d in qs.iterator():
                yield writer.writerow([
                    d.date, d.asset.name, d.shares or "", d.gross, d.tax, d.net,
                    d.withholding_rate or "",
                ])

        response = StreamingHttpResponse(rows(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="dividends.csv"'
        return response


class ExportInterestsCSV(APIView):
    def get(self, request):
        qs = Interest.objects.select_related("account").order_by("date")
        writer_buffer = Echo()

        def rows():
            writer = csv.writer(writer_buffer)
            yield writer.writerow(["Date", "Account", "Gross", "Net", "Balance", "Annual Rate"])
            for i in qs.iterator():
                yield writer.writerow([
                    i.date, i.account.name, i.gross, i.net,
                    i.balance or "", i.annual_rate or "",
                ])

        response = StreamingHttpResponse(rows(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="interests.csv"'
        return response
