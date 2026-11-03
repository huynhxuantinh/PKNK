from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("scheduling", "0008_appointment_booking_contact_and_note")]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="hold_idempotency_key",
            field=models.CharField(blank=True, max_length=64, null=True, unique=True),
        ),
    ]
