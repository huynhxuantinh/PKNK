from django.urls import path

from .views import NotificationListAPIView, NotificationReadAPIView, NotificationReadAllAPIView


app_name = "notifications"

urlpatterns = [
    path("", NotificationListAPIView.as_view(), name="list"),
    path("read-all/", NotificationReadAllAPIView.as_view(), name="read-all"),
    path("<int:notification_id>/read/", NotificationReadAPIView.as_view(), name="read"),
]
