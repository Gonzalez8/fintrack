from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("employers", views.EmployerViewSet)
router.register("payrolls", views.PayrollViewSet)

urlpatterns = [
    path(
        "payrolls/parse-pdf/",
        views.PayrollParsePdfView.as_view(),
        name="payroll-parse-pdf",
    ),
    path("", include(router.urls)),
]
