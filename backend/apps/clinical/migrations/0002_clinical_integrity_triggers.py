from django.db import migrations


CREATE_TRIGGERS = r"""
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

CREATE TRIGGER trg_clinical_encounter_immutable
BEFORE UPDATE OR DELETE ON clinical_encounters
FOR EACH ROW EXECUTE FUNCTION guard_clinical_encounter_immutable();

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

CREATE OR REPLACE FUNCTION guard_clinical_amendment_append_only()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Clinical amendments are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clinical_amendment_append_only
BEFORE UPDATE OR DELETE ON clinical_amendments
FOR EACH ROW EXECUTE FUNCTION guard_clinical_amendment_append_only();

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

CREATE OR REPLACE FUNCTION validate_treatment_plan_scope()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM clinical_encounters ce
        JOIN appointments a ON a.id_appointment = ce.id_appointment
        JOIN branches b ON b.id_branch = a.id_branch
        WHERE ce.id_clinical_encounter = NEW.id_originating_encounter
          AND NEW.id_organization = b.id_organization
          AND NEW.id_patient_profile = a.id_patient_profile
          AND NEW.id_dentist = a.id_dentist
          AND NEW.id_branch = a.id_branch
    ) THEN
        RAISE EXCEPTION 'Treatment plan scope must match originating appointment';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_treatment_plan_scope
BEFORE INSERT OR UPDATE OF id_originating_encounter, id_organization, id_patient_profile, id_dentist, id_branch
ON treatment_plans FOR EACH ROW EXECUTE FUNCTION validate_treatment_plan_scope();

CREATE OR REPLACE FUNCTION guard_treatment_plan_terminal()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Treatment plans cannot be deleted';
    END IF;
    IF OLD.status IN ('COMPLETED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Terminal treatment plan is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_treatment_plan_terminal
BEFORE UPDATE OR DELETE ON treatment_plans
FOR EACH ROW EXECUTE FUNCTION guard_treatment_plan_terminal();

CREATE OR REPLACE FUNCTION guard_treatment_plan_item()
RETURNS trigger AS $$
DECLARE plan_id bigint;
DECLARE plan_status varchar(20);
DECLARE plan_org bigint;
DECLARE service_org bigint;
BEGIN
    plan_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id_treatment_plan ELSE NEW.id_treatment_plan END;
    SELECT status, id_organization INTO plan_status, plan_org FROM treatment_plans
    WHERE id_treatment_plan = plan_id;
    IF plan_status IN ('COMPLETED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Terminal treatment plan items are immutable';
    END IF;
    IF TG_OP <> 'DELETE' THEN
        SELECT id_organization INTO service_org FROM services WHERE id_service = NEW.id_service;
        IF service_org IS DISTINCT FROM plan_org THEN
            RAISE EXCEPTION 'Treatment plan service must belong to the same organization';
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_treatment_plan_item
BEFORE INSERT OR UPDATE OR DELETE ON treatment_plan_items
FOR EACH ROW EXECUTE FUNCTION guard_treatment_plan_item();

COMMENT ON COLUMN clinical_encounters.chief_complaint IS 'PHI: chief complaint';
COMMENT ON COLUMN clinical_encounters.medical_history IS 'PHI: medical history';
COMMENT ON COLUMN clinical_encounters.diagnosis_summary IS 'PHI: diagnosis';
COMMENT ON COLUMN clinical_encounters.notes IS 'PHI: clinical notes';
COMMENT ON COLUMN odontogram_entries.condition_code IS 'PHI: dental condition';
COMMENT ON COLUMN prescriptions.instructions IS 'PHI: prescription instructions';
"""


DROP_TRIGGERS = r"""
DROP TRIGGER IF EXISTS trg_treatment_plan_item ON treatment_plan_items;
DROP FUNCTION IF EXISTS guard_treatment_plan_item();
DROP TRIGGER IF EXISTS trg_treatment_plan_terminal ON treatment_plans;
DROP FUNCTION IF EXISTS guard_treatment_plan_terminal();
DROP TRIGGER IF EXISTS trg_treatment_plan_scope ON treatment_plans;
DROP FUNCTION IF EXISTS validate_treatment_plan_scope();
DROP TRIGGER IF EXISTS trg_prescription_items_draft ON prescription_items;
DROP FUNCTION IF EXISTS guard_prescription_items_draft();
DROP TRIGGER IF EXISTS trg_prescription_header ON prescriptions;
DROP FUNCTION IF EXISTS guard_prescription_header();
DROP TRIGGER IF EXISTS trg_clinical_amendment_append_only ON clinical_amendments;
DROP FUNCTION IF EXISTS guard_clinical_amendment_append_only();
DROP TRIGGER IF EXISTS trg_odontogram_draft ON odontogram_entries;
DROP FUNCTION IF EXISTS guard_odontogram_draft();
DROP TRIGGER IF EXISTS trg_clinical_encounter_immutable ON clinical_encounters;
DROP FUNCTION IF EXISTS guard_clinical_encounter_immutable();
"""


class Migration(migrations.Migration):
    dependencies = [("clinical", "0001_initial_clinical_records")]
    operations = [migrations.RunSQL(CREATE_TRIGGERS, DROP_TRIGGERS)]
