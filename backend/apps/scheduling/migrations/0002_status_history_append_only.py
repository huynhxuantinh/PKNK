from django.db import migrations


CREATE_APPEND_ONLY_TRIGGER = """
CREATE OR REPLACE FUNCTION prevent_appointment_status_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'appointment_status_histories is append-only';
END;
$$;

CREATE TRIGGER trg_appointment_status_history_append_only
BEFORE UPDATE OR DELETE ON appointment_status_histories
FOR EACH ROW
EXECUTE FUNCTION prevent_appointment_status_history_mutation();
"""

DROP_APPEND_ONLY_TRIGGER = """
DROP TRIGGER IF EXISTS trg_appointment_status_history_append_only
ON appointment_status_histories;
DROP FUNCTION IF EXISTS prevent_appointment_status_history_mutation();
"""


class Migration(migrations.Migration):
    dependencies = [
        ("scheduling", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql=CREATE_APPEND_ONLY_TRIGGER,
            reverse_sql=DROP_APPEND_ONLY_TRIGGER,
        ),
    ]
