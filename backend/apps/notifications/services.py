from django.db import models, transaction
from django.utils import timezone

from apps.organizations.models import Membership

from .models import Notification, NotificationDelivery


class NotificationService:
    CONTENT = {
        Notification.Type.INVOICE_ISSUED: (
            "Hóa đơn đã được phát hành",
            "Hóa đơn của bạn đã được phát hành. Đăng nhập để xem chi tiết.",
        ),
        Notification.Type.INVOICE_PAID: (
            "Đã ghi nhận thanh toán",
            "Phòng khám đã ghi nhận thanh toán hóa đơn của bạn.",
        ),
        Notification.Type.APPOINTMENT_BOOKED: (
            "Đặt lịch thành công",
            "Lịch hẹn của bạn đã được ghi nhận. Mở chi tiết lịch hẹn để kiểm tra.",
        ),
        Notification.Type.APPOINTMENT_PENDING_REVIEW: (
            "Có lịch hẹn mới chờ xác nhận",
            "Một lịch hẹn mới tại chi nhánh đang chờ quản lý xác nhận.",
        ),
        Notification.Type.APPOINTMENT_CONFIRMED: (
            "Lịch hẹn đã được xác nhận",
            "Phòng khám đã xác nhận lịch hẹn của bạn.",
        ),
        Notification.Type.APPOINTMENT_CANCELLED: (
            "Lịch hẹn đã được hủy",
            "Lịch hẹn của bạn đã được hủy.",
        ),
        Notification.Type.APPOINTMENT_RESCHEDULED: (
            "Lịch hẹn đã được dời",
            "Lịch hẹn của bạn đã được chuyển sang thời gian mới.",
        ),
        Notification.Type.APPOINTMENT_REMINDER_24H: (
            "Nhắc lịch hẹn ngày mai",
            "Bạn có lịch hẹn nha khoa trong vòng 24 giờ tới.",
        ),
        Notification.Type.APPOINTMENT_REMINDER_2H: (
            "Sắp đến giờ hẹn",
            "Bạn có lịch hẹn nha khoa trong vòng 2 giờ tới.",
        ),
    }

    @classmethod
    @transaction.atomic
    def _publish_in_app(
        cls, *, recipient, event_type, event_key, payload, resource_type, resource_id
    ):
        title, body = cls.CONTENT[event_type]
        notification, _ = Notification.objects.get_or_create(
            event_key=event_key,
            defaults={
                "recipient": recipient,
                "type": event_type,
                "title": title,
                "body": body,
                "payload": payload,
                "resource_type": resource_type,
                "resource_id": str(resource_id),
            },
        )
        NotificationDelivery.objects.get_or_create(
            notification=notification,
            channel=NotificationDelivery.Channel.IN_APP,
            defaults={
                "status": NotificationDelivery.Status.SENT,
                "sent_at": timezone.now(),
                "idempotency_key": f"{event_key}:in_app",
            },
        )
        return notification

    @staticmethod
    def _appointment_payload(appointment):
        return {
            "appointment_id": appointment.pk,
            "public_code": appointment.public_code,
            "branch_id": appointment.branch_id,
            "starts_at": appointment.starts_at.isoformat(),
            "status": appointment.status,
        }

    @classmethod
    def publish_appointment_transition(cls, *, appointment, from_status, to_status):
        event_type = {
            ("HELD", "PENDING"): Notification.Type.APPOINTMENT_BOOKED,
            ("HELD", "CONFIRMED"): Notification.Type.APPOINTMENT_BOOKED,
            ("PENDING", "CONFIRMED"): Notification.Type.APPOINTMENT_CONFIRMED,
            ("PENDING", "CANCELLED"): Notification.Type.APPOINTMENT_CANCELLED,
            ("CONFIRMED", "CANCELLED"): Notification.Type.APPOINTMENT_CANCELLED,
            ("CHECKED_IN", "CANCELLED"): Notification.Type.APPOINTMENT_CANCELLED,
        }.get((from_status, to_status))
        if event_type is None:
            return None
        notification = cls._publish_in_app(
            recipient=appointment.patient_profile.user,
            event_type=event_type,
            event_key=f"scheduling:appointment:{appointment.pk}:{event_type}",
            payload=cls._appointment_payload(appointment),
            resource_type="Appointment",
            resource_id=appointment.pk,
        )
        if (from_status, to_status) == ("HELD", "PENDING"):
            cls.publish_pending_appointment_for_managers(appointment=appointment)
        return notification

    @classmethod
    def publish_pending_appointment_for_managers(cls, *, appointment):
        """Notify staff who can confirm a newly pending appointment."""
        managers = Membership.objects.filter(
            organization_id=appointment.branch.organization_id,
            is_active=True,
            user__is_active=True,
        ).filter(
            models.Q(
                role=Membership.Role.BRANCH_ADMIN,
                branch_id=appointment.branch_id,
            )
            | models.Q(
                role=Membership.Role.ORGANIZATION_ADMIN,
                branch__isnull=True,
            )
        ).select_related("user")

        payload = cls._appointment_payload(appointment)
        payload["requires_confirmation"] = True
        notifications = []
        for membership in managers:
            notifications.append(
                cls._publish_in_app(
                    recipient=membership.user,
                    event_type=Notification.Type.APPOINTMENT_PENDING_REVIEW,
                    event_key=(
                        f"scheduling:appointment:{appointment.pk}:"
                        f"{Notification.Type.APPOINTMENT_PENDING_REVIEW}:user:{membership.user_id}"
                    ),
                    payload=payload,
                    resource_type="Appointment",
                    resource_id=appointment.pk,
                )
            )
        return notifications

    @classmethod
    def publish_appointment_rescheduled(cls, *, original, successor):
        payload = cls._appointment_payload(successor)
        payload.update(
            {
                "previous_appointment_id": original.pk,
                "previous_public_code": original.public_code,
                "previous_starts_at": original.starts_at.isoformat(),
            }
        )
        notification = cls._publish_in_app(
            recipient=successor.patient_profile.user,
            event_type=Notification.Type.APPOINTMENT_RESCHEDULED,
            event_key=(
                f"scheduling:appointment:{successor.pk}:"
                f"{Notification.Type.APPOINTMENT_RESCHEDULED}"
            ),
            payload=payload,
            resource_type="Appointment",
            resource_id=successor.pk,
        )
        if successor.status == "PENDING":
            cls.publish_pending_appointment_for_managers(appointment=successor)
        return notification

    @classmethod
    def publish_appointment_reminder(cls, *, appointment, event_type):
        if event_type not in {
            Notification.Type.APPOINTMENT_REMINDER_24H,
            Notification.Type.APPOINTMENT_REMINDER_2H,
        }:
            raise ValueError("Loại thông báo nhắc lịch không hợp lệ.")
        return cls._publish_in_app(
            recipient=appointment.patient_profile.user,
            event_type=event_type,
            event_key=f"scheduling:appointment:{appointment.pk}:{event_type}",
            payload=cls._appointment_payload(appointment),
            resource_type="Appointment",
            resource_id=appointment.pk,
        )

    @classmethod
    def publish_invoice_event(cls, *, invoice, event_type, event_suffix):
        title, body = cls.CONTENT[event_type]
        event_key = f"billing:invoice:{invoice.pk}:{event_type}:{event_suffix}"
        notification, created = Notification.objects.get_or_create(
            event_key=event_key,
            defaults={
                "recipient": invoice.patient_profile.user,
                "type": event_type,
                "title": title,
                "body": body,
                "payload": {"invoice_id": invoice.pk, "status": invoice.status},
                "resource_type": "Invoice",
                "resource_id": str(invoice.pk),
            },
        )
        if not created:
            return notification
        now = timezone.now()
        NotificationDelivery.objects.bulk_create([
            NotificationDelivery(
                notification=notification,
                channel=NotificationDelivery.Channel.IN_APP,
                status=NotificationDelivery.Status.SENT,
                sent_at=now,
                idempotency_key=f"{event_key}:in_app",
            ),
            NotificationDelivery(
                notification=notification,
                channel=NotificationDelivery.Channel.EMAIL,
                status=NotificationDelivery.Status.PENDING,
                idempotency_key=f"{event_key}:email",
            ),
        ])
        email_delivery_id = notification.deliveries.get(
            channel=NotificationDelivery.Channel.EMAIL
        ).pk
        from .tasks import deliver_notification_email
        transaction.on_commit(lambda: deliver_notification_email.delay(email_delivery_id))
        return notification
