from rest_framework import serializers

from .models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor_user.email", read_only=True)
    actor_user_id = serializers.IntegerField(read_only=True)
    organization_id = serializers.IntegerField(read_only=True)
    branch_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = AuditEvent
        fields = (
            "id_audit_event",
            "actor_user_id",
            "actor_email",
            "organization_id",
            "branch_id",
            "action",
            "resource_type",
            "resource_id",
            "access_type",
            "before_data",
            "after_data",
            "ip_address",
            "user_agent",
            "request_id",
            "created_at",
        )


class AuditEventFilterSerializer(serializers.Serializer):
    branch_id = serializers.IntegerField(required=False, min_value=1)
    action = serializers.CharField(required=False, max_length=100)
    access_type = serializers.ChoiceField(
        required=False, choices=AuditEvent.AccessType.choices
    )
