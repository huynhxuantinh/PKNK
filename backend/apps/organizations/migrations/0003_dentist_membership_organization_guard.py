from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0009_limit_unused_password_reset_token"),
        ("organizations", "0002_membership_branch_organization_guard"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                CREATE OR REPLACE FUNCTION validate_dentist_membership_organization()
                RETURNS trigger AS $$
                BEGIN
                    IF NEW.role = 'DENTIST' AND NOT EXISTS (
                        SELECT 1 FROM dentists
                        WHERE id_user = NEW.id_user
                          AND id_organization = NEW.id_organization
                    ) THEN
                        RAISE EXCEPTION
                            'dentist membership must match dentist organization';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER trg_memberships_dentist_organization
                BEFORE INSERT OR UPDATE OF id_user, id_organization, role
                ON memberships
                FOR EACH ROW
                EXECUTE FUNCTION validate_dentist_membership_organization();
            """,
            reverse_sql="""
                DROP TRIGGER IF EXISTS trg_memberships_dentist_organization ON memberships;
                DROP FUNCTION IF EXISTS validate_dentist_membership_organization();
            """,
        ),
    ]
