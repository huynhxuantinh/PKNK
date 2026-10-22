from django.conf import settings
from django.db import models


class AuditEvent(models.Model):
    class AccessType(models.TextChoices):
        READ = "READ", "Đọc"
        WRITE = "WRITE", "Thay đổi"

    id_audit_event = models.BigAutoField(primary_key=True)
    actor_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        db_column="id_actor_user",
        on_delete=models.PROTECT,
        related_name="audit_events",
        null=True,
        blank=True,
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        db_column="id_organization",
        on_delete=models.PROTECT,
        related_name="audit_events",
        null=True,
        blank=True,
    )
    branch = models.ForeignKey(
        "locations.Branch",
        db_column="id_branch",
        on_delete=models.PROTECT,
        related_name="audit_events",
        null=True,
        blank=True,
    )
    action = models.CharField(max_length=100)
    resource_type = models.CharField(max_length=100)
    resource_id = models.CharField(max_length=128, null=True, blank=True)
    access_type = models.CharField(max_length=10, choices=AccessType.choices)
    before_data = models.JSONField(default=dict, blank=True)
    after_data = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    request_id = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_events"
        ordering = ["-created_at", "-id_audit_event"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(access_type__in=["READ", "WRITE"]),
                name="ck_audit_events_access_type",
            ),
            models.CheckConstraint(
                condition=models.Q(branch__isnull=True)
                | models.Q(organization__isnull=False),
                name="ck_audit_branch_requires_org",
            ),
        ]
        indexes = [
            models.Index(
                fields=["organization", "-created_at"],
                name="idx_audit_org_created",
            ),
            models.Index(
                fields=["branch", "-created_at"],
                name="idx_audit_branch_created",
            ),
            models.Index(
                fields=["actor_user", "-created_at"],
                name="idx_audit_actor_created",
            ),
            models.Index(
                fields=["resource_type", "resource_id"],
                name="idx_audit_resource",
            ),
        ]

    def __str__(self):
        return f"{self.action} {self.resource_type}:{self.resource_id or '-'}"
