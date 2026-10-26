from django.db import migrations


PAYOS_ORDER_CODE_START = 202610260000000


FORWARD_SQL = f"""
SELECT setval(
    pg_get_serial_sequence('payos_transactions', 'order_code'),
    GREATEST(
        COALESCE((SELECT MAX(order_code) FROM payos_transactions), 0) + 1,
        {PAYOS_ORDER_CODE_START}
    ),
    false
);
"""


REVERSE_SQL = """
SELECT setval(
    pg_get_serial_sequence('payos_transactions', 'order_code'),
    GREATEST(
        COALESCE((SELECT MAX(order_code) FROM payos_transactions), 0) + 1,
        1
    ),
    false
);
"""


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0005_payostransaction"),
    ]

    operations = [
        migrations.RunSQL(FORWARD_SQL, reverse_sql=REVERSE_SQL),
    ]
