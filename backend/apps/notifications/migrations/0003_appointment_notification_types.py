from django.db import migrations, models


NOTIFICATION_TYPES = [
    "INVOICE_ISSUED",
    "INVOICE_PAID",
    "APPOINTMENT_BOOKED",
    "APPOINTMENT_CONFIRMED",
    "APPOINTMENT_CANCELLED",
    "APPOINTMENT_RESCHEDULED",
    "APPOINTMENT_REMINDER_24H",
    "APPOINTMENT_REMINDER_2H",
]


class Migration(migrations.Migration):
    dependencies = [("notifications", "0002_notification_integrity_triggers")]

    operations = [
        migrations.RemoveConstraint(
            model_name="notification",
            name="ck_notifications_type",
        ),
        migrations.AlterField(
            model_name="notification",
            name="type",
            field=models.CharField(
                choices=[
                    ("INVOICE_ISSUED", "Hóa đơn đã phát hành"),
                    ("INVOICE_PAID", "Hóa đơn đã thanh toán"),
                    ("APPOINTMENT_BOOKED", "Lịch hẹn đã đặt"),
                    ("APPOINTMENT_CONFIRMED", "Lịch hẹn đã xác nhận"),
                    ("APPOINTMENT_CANCELLED", "Lịch hẹn đã hủy"),
                    ("APPOINTMENT_RESCHEDULED", "Lịch hẹn đã dời"),
                    ("APPOINTMENT_REMINDER_24H", "Nhắc lịch trước 24 giờ"),
                    ("APPOINTMENT_REMINDER_2H", "Nhắc lịch trước 2 giờ"),
                ],
                max_length=50,
            ),
        ),
        migrations.AddConstraint(
            model_name="notification",
            constraint=models.CheckConstraint(
                condition=models.Q(type__in=NOTIFICATION_TYPES),
                name="ck_notifications_type",
            ),
        ),
    ]
