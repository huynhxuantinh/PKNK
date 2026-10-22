from django.db import migrations, models


def update_legacy_default(apps, schema_editor):
    Organization = apps.get_model("organizations", "Organization")
    Organization.objects.filter(cancellation_cutoff_minutes=240).update(
        cancellation_cutoff_minutes=1440
    )


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0004_staffinvitation"),
    ]

    operations = [
        migrations.RunPython(update_legacy_default, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="organization",
            name="cancellation_cutoff_minutes",
            field=models.IntegerField(default=1440),
        ),
    ]
