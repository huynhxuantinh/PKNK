import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .emailing import send_branded_email

from .models import Notification, NotificationDelivery

logger = logging.getLogger(__name__)

EMAIL_DELIVERY_MAX_ATTEMPTS = 5
EMAIL_DELIVERY_RETRY_DELAY = timedelta(minutes=5)
EMAIL_DELIVERY_LOCK_TIMEOUT = timedelta(minutes=10)
EMAIL_DELIVERY_RECOVERY_BATCH_SIZE = 100


@shared_task
def deliver_notification_email(delivery_id):
    now = timezone.now()
    with transaction.atomic():
        delivery = NotificationDelivery.objects.select_for_update().select_related(
            "notification__recipient"
        ).get(pk=delivery_id, channel=NotificationDelivery.Channel.EMAIL)
        if delivery.status in {
            NotificationDelivery.Status.SENT,
            NotificationDelivery.Status.SKIPPED,
        }:
            return 0
        if (
            delivery.status == NotificationDelivery.Status.SENDING
            and delivery.locked_at
            and delivery.locked_at > now - EMAIL_DELIVERY_LOCK_TIMEOUT
        ):
            return 0
        if delivery.attempts >= EMAIL_DELIVERY_MAX_ATTEMPTS:
            delivery.status = NotificationDelivery.Status.FAILED
            delivery.locked_at = None
            delivery.last_error = "MAX_ATTEMPTS_EXCEEDED"
            delivery.save(update_fields=["status", "locked_at", "last_error", "updated_at"])
            logger.error(
                "Notification email permanently failed delivery_id=%s attempts=%s",
                delivery.pk,
                delivery.attempts,
            )
            return 0
        recipient = delivery.notification.recipient
        if not recipient.is_active or recipient.email_verified_at is None:
            delivery.status = NotificationDelivery.Status.SKIPPED
            delivery.locked_at = None
            delivery.last_error = "RECIPIENT_UNAVAILABLE"
            delivery.save(update_fields=["status", "locked_at", "last_error", "updated_at"])
            return 0
        delivery.status = NotificationDelivery.Status.SENDING
        delivery.attempts += 1
        delivery.locked_at = now
        delivery.last_error = ""
        delivery.save(update_fields=["status", "attempts", "locked_at", "last_error", "updated_at"])
        subject = delivery.notification.title
        recipient_email = recipient.email

    try:
        sent = send_branded_email(
            subject=subject,
            recipient=recipient_email,
            heading=subject,
            message=delivery.notification.body,
            action_label="Mở thông báo",
            action_url=f"{settings.FRONTEND_URL.rstrip('/')}/thong-bao",
        )
        if sent == 0:
            raise RuntimeError("Email backend reported no messages sent")
    except Exception as error:
        now = timezone.now()
        error_name = error.__class__.__name__[:80]
        last_error = (
            f"MAX_ATTEMPTS_EXCEEDED:{error_name}"
            if delivery.attempts >= EMAIL_DELIVERY_MAX_ATTEMPTS
            else error_name
        )
        NotificationDelivery.objects.filter(pk=delivery_id).update(
            status=NotificationDelivery.Status.FAILED,
            locked_at=None,
            last_error=last_error[:100],
            updated_at=now,
        )
        logger.exception(
            "Notification email send failed delivery_id=%s attempt=%s max_attempts=%s",
            delivery_id,
            delivery.attempts,
            EMAIL_DELIVERY_MAX_ATTEMPTS,
        )
        return 0

    NotificationDelivery.objects.filter(pk=delivery_id).update(
        status=NotificationDelivery.Status.SENT,
        sent_at=timezone.now(),
        locked_at=None,
        last_error="",
        updated_at=timezone.now(),
    )
    logger.info(
        "Notification email sent delivery_id=%s attempt=%s",
        delivery_id,
        delivery.attempts,
    )
    return sent


@shared_task
def recover_notification_email_deliveries(now=None):
    """Requeue lost, failed, and abandoned email deliveries with a bounded retry budget."""
    now = now or timezone.now()
    retry_cutoff = now - EMAIL_DELIVERY_RETRY_DELAY
    stale_lock_cutoff = now - EMAIL_DELIVERY_LOCK_TIMEOUT
    base = NotificationDelivery.objects.filter(
        channel=NotificationDelivery.Channel.EMAIL,
    )

    exhausted_filter = (
        Q(
            status__in=[
                NotificationDelivery.Status.PENDING,
                NotificationDelivery.Status.FAILED,
            ],
            attempts__gte=EMAIL_DELIVERY_MAX_ATTEMPTS,
        )
        | Q(
            status=NotificationDelivery.Status.SENDING,
            attempts__gte=EMAIL_DELIVERY_MAX_ATTEMPTS,
            locked_at__isnull=True,
        )
        | Q(
            status=NotificationDelivery.Status.SENDING,
            attempts__gte=EMAIL_DELIVERY_MAX_ATTEMPTS,
            locked_at__lte=stale_lock_cutoff,
        )
    )
    recoverable_filter = (
        Q(
            status=NotificationDelivery.Status.PENDING,
            attempts__lt=EMAIL_DELIVERY_MAX_ATTEMPTS,
            created_at__lte=retry_cutoff,
        )
        | Q(
            status=NotificationDelivery.Status.FAILED,
            attempts__lt=EMAIL_DELIVERY_MAX_ATTEMPTS,
            updated_at__lte=retry_cutoff,
        )
        | Q(
            status=NotificationDelivery.Status.SENDING,
            attempts__lt=EMAIL_DELIVERY_MAX_ATTEMPTS,
            locked_at__isnull=True,
        )
        | Q(
            status=NotificationDelivery.Status.SENDING,
            attempts__lt=EMAIL_DELIVERY_MAX_ATTEMPTS,
            locked_at__lte=stale_lock_cutoff,
        )
    )
    retry_lock_expired = Q(locked_at__isnull=True) | Q(locked_at__lte=retry_cutoff)

    with transaction.atomic():
        exhausted_deliveries = list(
            base.filter(exhausted_filter)
            .select_for_update(skip_locked=True)
            .order_by("pk")
            [:EMAIL_DELIVERY_RECOVERY_BATCH_SIZE]
        )
        exhausted_ids = [delivery.pk for delivery in exhausted_deliveries]
        for delivery in exhausted_deliveries:
            # The database trigger allows PENDING -> SENDING -> FAILED and
            # FAILED -> SENDING -> FAILED, but rejects same-state updates.
            if delivery.status in {
                NotificationDelivery.Status.PENDING,
                NotificationDelivery.Status.FAILED,
            }:
                delivery.status = NotificationDelivery.Status.SENDING
                delivery.locked_at = now
                delivery.save(update_fields=["status", "locked_at", "updated_at"])
            delivery.status = NotificationDelivery.Status.FAILED
            delivery.locked_at = None
            delivery.last_error = "MAX_ATTEMPTS_EXCEEDED"
            delivery.updated_at = now
            delivery.save(
                update_fields=["status", "locked_at", "last_error", "updated_at"]
            )
            logger.error(
                "Notification email exhausted retries delivery_id=%s attempts=%s",
                delivery.pk,
                delivery.attempts,
            )

        remaining = EMAIL_DELIVERY_RECOVERY_BATCH_SIZE - len(exhausted_ids)
        recoverable = base.filter(recoverable_filter).filter(
            Q(status=NotificationDelivery.Status.SENDING) | retry_lock_expired
        )
        deliveries = list(
            recoverable.select_for_update(skip_locked=True)
            .order_by("pk")[:remaining]
        ) if remaining else []

        delivery_ids = []
        for delivery in deliveries:
            if delivery.status == NotificationDelivery.Status.SENDING:
                # Recover an abandoned worker through an allowed transition.
                delivery.status = NotificationDelivery.Status.FAILED
                delivery.last_error = "SENDING_LOCK_EXPIRED"
                delivery.locked_at = None
                delivery.updated_at = now
                delivery.save(
                    update_fields=["status", "locked_at", "last_error", "updated_at"]
                )
            # Leave PENDING/FAILED unchanged; the delivery task acquires its
            # own lock and performs the valid transition to SENDING.
            delivery_ids.append(delivery.pk)

        if delivery_ids:
            transaction.on_commit(
                lambda ids=delivery_ids: _enqueue_recovered_deliveries(ids)
            )

    logger.info(
        "Notification email recovery queued=%s exhausted=%s",
        len(delivery_ids),
        len(exhausted_ids),
    )
    return {"queued": len(delivery_ids), "exhausted": len(exhausted_ids)}


def enqueue_notification_email(delivery_id):
    try:
        deliver_notification_email.delay(delivery_id)
        return True
    except Exception:
        logger.exception(
            "Could not enqueue notification email delivery_id=%s",
            delivery_id,
        )
        return False


def _enqueue_recovered_deliveries(delivery_ids):
    for delivery_id in delivery_ids:
        enqueue_notification_email(delivery_id)


@shared_task
def publish_due_appointment_reminders(now=None):
    from apps.scheduling.models import Appointment

    from .services import NotificationService

    now = now or timezone.now()
    in_two_hours = now + timedelta(hours=2)
    in_twenty_four_hours = now + timedelta(hours=24)
    appointments = Appointment.objects.filter(
        status=Appointment.Status.CONFIRMED,
        starts_at__gt=now,
        starts_at__lte=in_twenty_four_hours,
    ).select_related("patient_profile__user")

    published = 0
    for appointment in appointments:
        event_type = (
            Notification.Type.APPOINTMENT_REMINDER_2H
            if appointment.starts_at <= in_two_hours
            else Notification.Type.APPOINTMENT_REMINDER_24H
        )
        event_key = f"scheduling:appointment:{appointment.pk}:{event_type}"
        existed = Notification.objects.filter(event_key=event_key).exists()
        NotificationService.publish_appointment_reminder(
            appointment=appointment,
            event_type=event_type,
        )
        if not existed:
            published += 1
    return published
