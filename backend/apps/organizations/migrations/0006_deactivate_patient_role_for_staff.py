from django.db import migrations


def deactivate_patient_role_for_staff(apps, schema_editor):
    Membership = apps.get_model("organizations", "Membership")
    staff_user_ids = Membership.objects.filter(
        role__in=("DENTIST", "BRANCH_ADMIN", "ORGANIZATION_ADMIN"),
        is_active=True,
    ).values_list("user_id", flat=True)
    Membership.objects.filter(
        user_id__in=staff_user_ids,
        role="PATIENT",
        is_active=True,
    ).update(is_active=False)


class Migration(migrations.Migration):
    dependencies = [("organizations", "0005_set_default_cancellation_cutoff_24h")]

    operations = [migrations.RunPython(deactivate_patient_role_for_staff, migrations.RunPython.noop)]
