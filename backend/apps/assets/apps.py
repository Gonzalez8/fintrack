import os

from django.apps import AppConfig


class AssetsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.assets"

    def ready(self):
        # RUN_MAIN=true is set by Django's auto-reloader in the child (server) process.
        # This guard prevents the scheduler from starting in the watcher process,
        # in management commands (migrate, shell, etc.), and in tests.
        if os.environ.get("RUN_MAIN") != "true":
            return

        from .scheduler import start
        start()
