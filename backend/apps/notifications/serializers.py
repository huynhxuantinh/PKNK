from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = (
            "id_notification", "type", "title", "body", "payload",
            "resource_type", "resource_id", "read_at", "created_at",
        )
