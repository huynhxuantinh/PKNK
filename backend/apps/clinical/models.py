import uuid
from pathlib import Path

from django.conf import settings
from django.db import models


def clinical_attachment_upload_to(instance, filename):
    extension = Path(filename).suffix.lower()
    return f"clinical/{uuid.uuid4().hex}{extension}"


class ClinicalEncounter(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Bản nháp"
        FINALIZED = "FINALIZED", "Đã chốt"

    id_clinical_encounter = models.BigAutoField(primary_key=True)
    appointment = models.OneToOneField(
        "scheduling.Appointment", db_column="id_appointment",
        on_delete=models.PROTECT, related_name="clinical_encounter",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    chief_complaint = models.TextField(blank=True)
    medical_history = models.TextField(blank=True)
    diagnosis_summary = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    aftercare_instructions = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, db_column="id_created_by",
        on_delete=models.PROTECT, related_name="clinical_encounters_created",
    )
    finalized_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, db_column="id_finalized_by",
        on_delete=models.PROTECT, related_name="clinical_encounters_finalized",
        null=True, blank=True,
    )
    finalized_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "clinical_encounters"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=["DRAFT", "FINALIZED"]),
                name="ck_clinical_encounters_status",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(status="DRAFT", finalized_at__isnull=True, finalized_by__isnull=True)
                    | models.Q(status="FINALIZED", finalized_at__isnull=False, finalized_by__isnull=False)
                ),
                name="ck_clinical_encounters_finalized",
            ),
        ]


class ClinicalAmendment(models.Model):
    id_clinical_amendment = models.BigAutoField(primary_key=True)
    encounter = models.ForeignKey(
        ClinicalEncounter, db_column="id_clinical_encounter",
        on_delete=models.PROTECT, related_name="amendments",
    )
    content = models.TextField()
    reason = models.TextField()
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, db_column="id_author",
        on_delete=models.PROTECT, related_name="clinical_amendments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "clinical_amendments"
        ordering = ["created_at", "id_clinical_amendment"]


class OdontogramEntry(models.Model):
    class Surface(models.TextChoices):
        WHOLE = "WHOLE", "Toàn răng"
        OCCLUSAL = "OCCLUSAL", "Mặt nhai"
        INCISAL = "INCISAL", "Rìa cắn"
        MESIAL = "MESIAL", "Mặt gần"
        DISTAL = "DISTAL", "Mặt xa"
        BUCCAL = "BUCCAL", "Mặt má"
        LINGUAL = "LINGUAL", "Mặt lưỡi"

    id_odontogram_entry = models.BigAutoField(primary_key=True)
    encounter = models.ForeignKey(
        ClinicalEncounter, db_column="id_clinical_encounter",
        on_delete=models.PROTECT, related_name="odontogram_entries",
    )
    tooth_number = models.SmallIntegerField()
    surface = models.CharField(max_length=20, choices=Surface.choices)
    condition_code = models.CharField(max_length=50)
    treatment_code = models.CharField(max_length=50, blank=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "odontogram_entries"
        ordering = ["tooth_number", "surface"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(tooth_number__range=(11, 18))
                    | models.Q(tooth_number__range=(21, 28))
                    | models.Q(tooth_number__range=(31, 38))
                    | models.Q(tooth_number__range=(41, 48))
                ),
                name="ck_odontogram_fdi_tooth",
            ),
            models.UniqueConstraint(
                fields=["encounter", "tooth_number", "surface"],
                name="uq_odontogram_tooth_surface",
            ),
        ]


class ClinicalAttachment(models.Model):
    class Kind(models.TextChoices):
        XRAY = "XRAY", "X-quang"
        PHOTO = "PHOTO", "Ảnh lâm sàng"
        DOCUMENT = "DOCUMENT", "Tài liệu"

    id_clinical_attachment = models.BigAutoField(primary_key=True)
    encounter = models.ForeignKey(
        ClinicalEncounter,
        db_column="id_clinical_encounter",
        on_delete=models.PROTECT,
        related_name="attachments",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    file = models.FileField(upload_to=clinical_attachment_upload_to, max_length=255)
    content_type = models.CharField(max_length=100)
    size_bytes = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    description = models.TextField(blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        db_column="id_uploaded_by",
        on_delete=models.PROTECT,
        related_name="clinical_attachments_uploaded",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "clinical_attachments"
        ordering = ["created_at", "id_clinical_attachment"]
        indexes = [
            models.Index(
                fields=["encounter", "kind", "created_at"],
                name="idx_attachment_encounter_kind",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(kind__in=["XRAY", "PHOTO", "DOCUMENT"]),
                name="ck_clinical_attachments_kind",
            ),
            models.CheckConstraint(
                condition=models.Q(size_bytes__gt=0),
                name="ck_clinical_attachments_size",
            ),
            models.CheckConstraint(
                condition=models.Q(sha256__regex=r"^[0-9a-f]{64}$"),
                name="ck_clinical_attachments_sha256",
            ),
        ]


class TreatmentPlan(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Bản nháp"
        ACTIVE = "ACTIVE", "Đang điều trị"
        COMPLETED = "COMPLETED", "Hoàn thành"
        CANCELLED = "CANCELLED", "Đã hủy"

    id_treatment_plan = models.BigAutoField(primary_key=True)
    organization = models.ForeignKey(
        "organizations.Organization", db_column="id_organization",
        on_delete=models.PROTECT, related_name="treatment_plans",
    )
    originating_encounter = models.ForeignKey(
        ClinicalEncounter, db_column="id_originating_encounter",
        on_delete=models.PROTECT, related_name="treatment_plans",
    )
    patient_profile = models.ForeignKey(
        "accounts.PatientProfile", db_column="id_patient_profile",
        on_delete=models.PROTECT, related_name="treatment_plans",
    )
    dentist = models.ForeignKey(
        "accounts.Dentist", db_column="id_dentist",
        on_delete=models.PROTECT, related_name="treatment_plans",
    )
    branch = models.ForeignKey(
        "locations.Branch", db_column="id_branch",
        on_delete=models.PROTECT, related_name="treatment_plans",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    total_estimate = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "treatment_plans"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "patient_profile", "status"], name="idx_plan_org_patient_status"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]),
                name="ck_treatment_plans_status",
            ),
            models.CheckConstraint(condition=models.Q(total_estimate__gte=0), name="ck_treatment_plans_total"),
        ]


class TreatmentPlanItem(models.Model):
    class Status(models.TextChoices):
        PLANNED = "PLANNED", "Dự kiến"
        IN_PROGRESS = "IN_PROGRESS", "Đang thực hiện"
        COMPLETED = "COMPLETED", "Hoàn thành"
        CANCELLED = "CANCELLED", "Đã hủy"

    id_treatment_plan_item = models.BigAutoField(primary_key=True)
    treatment_plan = models.ForeignKey(
        TreatmentPlan, db_column="id_treatment_plan",
        on_delete=models.PROTECT, related_name="items",
    )
    service = models.ForeignKey(
        "catalog.Service", db_column="id_service",
        on_delete=models.PROTECT, related_name="treatment_plan_items",
    )
    tooth_number = models.SmallIntegerField(null=True, blank=True)
    sequence = models.PositiveSmallIntegerField()
    planned_price = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANNED)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "treatment_plan_items"
        ordering = ["sequence", "id_treatment_plan_item"]
        constraints = [
            models.UniqueConstraint(fields=["treatment_plan", "sequence"], name="uq_plan_items_sequence"),
            models.CheckConstraint(condition=models.Q(sequence__gt=0), name="ck_plan_items_sequence"),
            models.CheckConstraint(condition=models.Q(planned_price__gte=0), name="ck_plan_items_price"),
            models.CheckConstraint(
                condition=models.Q(status__in=["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
                name="ck_plan_items_status",
            ),
        ]


class Prescription(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Bản nháp"
        ISSUED = "ISSUED", "Đã phát hành"
        VOID = "VOID", "Đã hủy"

    id_prescription = models.BigAutoField(primary_key=True)
    encounter = models.OneToOneField(
        ClinicalEncounter, db_column="id_clinical_encounter",
        on_delete=models.PROTECT, related_name="prescription",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    instructions = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, db_column="id_created_by",
        on_delete=models.PROTECT, related_name="prescriptions_created",
    )
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, db_column="id_issued_by",
        on_delete=models.PROTECT, related_name="prescriptions_issued",
        null=True, blank=True,
    )
    issued_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, db_column="id_voided_by",
        on_delete=models.PROTECT, related_name="prescriptions_voided",
        null=True, blank=True,
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "prescriptions"
        constraints = [
            models.CheckConstraint(condition=models.Q(status__in=["DRAFT", "ISSUED", "VOID"]), name="ck_prescriptions_status"),
            models.CheckConstraint(
                condition=(
                    models.Q(status="DRAFT", issued_at__isnull=True, issued_by__isnull=True, voided_at__isnull=True, voided_by__isnull=True, void_reason="")
                    | models.Q(status="ISSUED", issued_at__isnull=False, issued_by__isnull=False, voided_at__isnull=True, voided_by__isnull=True, void_reason="")
                    | (models.Q(status="VOID", issued_at__isnull=False, issued_by__isnull=False, voided_at__isnull=False, voided_by__isnull=False) & ~models.Q(void_reason=""))
                ),
                name="ck_prescriptions_state_fields",
            ),
        ]


class PrescriptionItem(models.Model):
    id_prescription_item = models.BigAutoField(primary_key=True)
    prescription = models.ForeignKey(
        Prescription, db_column="id_prescription",
        on_delete=models.PROTECT, related_name="items",
    )
    medicine_name = models.CharField(max_length=200)
    strength = models.CharField(max_length=100, blank=True)
    dosage = models.CharField(max_length=200)
    frequency = models.CharField(max_length=200)
    duration = models.CharField(max_length=200)
    quantity = models.PositiveIntegerField()
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "prescription_items"
        ordering = ["id_prescription_item"]
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="ck_prescription_items_quantity"),
        ]
