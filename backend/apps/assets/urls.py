from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register("assets", views.AssetViewSet)
router.register("accounts", views.AccountViewSet)
router.register("account-snapshots", views.AccountSnapshotViewSet)

urlpatterns = [
    path("assets/update-prices/", views.UpdatePricesView.as_view(), name="update-prices"),
    path("accounts/bulk-snapshot/", views.BulkSnapshotView.as_view(), name="bulk-snapshot"),
    path("settings/", views.SettingsView.as_view(), name="settings"),
    path("", include(router.urls)),
]
