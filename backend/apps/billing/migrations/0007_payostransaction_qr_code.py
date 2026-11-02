from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0006_seed_payos_order_code_sequence"),
    ]

    operations = [
        migrations.AddField(
            model_name="payostransaction",
            name="qr_code",
            field=models.TextField(blank=True),
        ),
    ]
