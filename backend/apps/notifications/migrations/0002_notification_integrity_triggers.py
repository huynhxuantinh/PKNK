from django.db import migrations


CREATE_TRIGGERS = r"""
CREATE OR REPLACE FUNCTION guard_notification_record()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Notifications cannot be deleted';
    END IF;
    IF NEW.id_recipient IS DISTINCT FROM OLD.id_recipient
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.payload IS DISTINCT FROM OLD.payload
       OR NEW.resource_type IS DISTINCT FROM OLD.resource_type
       OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
       OR NEW.event_key IS DISTINCT FROM OLD.event_key
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Notification event content is immutable';
    END IF;
    IF OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at THEN
        RAISE EXCEPTION 'Notification read timestamp is immutable once set';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notification_record
BEFORE UPDATE OR DELETE ON notifications
FOR EACH ROW EXECUTE FUNCTION guard_notification_record();

CREATE OR REPLACE FUNCTION guard_notification_delivery()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Notification deliveries cannot be deleted';
    END IF;
    IF NEW.id_notification IS DISTINCT FROM OLD.id_notification
       OR NEW.channel IS DISTINCT FROM OLD.channel
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Notification delivery identity is immutable';
    END IF;
    IF OLD.status IN ('SENT', 'SKIPPED') THEN
        RAISE EXCEPTION 'Terminal notification delivery is immutable';
    END IF;
    IF (OLD.status = 'PENDING' AND NEW.status NOT IN ('SENDING', 'SKIPPED'))
       OR (OLD.status = 'SENDING' AND NEW.status NOT IN ('SENT', 'FAILED'))
       OR (OLD.status = 'FAILED' AND NEW.status <> 'SENDING') THEN
        RAISE EXCEPTION 'Invalid notification delivery transition';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notification_delivery
BEFORE UPDATE OR DELETE ON notification_deliveries
FOR EACH ROW EXECUTE FUNCTION guard_notification_delivery();
"""


DROP_TRIGGERS = r"""
DROP TRIGGER IF EXISTS trg_notification_delivery ON notification_deliveries;
DROP FUNCTION IF EXISTS guard_notification_delivery();
DROP TRIGGER IF EXISTS trg_notification_record ON notifications;
DROP FUNCTION IF EXISTS guard_notification_record();
"""


class Migration(migrations.Migration):
    dependencies = [("notifications", "0001_initial_notifications")]
    operations = [migrations.RunSQL(CREATE_TRIGGERS, DROP_TRIGGERS)]
