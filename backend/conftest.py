"""Root conftest — disables DRF throttling so tests are not rate-limited."""

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
