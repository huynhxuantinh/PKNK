import os
import re

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403


if len(SECRET_KEY) < 50 or "replace" in SECRET_KEY.lower():  # noqa: F405
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must be a strong deployment secret provided via .env."
    )
if not REDIS_CACHE_URL:  # noqa: F405
    raise ImproperlyConfigured(
        "REDIS_CACHE_URL is required in production so throttles share one cache."
    )
if "DRF_NUM_PROXIES" not in os.environ:
    raise ImproperlyConfigured(
        "DRF_NUM_PROXIES must match the number of trusted reverse proxies."
    )
if (  # noqa: F405
    not re.fullmatch(r"[A-Za-z0-9_-]{12,64}", ADMIN_PATH)
    or ADMIN_PATH == "admin"
    or "replace" in ADMIN_PATH.lower()
):
    raise ImproperlyConfigured(
        "DJANGO_ADMIN_PATH must be a non-default path of 12-64 letters, numbers, underscores or hyphens."
    )


DEBUG = False
API_DOCS_ENABLED = False
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31_536_000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

