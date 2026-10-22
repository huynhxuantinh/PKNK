import uuid
from collections.abc import Mapping
from datetime import date, datetime, time
from decimal import Decimal

from django.db.models import Model

from .models import AuditEvent


SENSITIVE_KEY_PARTS = {
    "authorization",
    "cookie",
    "password",
    "secret",
    "token",
}


def redact_sensitive(value):
    if isinstance(value, Mapping):
        sanitized = {}
        for key, item in value.items():
            normalized_key = str(key).lower()
            if any(part in normalized_key for part in SENSITIVE_KEY_PARTS):
                sanitized[str(key)] = "[REDACTED]"
            else:
                sanitized[str(key)] = redact_sensitive(item)
        return sanitized
    if isinstance(value, (list, tuple)):
        return [redact_sensitive(item) for item in value]
    if isinstance(value, Model):
        return value.pk
    if isinstance(value, (date, datetime, time, Decimal, uuid.UUID)):
        return str(value)
    if hasattr(value, "wkt"):
        return value.wkt
    return value


def _request_metadata(request):
    if request is None:
        return {"ip_address": None, "user_agent": "", "request_id": None}
    raw_request_id = getattr(request, "audit_request_id", None)
    try:
        request_id = uuid.UUID(str(raw_request_id)) if raw_request_id else None
    except (TypeError, ValueError, AttributeError):
        request_id = None
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip_address = (
        forwarded_for.split(",", 1)[0].strip()
        if forwarded_for
        else request.META.get("REMOTE_ADDR")
    )
    return {
        "ip_address": ip_address or None,
        "user_agent": request.META.get("HTTP_USER_AGENT", "")[:500],
        "request_id": request_id,
    }


class AuditService:
    @classmethod
    def _record(
        cls,
        *,
        access_type,
        action,
        resource_type,
        resource_id=None,
        actor_user=None,
        organization=None,
        branch=None,
        before_data=None,
        after_data=None,
        request=None,
    ):
        if branch is not None:
            organization = organization or branch.organization
            if branch.organization_id != organization.pk:
                raise ValueError("Chi nhánh không thuộc organization của audit event.")
        return AuditEvent.objects.create(
            actor_user=actor_user if getattr(actor_user, "is_authenticated", False) else None,
            organization=organization,
            branch=branch,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            access_type=access_type,
            before_data=redact_sensitive(before_data or {}),
            after_data=redact_sensitive(after_data or {}),
            **_request_metadata(request),
        )

    @classmethod
    def record_read(cls, **kwargs):
        return cls._record(access_type=AuditEvent.AccessType.READ, **kwargs)

    @classmethod
    def record_write(cls, **kwargs):
        return cls._record(access_type=AuditEvent.AccessType.WRITE, **kwargs)
