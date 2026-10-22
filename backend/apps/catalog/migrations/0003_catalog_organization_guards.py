from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0002_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                CREATE OR REPLACE FUNCTION validate_branch_service_organization()
                RETURNS trigger AS $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM branches b
                        JOIN services s ON s.id_service = NEW.id_service
                        WHERE b.id_branch = NEW.id_branch
                          AND b.id_organization = s.id_organization
                    ) THEN
                        RAISE EXCEPTION 'branch and service must belong to the same organization';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER trg_branch_services_organization
                BEFORE INSERT OR UPDATE OF id_branch, id_service ON branch_services
                FOR EACH ROW EXECUTE FUNCTION validate_branch_service_organization();

                CREATE OR REPLACE FUNCTION validate_dentist_service_organization()
                RETURNS trigger AS $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM dentists d
                        JOIN services s ON s.id_service = NEW.id_service
                        WHERE d.id_dentist = NEW.id_dentist
                          AND d.id_organization = s.id_organization
                    ) THEN
                        RAISE EXCEPTION 'dentist and service must belong to the same organization';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER trg_dentist_services_organization
                BEFORE INSERT OR UPDATE OF id_dentist, id_service ON dentist_services
                FOR EACH ROW EXECUTE FUNCTION validate_dentist_service_organization();
            """,
            reverse_sql="""
                DROP TRIGGER IF EXISTS trg_branch_services_organization ON branch_services;
                DROP FUNCTION IF EXISTS validate_branch_service_organization();
                DROP TRIGGER IF EXISTS trg_dentist_services_organization ON dentist_services;
                DROP FUNCTION IF EXISTS validate_dentist_service_organization();
            """,
        ),
    ]
