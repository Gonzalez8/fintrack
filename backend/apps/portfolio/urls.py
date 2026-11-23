from django.urls import path

from . import views

urlpatterns = [
    path("portfolio/", views.PortfolioView.as_view(), name="portfolio"),
    path("portfolio/returns/", views.ReturnsView.as_view(), name="portfolio-returns"),
    path("portfolio/simulate-sale/", views.SimulateSaleView.as_view(), name="portfolio-simulate-sale"),
    path("portfolio/rebuild-history/", views.RebuildHistoryView.as_view(), name="portfolio-rebuild-history"),
    path("portfolio/loss-harvesting/", views.LossHarvestingView.as_view(), name="portfolio-loss-harvesting"),
]
