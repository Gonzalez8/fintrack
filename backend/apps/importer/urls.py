from django.urls import path
from . import views

urlpatterns = [
    path("backup/export/", views.BackupExportView.as_view(), name="backup-export"),
    path("backup/import/", views.BackupImportView.as_view(), name="backup-import"),
]
