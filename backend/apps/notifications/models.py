from django.conf import settings
from django.db import models


class Notification(models.Model):
    class Type(models.TextChoices):
        INVOICE_ISSUED = "INVOICE_ISSUED", "Hóa đơn đã phát hành"
        INVOICE_PAID = "INVOICE_PAID", "Hóa đơn đã thanh toán"
        APPOINTMENT_BOOKED = "APPOINTMENT_BOOKED", "Lịch hẹn đã đặt"
        APPOINTMENT_PENDING_REVIEW = "APPOINTMENT_PENDING_REVIEW", "Lịch hẹn chờ xác nhận"
        APPOINTMENT_CONFIRMED = "APPOINTMENT_CONFIRMED", "Lịch hẹn đã xác nhận"
        APPOINTMENT_CANCELLED = "APPOINTMENT_CANCELLED", "Lịch hẹn đã hủy"
        APPOINTMENT_RESCHEDULED = "APPOINTMENT_RESCHEDULED", "Lịch hẹn đã dời"
        APPOINTMENT_REMINDER_24H = "APPOINTMENT_REMINDER_24H", "Nhắc lịch trước 24 giờ"
        APPOINTMENT_REMINDER_2H = "APPOINTMENT_REMINDER_2H", "Nhắc lịch trước 2 giờ"

    id_notification = models.BigAutoField(primary_key=True)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, db_column="id_recipient",
        on_delete=models.PROTECT, related_name="notifications",
    )
    type = models.CharField(max_length=50, choices=Type.choices)
    title = models.CharField(max_length=200)
    body = models.TextField()
    payload = models.JSONField(default=dict, blank=True)
    resource_type = models.CharField(max_length=100)
    resource_id = models.CharField(max_length=128)
    event_key = models.CharField(max_length=160, unique=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at", "-id_notification"]
        indexes = [
            models.Index(fields=["recipient", "read_at", "-created_at"], name="idx_notification_recipient"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(type__in=[
                    "INVOICE_ISSUED",
                    "INVOICE_PAID",
                    "APPOINTMENT_BOOKED",
                    "APPOINTMENT_PENDING_REVIEW",
                    "APPOINTMENT_CONFIRMED",
                    "APPOINTMENT_CANCELLED",
                    "APPOINTMENT_RESCHEDULED",
                    "APPOINTMENT_REMINDER_24H",
                    "APPOINTMENT_REMINDER_2H",
                ]),
                name="ck_notifications_type",
            ),
        ]


class NotificationDelivery(models.Model):
    class Channel(models.TextChoices):
        IN_APP = "IN_APP", "Trên web"
        EMAIL = "EMAIL", "Email"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Chờ gửi"
        SENDING = "SENDING", "Đang gửi"
        SENT = "SENT", "Đã gửi"
        FAILED = "FAILED", "Gửi lỗi"
        SKIPPED = "SKIPPED", "Bỏ qua"

    id_notification_delivery = models.BigAutoField(primary_key=True)
    notification = models.ForeignKey(
        Notification, db_column="id_notification",
        on_delete=models.PROTECT, related_name="deliveries",
    )
    channel = models.CharField(max_length=20, choices=Channel.choices)
    status = models.CharField(max_length=20, choices=Status.choices)
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.CharField(max_length=100, blank=True)
    locked_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=200, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "notification_deliveries"
        ordering = ["id_notification_delivery"]
        constraints = [
            models.UniqueConstraint(fields=["notification", "channel"], name="uq_notification_delivery_channel"),
            models.CheckConstraint(
                condition=models.Q(channel__in=["IN_APP", "EMAIL"]),
                name="ck_notification_deliveries_channel",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=["PENDING", "SENDING", "SENT", "FAILED", "SKIPPED"]),
                name="ck_notification_deliveries_status",
            ),
        ]
