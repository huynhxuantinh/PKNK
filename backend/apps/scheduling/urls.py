from django.urls import path

from .views import (
    AppointmentConfirmAPIView,
    AppointmentHoldCreateAPIView,
    SlotListAPIView,
)


app_name = "scheduling"

urlpatterns = [
    path("slots/", SlotListAPIView.as_view(), name="slot-list"),
    path(
        "appointments/holds/",
        AppointmentHoldCreateAPIView.as_view(),
        name="appointment-hold",
    ),
    path(
        "appointments/<str:public_code>/confirm/",
        AppointmentConfirmAPIView.as_view(),
        name="appointment-confirm",
    ),
]
