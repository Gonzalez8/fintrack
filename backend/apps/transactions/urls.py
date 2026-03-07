from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register("transactions", views.TransactionViewSet)
router.register("dividends", views.DividendViewSet)
router.register("interests", views.InterestViewSet)

urlpatterns = [
    path("", include(router.urls)),
]
