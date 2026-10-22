from django.db import migrations


CREATE_TRIGGERS = r"""
CREATE OR REPLACE FUNCTION validate_invoice_scope()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.id_appointment = NEW.id_appointment
          AND a.id_branch = NEW.id_branch
          AND a.id_patient_profile = NEW.id_patient_profile
    ) THEN
        RAISE EXCEPTION 'Invoice scope must match appointment';
    END IF;
    IF NEW.id_replacement_for IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM invoices old_invoice
        WHERE old_invoice.id_invoice = NEW.id_replacement_for
          AND old_invoice.id_appointment = NEW.id_appointment
          AND old_invoice.status = 'VOID'
    ) THEN
        RAISE EXCEPTION 'Replacement invoice must replace a VOID invoice for the same appointment';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_scope
BEFORE INSERT OR UPDATE OF id_appointment, id_branch, id_patient_profile, id_replacement_for
ON invoices FOR EACH ROW EXECUTE FUNCTION validate_invoice_scope();

CREATE OR REPLACE FUNCTION guard_invoice_header()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Invoices cannot be deleted';
    END IF;
    IF NEW.id_appointment IS DISTINCT FROM OLD.id_appointment
       OR NEW.id_branch IS DISTINCT FROM OLD.id_branch
       OR NEW.id_patient_profile IS DISTINCT FROM OLD.id_patient_profile
       OR NEW.id_replacement_for IS DISTINCT FROM OLD.id_replacement_for
       OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.id_created_by IS DISTINCT FROM OLD.id_created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Invoice ownership is immutable';
    END IF;
    IF OLD.status = 'VOID' THEN
        RAISE EXCEPTION 'VOID invoice is immutable';
    ELSIF OLD.status = 'DRAFT' AND NEW.status NOT IN ('DRAFT', 'ISSUED', 'VOID') THEN
        RAISE EXCEPTION 'Invalid invoice transition';
    ELSIF OLD.status = 'ISSUED' THEN
        IF NEW.status NOT IN ('PAID', 'VOID') THEN
            RAISE EXCEPTION 'ISSUED invoice can only become PAID or VOID';
        END IF;
        IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
           OR NEW.discount IS DISTINCT FROM OLD.discount
           OR NEW.total IS DISTINCT FROM OLD.total
           OR NEW.id_issued_by IS DISTINCT FROM OLD.id_issued_by
           OR NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
            RAISE EXCEPTION 'Issued invoice content is immutable';
        END IF;
    ELSIF OLD.status = 'PAID' THEN
        IF NEW.status <> 'ISSUED' OR NEW.paid_at IS NOT NULL THEN
            RAISE EXCEPTION 'PAID invoice can only return to ISSUED after payment VOID';
        END IF;
        IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
           OR NEW.discount IS DISTINCT FROM OLD.discount
           OR NEW.total IS DISTINCT FROM OLD.total
           OR NEW.id_issued_by IS DISTINCT FROM OLD.id_issued_by
           OR NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
            RAISE EXCEPTION 'Paid invoice content is immutable';
        END IF;
    END IF;
    IF NEW.status IN ('ISSUED', 'PAID') AND (
        NEW.total <= 0 OR NEW.subtotal <> trunc(NEW.subtotal)
        OR NEW.discount <> trunc(NEW.discount) OR NEW.total <> trunc(NEW.total)
    ) THEN
        RAISE EXCEPTION 'Issued invoice requires positive whole VND amounts';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_header
BEFORE UPDATE OR DELETE ON invoices
FOR EACH ROW EXECUTE FUNCTION guard_invoice_header();

CREATE OR REPLACE FUNCTION guard_invoice_line()
RETURNS trigger AS $$
DECLARE target_invoice bigint;
DECLARE invoice_status varchar(20);
DECLARE invoice_org bigint;
DECLARE service_org bigint;
BEGIN
    target_invoice := CASE WHEN TG_OP = 'DELETE' THEN OLD.id_invoice ELSE NEW.id_invoice END;
    SELECT i.status, b.id_organization INTO invoice_status, invoice_org
    FROM invoices i JOIN branches b ON b.id_branch = i.id_branch
    WHERE i.id_invoice = target_invoice;
    IF invoice_status IS DISTINCT FROM 'DRAFT' THEN
        RAISE EXCEPTION 'Invoice lines can only change while invoice is DRAFT';
    END IF;
    IF TG_OP <> 'DELETE' THEN
        IF NEW.line_total <> NEW.quantity * NEW.unit_price
           OR NEW.unit_price <> trunc(NEW.unit_price)
           OR NEW.line_total <> trunc(NEW.line_total) THEN
            RAISE EXCEPTION 'Invoice line amount is invalid';
        END IF;
        IF NEW.id_service IS NOT NULL THEN
            SELECT id_organization INTO service_org FROM services WHERE id_service = NEW.id_service;
            IF service_org IS DISTINCT FROM invoice_org THEN
                RAISE EXCEPTION 'Invoice service must belong to the same organization';
            END IF;
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_line
BEFORE INSERT OR UPDATE OR DELETE ON invoice_lines
FOR EACH ROW EXECUTE FUNCTION guard_invoice_line();

CREATE OR REPLACE FUNCTION guard_payment()
RETURNS trigger AS $$
DECLARE invoice_status varchar(20);
DECLARE invoice_total numeric(14,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Payments cannot be deleted';
    ELSIF TG_OP = 'INSERT' THEN
        SELECT status, total INTO invoice_status, invoice_total FROM invoices
        WHERE id_invoice = NEW.id_invoice;
        IF NEW.status <> 'POSTED' OR invoice_status <> 'ISSUED'
           OR NEW.amount <> invoice_total OR NEW.amount <> trunc(NEW.amount) THEN
            RAISE EXCEPTION 'Payment must POST the exact whole-VND total of an ISSUED invoice';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD.status <> 'POSTED' OR NEW.status <> 'VOID' THEN
        RAISE EXCEPTION 'Payment only supports POSTED to VOID';
    END IF;
    IF NEW.id_invoice IS DISTINCT FROM OLD.id_invoice
       OR NEW.payment_number IS DISTINCT FROM OLD.payment_number
       OR NEW.method IS DISTINCT FROM OLD.method
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.external_reference IS DISTINCT FROM OLD.external_reference
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.id_posted_by IS DISTINCT FROM OLD.id_posted_by
       OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Posted payment content is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment
BEFORE INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION guard_payment();

COMMENT ON COLUMN invoices.total IS 'PII: financial amount';
COMMENT ON COLUMN payments.amount IS 'PII: financial amount';
COMMENT ON COLUMN payments.external_reference IS 'PII: payment reference';
"""


DROP_TRIGGERS = r"""
DROP TRIGGER IF EXISTS trg_payment ON payments;
DROP FUNCTION IF EXISTS guard_payment();
DROP TRIGGER IF EXISTS trg_invoice_line ON invoice_lines;
DROP FUNCTION IF EXISTS guard_invoice_line();
DROP TRIGGER IF EXISTS trg_invoice_header ON invoices;
DROP FUNCTION IF EXISTS guard_invoice_header();
DROP TRIGGER IF EXISTS trg_invoice_scope ON invoices;
DROP FUNCTION IF EXISTS validate_invoice_scope();
"""


class Migration(migrations.Migration):
    dependencies = [("billing", "0001_initial_billing")]
    operations = [migrations.RunSQL(CREATE_TRIGGERS, DROP_TRIGGERS)]
