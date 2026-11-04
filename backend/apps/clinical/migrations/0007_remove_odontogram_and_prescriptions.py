from django.db import migrations


DROP_UNUSED_CLINICAL_TRIGGERS = r"""
DROP TRIGGER IF EXISTS trg_prescription_items_draft ON prescription_items;
DROP FUNCTION IF EXISTS guard_prescription_items_draft();
DROP TRIGGER IF EXISTS trg_prescription_header ON prescriptions;
DROP FUNCTION IF EXISTS guard_prescription_header();
DROP TRIGGER IF EXISTS trg_odontogram_draft ON odontogram_entries;
DROP FUNCTION IF EXISTS guard_odontogram_draft();
"""


RESTORE_UNUSED_CLINICAL_TRIGGERS = r"""
CREATE OR REPLACE FUNCTION guard_odontogram_draft()
RETURNS trigger AS $$
DECLARE encounter_id bigint;
DECLARE encounter_status varchar(20);
BEGIN
    encounter_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id_clinical_encounter ELSE NEW.id_clinical_encounter END;
    SELECT status INTO encounter_status FROM clinical_encounters
    WHERE id_clinical_encounter = encounter_id;
    IF encounter_status IS DISTINCT FROM 'DRAFT' THEN
        RAISE EXCEPTION 'Odontogram can only change while encounter is DRAFT';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_odontogram_draft
BEFORE INSERT OR UPDATE OR DELETE ON odontogram_entries
FOR EACH ROW EXECUTE FUNCTION guard_odontogram_draft();

CREATE OR REPLACE FUNCTION guard_prescription_header()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Prescriptions cannot be deleted';
    END IF;
    IF OLD.status = 'VOID' THEN
        RAISE EXCEPTION 'Void prescription is immutable';
    END IF;
    IF OLD.status = 'ISSUED' AND NEW.status <> 'VOID' THEN
        RAISE EXCEPTION 'Issued prescription can only become VOID';
    END IF;
    IF OLD.status = 'ISSUED' AND (
        NEW.id_clinical_encounter IS DISTINCT FROM OLD.id_clinical_encounter
        OR NEW.instructions IS DISTINCT FROM OLD.instructions
        OR NEW.id_created_by IS DISTINCT FROM OLD.id_created_by
        OR NEW.id_issued_by IS DISTINCT FROM OLD.id_issued_by
        OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
    ) THEN
        RAISE EXCEPTION 'Issued prescription content is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_prescription_header
BEFORE UPDATE OR DELETE ON prescriptions
FOR EACH ROW EXECUTE FUNCTION guard_prescription_header();

CREATE OR REPLACE FUNCTION guard_prescription_items_draft()
RETURNS trigger AS $$
DECLARE prescription_id bigint;
DECLARE prescription_status varchar(20);
BEGIN
    prescription_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id_prescription ELSE NEW.id_prescription END;
    SELECT status INTO prescription_status FROM prescriptions
    WHERE id_prescription = prescription_id;
    IF prescription_status IS DISTINCT FROM 'DRAFT' THEN
        RAISE EXCEPTION 'Prescription items can only change while prescription is DRAFT';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_prescription_items_draft
BEFORE INSERT OR UPDATE OR DELETE ON prescription_items
FOR EACH ROW EXECUTE FUNCTION guard_prescription_items_draft();
"""


class Migration(migrations.Migration):
    dependencies = [("clinical", "0006_clinicalencounter_legacy_billing_allowed")]

    operations = [
        migrations.RunSQL(
            DROP_UNUSED_CLINICAL_TRIGGERS,
            RESTORE_UNUSED_CLINICAL_TRIGGERS,
        ),
        migrations.DeleteModel(name="PrescriptionItem"),
        migrations.DeleteModel(name="Prescription"),
        migrations.DeleteModel(name="OdontogramEntry"),
    ]
