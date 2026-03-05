from django.apps import AppConfig


class AssetsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.assets"
    # Periodic tasks (snapshot creation) are now handled by Celery Beat — no ready() needed.
