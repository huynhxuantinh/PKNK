from django.db import migrations, models


CREATE_SCOPE_GUARDS = """
CREATE OR REPLACE FUNCTION validate_work_shift_organization()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM dentists d
        JOIN branches b ON b.id_branch = NEW.id_branch
        WHERE d.id_dentist = NEW.id_dentist
          AND d.id_organization = b.id_organization
    ) THEN
        RAISE EXCEPTION 'Dentist and branch must belong to the same organization';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_work_shifts_same_organization
BEFORE INSERT OR UPDATE OF id_dentist, id_branch ON work_shifts
FOR EACH ROW EXECUTE FUNCTION validate_work_shift_organization();

CREATE OR REPLACE FUNCTION validate_time_off_organization()
RETURNS trigger AS $$
BEGIN
    IF NEW.id_branch IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM dentists d
        JOIN branches b ON b.id_branch = NEW.id_branch
        WHERE d.id_dentist = NEW.id_dentist
          AND d.id_organization = b.id_organization
    ) THEN
        RAISE EXCEPTION 'Dentist and branch must belong to the same organization';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_time_offs_same_organization
BEFORE INSERT OR UPDATE OF id_dentist, id_branch ON time_offs
FOR EACH ROW EXECUTE FUNCTION validate_time_off_organization();
"""

DROP_SCOPE_GUARDS = """
DROP TRIGGER IF EXISTS trg_time_offs_same_organization ON time_offs;
DROP FUNCTION IF EXISTS validate_time_off_organization();
DROP TRIGGER IF EXISTS trg_work_shifts_same_organization ON work_shifts;
DROP FUNCTION IF EXISTS validate_work_shift_organization();
"""


class Migration(migrations.Migration):
    dependencies = [("scheduling", "0005_lock_appointment_patient")]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="reschedule_idempotency_key",
            field=models.CharField(blank=True, max_length=64, null=True, unique=True),
        ),
        migrations.RunSQL(CREATE_SCOPE_GUARDS, DROP_SCOPE_GUARDS),
    ]
