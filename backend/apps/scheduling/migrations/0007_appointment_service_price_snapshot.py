from django.db import migrations, models


def backfill_service_price_snapshot(apps, schema_editor):
    Appointment = apps.get_model("scheduling", "Appointment")
    BranchService = apps.get_model("catalog", "BranchService")
    prices = dict(BranchService.objects.values_list("id_branch_service", "price"))
    batch = []
    for appointment in Appointment.objects.filter(service_price_snapshot__isnull=True).iterator(chunk_size=1000):
        appointment.service_price_snapshot = prices[appointment.branch_service_id]
        batch.append(appointment)
        if len(batch) == 1000:
            Appointment.objects.bulk_update(batch, ["service_price_snapshot"])
            batch = []
    if batch:
        Appointment.objects.bulk_update(batch, ["service_price_snapshot"])


class Migration(migrations.Migration):
    dependencies = [("scheduling", "0006_appointment_reschedule_idempotency_and_scope")]
    operations = [
        migrations.AddField(
            model_name="appointment",
            name="service_price_snapshot",
            field=models.DecimalField(decimal_places=2, max_digits=14, null=True),
        ),
        migrations.RunPython(backfill_service_price_snapshot, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="appointment",
            name="service_price_snapshot",
            field=models.DecimalField(decimal_places=2, max_digits=14),
        ),
    ]
