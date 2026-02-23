from django.urls import path
from . import views

urlpatterns = [
    path("reports/year-summary/", views.YearSummaryView.as_view(), name="year-summary"),
    path("reports/patrimonio-evolution/", views.PatrimonioEvolutionView.as_view(), name="patrimonio-evolution"),
    path("reports/rv-evolution/", views.RVEvolutionView.as_view(), name="rv-evolution"),
    path("reports/snapshot-status/", views.SnapshotStatusView.as_view(), name="snapshot-status"),
    path("export/transactions.csv", views.ExportTransactionsCSV.as_view(), name="export-transactions"),
    path("export/dividends.csv", views.ExportDividendsCSV.as_view(), name="export-dividends"),
    path("export/interests.csv", views.ExportInterestsCSV.as_view(), name="export-interests"),
]
