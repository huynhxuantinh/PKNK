from django.db import migrations, models


ALLOW_LEGACY_BILLING_MARKER_UPDATE = r"""
CREATE OR REPLACE FUNCTION guard_clinical_encounter_immutable()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Clinical encounters cannot be deleted';
    END IF;
    IF OLD.status = 'FINALIZED'
       AND (to_jsonb(NEW) - 'legacy_billing_allowed')
           IS DISTINCT FROM (to_jsonb(OLD) - 'legacy_billing_allowed') THEN
        RAISE EXCEPTION 'Finalized clinical encounter is immutable';
    END IF;
    IF NEW.id_appointment IS DISTINCT FROM OLD.id_appointment
       OR NEW.id_created_by IS DISTINCT FROM OLD.id_created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Clinical encounter ownership is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""


RESTORE_FINALIZED_IMMUTABILITY = r"""
CREATE OR REPLACE FUNCTION guard_clinical_encounter_immutable()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Clinical encounters cannot be deleted';
    END IF;
    IF OLD.status = 'FINALIZED' THEN
        RAISE EXCEPTION 'Finalized clinical encounter is immutable';
    END IF;
    IF NEW.id_appointment IS DISTINCT FROM OLD.id_appointment
       OR NEW.id_created_by IS DISTINCT FROM OLD.id_created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Clinical encounter ownership is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""


def mark_completed_legacy_encounters(apps, schema_editor):
    ClinicalEncounter = apps.get_model("clinical", "ClinicalEncounter")
    ClinicalEncounter.objects.filter(
        appointment__status="COMPLETED",
        status="FINALIZED",
        performed_services_confirmed=False,
    ).update(legacy_billing_allowed=True)


class Migration(migrations.Migration):

    dependencies = [
        ("clinical", "0005_performed_services"),
    ]

    operations = [
        migrations.AddField(
            model_name="clinicalencounter",
            name="legacy_billing_allowed",
            field=models.BooleanField(default=False),
        ),
        migrations.RunSQL(
            ALLOW_LEGACY_BILLING_MARKER_UPDATE,
            RESTORE_FINALIZED_IMMUTABILITY,
        ),
        migrations.RunPython(mark_completed_legacy_encounters, migrations.RunPython.noop),
    ]
