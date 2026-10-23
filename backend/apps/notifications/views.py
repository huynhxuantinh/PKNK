from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.permissions import IsPatientOnly

from .models import Notification
from .serializers import NotificationSerializer


class NotificationQuerySerializer(serializers.Serializer):
    unread = serializers.BooleanField(required=False)


class NotificationListAPIView(APIView):
    permission_classes = [IsAuthenticated, IsPatientOnly]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "patient_read"
    serializer_class = NotificationSerializer

    @extend_schema(
        operation_id="notification_list",
        parameters=[OpenApiParameter(name="unread", type=bool, required=False)],
        responses={200: NotificationSerializer(many=True)},
    )
    def get(self, request):
        query = NotificationQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        notifications = Notification.objects.filter(recipient=request.user)
        if query.validated_data.get("unread"):
            notifications = notifications.filter(read_at__isnull=True)
        data = NotificationSerializer(notifications, many=True).data
        return Response({"data": data, "meta": {"count": len(data)}})


class NotificationReadAPIView(APIView):
    permission_classes = [IsAuthenticated, IsPatientOnly]
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
    permission_classes = [IsAuthenticated, IsPatientOnly]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "patient_read"
    serializer_class = NotificationSerializer

    @extend_schema(request=None, responses={200: dict})
    def post(self, request):
        updated = Notification.objects.filter(
            recipient=request.user, read_at__isnull=True
        ).update(read_at=timezone.now())
        return Response({"data": {"updated": updated}})
