from .base import *  # noqa: F401, F403

DEBUG = False

# In production, cookies must be secure
JWT_AUTH_COOKIE_SECURE = True
JWT_AUTH_COOKIE_SAMESITE = "Lax"
