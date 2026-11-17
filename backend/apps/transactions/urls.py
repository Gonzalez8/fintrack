from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("transactions", views.TransactionViewSet)
router.register("dividends", views.DividendViewSet)
router.register("interests", views.InterestViewSet)
router.register("other-incomes", views.OtherIncomeViewSet)
router.register("splits", views.StockSplitViewSet)
router.register("dividend-suggestions", views.DividendSuggestionViewSet)

urlpatterns = [
    path("", include(router.urls)),
]
