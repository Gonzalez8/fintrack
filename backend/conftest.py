"""Root conftest — disables DRF throttling and isolates the cache per test."""

import pytest


@pytest.fixture(autouse=True)
def _disable_throttling(settings):
    rf = {**settings.REST_FRAMEWORK}
    rf["DEFAULT_THROTTLE_RATES"] = {
        "anon": "99999/minute",
        "user": "99999/minute",
        "auth_login": "99999/minute",
        "auth_register": "99999/minute",
        "auth_google": "99999/minute",
        "auth_password": "99999/minute",
    }
    settings.REST_FRAMEWORK = rf


@pytest.fixture(autouse=True)
def _isolated_cache(settings):
    """Use an empty in-memory cache per test.

    The dev cache is the shared Redis, which outlives the test database: user
    ids restart on every run, so a new user could read another run's cached
    Settings (e.g. LIFO instead of the default FIFO).
    """
    from django.core.cache import cache

    settings.CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
    cache.clear()
