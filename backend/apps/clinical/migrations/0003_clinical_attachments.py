import apps.clinical.models
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


CREATE_ATTACHMENT_GUARD = r"""
CREATE OR REPLACE FUNCTION guard_clinical_attachment_draft()
RETURNS trigger AS $$
DECLARE encounter_id bigint;
DECLARE encounter_status varchar(20);
BEGIN
    encounter_id := CASE
        WHEN TG_OP = 'DELETE' THEN OLD.id_clinical_encounter
        ELSE NEW.id_clinical_encounter
    END;
    SELECT status INTO encounter_status
    FROM clinical_encounters
    WHERE id_clinical_encounter = encounter_id;
    IF encounter_status IS DISTINCT FROM 'DRAFT' THEN
        RAISE EXCEPTION 'Clinical attachments can only change while encounter is DRAFT';
    END IF;
    IF TG_OP = 'UPDATE' AND (
        NEW.id_clinical_encounter IS DISTINCT FROM OLD.id_clinical_encounter
        OR NEW.file IS DISTINCT FROM OLD.file
        OR NEW.content_type IS DISTINCT FROM OLD.content_type
        OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
        OR NEW.sha256 IS DISTINCT FROM OLD.sha256
        OR NEW.id_uploaded_by IS DISTINCT FROM OLD.id_uploaded_by
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
    ) THEN
        RAISE EXCEPTION 'Clinical attachment file identity is immutable';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clinical_attachment_draft
BEFORE INSERT OR UPDATE OR DELETE ON clinical_attachments
FOR EACH ROW EXECUTE FUNCTION guard_clinical_attachment_draft();

COMMENT ON TABLE clinical_attachments IS 'PHI: clinical images and documents';
COMMENT ON COLUMN clinical_attachments.file IS 'PHI: private object storage key';
COMMENT ON COLUMN clinical_attachments.description IS 'PHI: clinical attachment description';
"""


DROP_ATTACHMENT_GUARD = r"""
DROP TRIGGER IF EXISTS trg_clinical_attachment_draft ON clinical_attachments;
DROP FUNCTION IF EXISTS guard_clinical_attachment_draft();
"""


class Migration(migrations.Migration):
    dependencies = [
        ("clinical", "0002_clinical_integrity_triggers"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ClinicalAttachment",
            fields=[
                (
                    "id_clinical_attachment",
                    models.BigAutoField(primary_key=True, serialize=False),
                ),
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("XRAY", "X-quang"),
                            ("PHOTO", "Ảnh lâm sàng"),
                            ("DOCUMENT", "Tài liệu"),
                        ],
                        max_length=20,
                    ),
                ),
                (
                    "file",
                    models.FileField(
                        max_length=255,
                        upload_to=apps.clinical.models.clinical_attachment_upload_to,
                    ),
                ),
                ("content_type", models.CharField(max_length=100)),
                ("size_bytes", models.PositiveBigIntegerField()),
                ("sha256", models.CharField(max_length=64)),
                ("description", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "encounter",
                    models.ForeignKey(
                        db_column="id_clinical_encounter",
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="attachments",
                        to="clinical.clinicalencounter",
                    ),
                ),
                (
                    "uploaded_by",
                    models.ForeignKey(
                        db_column="id_uploaded_by",
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="clinical_attachments_uploaded",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "clinical_attachments",
                "ordering": ["created_at", "id_clinical_attachment"],
            },
        ),
        migrations.AddIndex(
            model_name="clinicalattachment",
            index=models.Index(
                fields=["encounter", "kind", "created_at"],
                name="idx_attachment_encounter_kind",
            ),
        ),
        migrations.AddConstraint(
            model_name="clinicalattachment",
            constraint=models.CheckConstraint(
                condition=models.Q(kind__in=["XRAY", "PHOTO", "DOCUMENT"]),
                name="ck_clinical_attachments_kind",
            ),
        ),
        migrations.AddConstraint(
            model_name="clinicalattachment",
            constraint=models.CheckConstraint(
                condition=models.Q(size_bytes__gt=0),
                name="ck_clinical_attachments_size",
            ),
        ),
        migrations.AddConstraint(
            model_name="clinicalattachment",
            constraint=models.CheckConstraint(
                condition=models.Q(sha256__regex=r"^[0-9a-f]{64}$"),
                name="ck_clinical_attachments_sha256",
            ),
        ),
        migrations.RunSQL(CREATE_ATTACHMENT_GUARD, DROP_ATTACHMENT_GUARD),
    ]
