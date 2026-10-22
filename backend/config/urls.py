from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from .views import health_check


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="health-check"),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/patients/", include("apps.accounts.patient_urls")),
    path("api/v1/branches/", include("apps.locations.urls")),
    path("api/v1/scheduling/", include("apps.scheduling.urls")),
    path("api/v1/audit/", include("apps.audit.urls")),
    path("api/v1/management/", include("apps.management_api.urls")),
    path("api/v1/dentist/", include("apps.dentist_api.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
]

