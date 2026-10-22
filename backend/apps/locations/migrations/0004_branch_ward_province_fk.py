from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("locations", "0003_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                "ALTER TABLE branches "
                "ADD CONSTRAINT fk_branches_ward_province "
                "FOREIGN KEY (ward_code, province_code) "
                "REFERENCES wards (code, province_code) "
                "DEFERRABLE INITIALLY DEFERRED"
            ),
            reverse_sql=(
                "ALTER TABLE branches "
                "DROP CONSTRAINT IF EXISTS fk_branches_ward_province"
            ),
        ),
    ]
