import os

from .base import *  # noqa: F401, F403

DEBUG = False

# Fail loudly if SECRET_KEY is not explicitly set
if SECRET_KEY == "insecure-dev-key-change-me":  # noqa: F405
    raise RuntimeError("DJANGO_SECRET_KEY must be set in production.")

# In production, cookies must be secure
JWT_AUTH_COOKIE_SECURE = True
JWT_AUTH_COOKIE_SAMESITE = "Lax"

# Security headers
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_SSL_REDIRECT = os.environ.get("SECURE_SSL_REDIRECT", "False").lower() in ("true", "1", "yes")
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# CSRF trusted origins — override from base only if explicitly set
_csrf_prod = os.environ.get("CSRF_TRUSTED_ORIGINS", "").strip()
if _csrf_prod:
    CSRF_TRUSTED_ORIGINS = [o.strip() for o in _csrf_prod.split(",") if o.strip()]
