from django.db import transaction
from django.utils import timezone

from apps.audit.services import AuditService
from apps.scheduling.models import ACTIVE_APPOINTMENT_STATUSES, Appointment

from .exceptions import ManagementConflict


def active_future_appointments(**filters):
    return Appointment.objects.select_for_update().filter(
        status__in=ACTIVE_APPOINTMENT_STATUSES,
        starts_at__gte=timezone.now(),
        **filters,
    )


def ensure_no_active_future_appointments(message, **filters):
    if active_future_appointments(**filters).exists():
        raise ManagementConflict(message)


def audit_model_change(
    *, request, instance, action, before_data=None, after_data=None, organization=None, branch=None
):
    organization = organization or getattr(instance, "organization", None)
    branch = branch or (instance if instance.__class__.__name__ == "Branch" else None)
    if branch is None:
        branch = getattr(instance, "branch", None)
    AuditService.record_write(
        actor_user=request.user,
        organization=organization,
        branch=branch,
        action=action,
        resource_type=instance.__class__.__name__,
        resource_id=instance.pk,
        before_data=before_data or {},
        after_data=after_data or {},
        request=request,
    )


@transaction.atomic
def deactivate_guarded(instance, *, request, appointment_filters, action, message):
    locked = instance.__class__.objects.select_for_update().get(pk=instance.pk)
    ensure_no_active_future_appointments(message, **appointment_filters)
    before = {"is_active": locked.is_active}
    locked.is_active = False
    locked.save(update_fields=["is_active"] + (["updated_at"] if hasattr(locked, "updated_at") else []))
    audit_model_change(
        request=request,
        instance=locked,
        action=action,
        before_data=before,
        after_data={"is_active": False},
    )
    return locked
