from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from apps.core.views import HealthView, TaskStatusView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", HealthView.as_view(), name="health"),
    path("api/tasks/<str:task_id>/", TaskStatusView.as_view(), name="task-status"),
    path("api/auth/", include("apps.core.urls")),
    path("api/", include("apps.assets.urls")),
    path("api/", include("apps.transactions.urls")),
    path("api/", include("apps.portfolio.urls")),
    path("api/", include("apps.reports.urls")),
    path("api/", include("apps.importer.urls")),
    path("api/", include("apps.realestate.urls")),
    path("api/", include("apps.payroll.urls")),
    # OpenAPI schema & docs
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/schema/swagger-ui/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/schema/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]
