from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("scheduling", "0007_appointment_service_price_snapshot"),
    ]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="contact_name_snapshot",
            field=models.CharField(blank=True, max_length=200, null=True),
        ),
        migrations.AddField(
            model_name="appointment",
            name="contact_phone_snapshot",
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name="appointment",
            name="contact_email_snapshot",
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        migrations.AddField(
            model_name="appointment",
            name="patient_note",
            field=models.TextField(blank=True),
        ),
    ]
