import os

from .base import *  # noqa: F403


DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() == "true"
API_DOCS_ENABLED = True

