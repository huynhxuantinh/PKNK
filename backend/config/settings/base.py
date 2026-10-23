import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[2]
ROOT_DIR = BASE_DIR.parent

load_dotenv(ROOT_DIR / ".env")

SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
DEBUG = False

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]

GIS_BIN_DIR = os.getenv("GIS_BIN_DIR", "")
if GIS_BIN_DIR:
    os.environ["PATH"] = f"{GIS_BIN_DIR}{os.pathsep}{os.environ.get('PATH', '')}"

GDAL_LIBRARY_PATH = os.getenv("GDAL_LIBRARY_PATH") or None
GEOS_LIBRARY_PATH = os.getenv("GEOS_LIBRARY_PATH") or None

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.gis",
    "django.contrib.postgres",
]

THIRD_PARTY_APPS = [
    "corsheaders",
    "django_filters",
    "rest_framework",
    "drf_spectacular",
    "rest_framework_simplejwt.token_blacklist",
]

LOCAL_APPS = [
    "apps.accounts",
    "apps.access_control",
    "apps.management_api",
    "apps.dentist_api",
    "apps.organizations",
    "apps.locations",
    "apps.catalog",
    "apps.scheduling",
    "apps.clinical",
    "apps.billing",
    "apps.notifications",
    "apps.audit",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "apps.audit.middleware.AuditRequestIdMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.contrib.gis.db.backends.postgis",
        "NAME": os.getenv("DB_NAME", "pknk"),
        "USER": os.getenv("DB_USER", "postgres"),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", "127.0.0.1"),
        "PORT": os.getenv("DB_PORT", "5432"),
        "CONN_MAX_AGE": 60,
    }
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "vi"
TIME_ZONE = "Asia/Ho_Chi_Minh"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = ROOT_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = ROOT_DIR / "media"

USE_S3_STORAGE = os.getenv("USE_S3_STORAGE", "false").lower() in {
    "1", "true", "yes"
}
if USE_S3_STORAGE:
    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {
                "access_key": os.environ["AWS_ACCESS_KEY_ID"],
                "secret_key": os.environ["AWS_SECRET_ACCESS_KEY"],
                "bucket_name": os.environ["AWS_STORAGE_BUCKET_NAME"],
                "endpoint_url": os.environ["AWS_S3_ENDPOINT_URL"],
                "region_name": os.getenv("AWS_S3_REGION_NAME", "us-east-1"),
                "addressing_style": "path",
                "default_acl": None,
                "file_overwrite": False,
                "querystring_auth": True,
                "object_parameters": {"CacheControl": "private, no-store"},
            },
        },
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
        },
    }

CLINICAL_ATTACHMENT_MAX_BYTES = int(
    os.getenv("CLINICAL_ATTACHMENT_MAX_BYTES", str(15 * 1024 * 1024))
)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

REDIS_CACHE_URL = os.getenv("REDIS_CACHE_URL")
if REDIS_CACHE_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_CACHE_URL,
        }
    }

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "NUM_PROXIES": int(os.getenv("DRF_NUM_PROXIES", "1")),
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_RATES": {
        "slot_search": "60/min",
        "appointment_booking": "10/min",
        "patient_appointments": "60/min",
        "auth_register": "5/hour",
        "auth_login": "10/min",
        "auth_login_email": "10/min",
        "auth_register_email": "3/hour",
        "auth_refresh": "30/min",
        "email_verification_confirm": "30/min",
        "email_verification_resend": "3/hour",
        "email_verification_resend_email": "3/hour",
        "password_reset_request": "5/hour",
        "password_reset_request_email": "3/hour",
        "password_reset_confirm": "10/min",
        "branch_list": "60/min",
        "branch_detail": "120/min",
        "branch_services": "120/min",
        "branch_dentists": "120/min",
        "audit_events": "60/min",
        "management_mutation": "120/min",
        "management_scheduling": "180/min",
        "dentist_read": "180/min",
        "dentist_mutation": "60/min",
        "clinical_attachment": "30/min",
        "management_reports": "60/min",
        "staff_invitation_accept": "10/min",
        "patient_read": "120/min",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id_user",
    "USER_ID_CLAIM": "user_id",
    "CHECK_REVOKE_TOKEN": True,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Dental Clinic Chain API",
    "DESCRIPTION": "API quản lý và đặt lịch chuỗi phòng khám nha khoa.",
    "VERSION": "1.0.0",
    "ENUM_NAME_OVERRIDES": {
        "AppointmentStatusEnum": [
            ("HELD", "Giữ chỗ"),
            ("PENDING", "Chờ xác nhận"),
            ("CONFIRMED", "Đã xác nhận"),
            ("CHECKED_IN", "Đã check-in"),
            ("IN_PROGRESS", "Đang khám"),
            ("COMPLETED", "Hoàn thành"),
            ("CANCELLED", "Đã hủy"),
            ("NO_SHOW", "Không đến"),
            ("EXPIRED", "Hết thời gian giữ chỗ"),
        ],
        "ClinicalEncounterStatusEnum": ["DRAFT", "FINALIZED"],
        "PrescriptionStatusEnum": ["DRAFT", "ISSUED", "VOID"],
        "TreatmentPlanStatusEnum": ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"],
        "TreatmentPlanItemStatusEnum": ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
    },
}

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6379/1")
CELERY_TIMEZONE = TIME_ZONE
CELERY_BEAT_SCHEDULE = {
    "expire-held-appointments-every-minute": {
        "task": "apps.scheduling.tasks.expire_held_appointments",
        "schedule": 60.0,
    },
    "publish-appointment-reminders-every-five-minutes": {
        "task": "apps.notifications.tasks.publish_due_appointment_reminders",
        "schedule": 300.0,
    },
}

EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "noreply@example.com")
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "true").lower() in {"1", "true", "yes"}
EMAIL_TIMEOUT = int(os.getenv("EMAIL_TIMEOUT", "10"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
EMAIL_VERIFICATION_TOKEN_TTL_MINUTES = int(
    os.getenv("EMAIL_VERIFICATION_TOKEN_TTL_MINUTES", "1440")
)
PASSWORD_RESET_TOKEN_TTL_MINUTES = int(
    os.getenv("PASSWORD_RESET_TOKEN_TTL_MINUTES", "60")
)
STAFF_INVITATION_TTL_HOURS = int(os.getenv("STAFF_INVITATION_TTL_HOURS", "72"))

MAX_ACTIVE_HOLDS_PER_PATIENT = int(
    os.getenv("MAX_ACTIVE_HOLDS_PER_PATIENT", "3")
)
PRIVACY_POLICY_VERSION = os.getenv("PRIVACY_POLICY_VERSION", "1.0")

