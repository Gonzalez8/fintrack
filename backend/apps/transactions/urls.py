from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("transactions", views.TransactionViewSet)
router.register("dividends", views.DividendViewSet)
router.register("interests", views.InterestViewSet)
router.register("splits", views.StockSplitViewSet)

urlpatterns = [
    path("", include(router.urls)),
]
