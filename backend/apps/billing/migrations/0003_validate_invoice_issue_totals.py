from django.db import migrations


CREATE_TRIGGER = r"""
CREATE OR REPLACE FUNCTION validate_invoice_issue_totals()
RETURNS trigger AS $$
DECLARE line_sum numeric(14,2);
DECLARE line_count bigint;
BEGIN
    IF OLD.status = 'DRAFT' AND NEW.status = 'ISSUED' THEN
        SELECT COALESCE(SUM(line_total), 0), COUNT(*) INTO line_sum, line_count
        FROM invoice_lines WHERE id_invoice = NEW.id_invoice;
        IF line_count = 0 OR NEW.subtotal IS DISTINCT FROM line_sum
           OR NEW.total <= 0 OR NEW.total <> NEW.subtotal - NEW.discount THEN
            RAISE EXCEPTION 'Invoice totals must match its lines before ISSUE';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_issue_totals
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION validate_invoice_issue_totals();
"""


DROP_TRIGGER = r"""
DROP TRIGGER IF EXISTS trg_invoice_issue_totals ON invoices;
DROP FUNCTION IF EXISTS validate_invoice_issue_totals();
"""


class Migration(migrations.Migration):
    dependencies = [("billing", "0002_billing_integrity_triggers")]
    operations = [migrations.RunSQL(CREATE_TRIGGER, DROP_TRIGGER)]
