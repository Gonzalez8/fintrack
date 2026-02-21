from .base import *  # noqa: F401, F403

DEBUG = True
ALLOWED_HOSTS = ["*"]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "loggers": {
        "apps.assets.scheduler": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}
