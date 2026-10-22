from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from .models import Notification, NotificationDelivery


@shared_task(bind=True, max_retries=3)
def deliver_notification_email(self, delivery_id):
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
            and delivery.locked_at > now - timedelta(minutes=10)
        ):
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
        sent = send_mail(
            subject=subject,
            message=(
                f"{delivery.notification.body}\n\n"
                f"Mở trang thông báo: {settings.FRONTEND_URL.rstrip('/')}/notifications"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
        )
    except Exception as error:
        NotificationDelivery.objects.filter(pk=delivery_id).update(
            status=NotificationDelivery.Status.FAILED,
            locked_at=None,
            last_error=error.__class__.__name__[:100],
        )
        raise self.retry(exc=error, countdown=min(60 * (2 ** self.request.retries), 900))

    NotificationDelivery.objects.filter(pk=delivery_id).update(
        status=NotificationDelivery.Status.SENT,
        sent_at=timezone.now(),
        locked_at=None,
        last_error="",
    )
    return sent


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
