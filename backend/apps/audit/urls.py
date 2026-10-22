from django.urls import path

from .views import OrganizationAuditEventListAPIView


app_name = "audit"

urlpatterns = [
    path(
        "organizations/<int:organization_id>/events/",
        OrganizationAuditEventListAPIView.as_view(),
        name="organization-events",
    ),
]
