from django.urls import path

from .api_views import (
    BranchDentistsAPIView,
    BranchDetailAPIView,
    BranchListAPIView,
    BranchServicesAPIView,
    ProvinceListAPIView,
    WardListAPIView,
)


app_name = "branches"

urlpatterns = [
    path("locations/provinces/", ProvinceListAPIView.as_view(), name="province-list"),
    path("locations/wards/", WardListAPIView.as_view(), name="ward-list"),
    path("", BranchListAPIView.as_view(), name="list"),
    path(
        "<int:id_branch>/services/",
        BranchServicesAPIView.as_view(),
        name="services",
    ),
    path(
        "<int:id_branch>/dentists/",
        BranchDentistsAPIView.as_view(),
        name="dentists",
    ),
    path("<int:id_branch>/", BranchDetailAPIView.as_view(), name="detail"),
]
