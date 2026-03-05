import os

from django.contrib import admin
from django.http import FileResponse, Http404
from django.urls import path, include, re_path
from django.conf import settings
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from apps.core.views import TaskStatusView, HealthView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", HealthView.as_view(), name="health"),
    # OpenAPI schema + interactive docs (no auth required)
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/schema/swagger-ui/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/schema/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    path("api/auth/", include("apps.core.urls")),
    path("api/tasks/<str:task_id>/", TaskStatusView.as_view(), name="task-status"),
    path("api/", include("apps.assets.urls")),
    path("api/", include("apps.transactions.urls")),
    path("api/", include("apps.portfolio.urls")),
    path("api/", include("apps.importer.urls")),
    path("api/", include("apps.reports.urls")),
]


def _serve_frontend(request, path=""):
    """Serve the React SPA index.html for any non-API route."""
    frontend_dir = getattr(settings, "FRONTEND_DIR", "")
    if not frontend_dir:
        raise Http404
    index = os.path.join(frontend_dir, "index.html")
    if not os.path.isfile(index):
        raise Http404
    return FileResponse(open(index, "rb"), content_type="text/html")


if os.environ.get("FRONTEND_DIR"):
    urlpatterns += [
        re_path(r"^(?!api/|admin/|static/).*$", _serve_frontend),
    ]
