from django.urls import path
from . import views

urlpatterns = [
    path("reports/year-summary/", views.YearSummaryView.as_view(), name="year-summary"),
    path("reports/patrimonio-evolution/", views.PatrimonioEvolutionView.as_view(), name="patrimonio-evolution"),
    path("reports/rv-evolution/", views.RVEvolutionView.as_view(), name="rv-evolution"),
    path("reports/monthly-savings/", views.MonthlySavingsView.as_view(), name="monthly-savings"),
    path("reports/annual-savings/", views.AnnualSavingsView.as_view(), name="annual-savings"),
    path("reports/snapshot-status/", views.SnapshotStatusView.as_view(), name="snapshot-status"),

    path("savings-goals/", views.SavingsGoalViewSet.as_view({"get": "list", "post": "create"}), name="savings-goal-list"),
    path("savings-goals/<uuid:pk>/", views.SavingsGoalViewSet.as_view({"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}), name="savings-goal-detail"),
    path("savings-goals/<uuid:goal_id>/projection/", views.SavingsProjectionView.as_view(), name="savings-projection"),

    path("export/transactions.csv", views.ExportTransactionsCSV.as_view(), name="export-transactions"),
    path("export/dividends.csv", views.ExportDividendsCSV.as_view(), name="export-dividends"),
    path("export/interests.csv", views.ExportInterestsCSV.as_view(), name="export-interests"),
]
