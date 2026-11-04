from django.core.paginator import Paginator
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import Notification
from .serializers import NotificationSerializer


class NotificationQuerySerializer(serializers.Serializer):
    unread = serializers.BooleanField(required=False)
    page = serializers.IntegerField(required=False, min_value=1, default=1)


class NotificationListAPIView(APIView):
    # Notifications are recipient-scoped below, so both patients and staff can
    # safely read only their own in-app inbox.
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "patient_read"
    serializer_class = NotificationSerializer

    @extend_schema(
        operation_id="notification_list",
        parameters=[
            OpenApiParameter(name="unread", type=bool, required=False),
            OpenApiParameter(name="page", type=int, required=False),
        ],
        responses={200: NotificationSerializer(many=True)},
    )
    def get(self, request):
        query = NotificationQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        user_notifications = Notification.objects.filter(recipient=request.user)
        unread_count = user_notifications.filter(read_at__isnull=True).count()
        notifications = user_notifications
        if query.validated_data.get("unread"):
            notifications = notifications.filter(read_at__isnull=True)
        paginator = Paginator(notifications, 20)
        page = paginator.get_page(query.validated_data["page"])
        data = NotificationSerializer(page.object_list, many=True).data
        return Response(
            {
                "data": data,
                "meta": {
                    "count": paginator.count,
                    "page": page.number,
                    "page_size": paginator.per_page,
                    "total_pages": paginator.num_pages,
                    "unread_count": unread_count,
                },
            }
        )


class NotificationReadAPIView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "patient_read"
    serializer_class = NotificationSerializer

    @extend_schema(request=None, responses={200: NotificationSerializer})
    def post(self, request, notification_id):
        notification = get_object_or_404(
            Notification.objects.filter(recipient=request.user), pk=notification_id
        )
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at"])
        return Response({"data": NotificationSerializer(notification).data})


class NotificationReadAllAPIView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "patient_read"
    serializer_class = NotificationSerializer

    @extend_schema(request=None, responses={200: dict})
    def post(self, request):
        updated = Notification.objects.filter(
            recipient=request.user, read_at__isnull=True
        ).update(read_at=timezone.now())
        return Response({"data": {"updated": updated}})
