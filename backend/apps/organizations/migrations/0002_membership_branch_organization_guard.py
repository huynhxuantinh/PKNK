from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                CREATE OR REPLACE FUNCTION validate_membership_branch_organization()
                RETURNS trigger AS $$
                BEGIN
                    IF NEW.id_branch IS NOT NULL AND NOT EXISTS (
                        SELECT 1
                        FROM branches
                        WHERE id_branch = NEW.id_branch
                          AND id_organization = NEW.id_organization
                    ) THEN
                        RAISE EXCEPTION
                            'membership branch must belong to membership organization';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER trg_memberships_branch_organization
                BEFORE INSERT OR UPDATE OF id_branch, id_organization
                ON memberships
                FOR EACH ROW
                EXECUTE FUNCTION validate_membership_branch_organization();
            """,
            reverse_sql="""
                DROP TRIGGER IF EXISTS trg_memberships_branch_organization ON memberships;
                DROP FUNCTION IF EXISTS validate_membership_branch_organization();
            """,
        ),
    ]
