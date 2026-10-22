import hashlib
from pathlib import Path

from django.conf import settings
from django.urls import reverse
from drf_spectacular.utils import extend_schema_field
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers

from apps.catalog.models import Service

from .models import (
    ClinicalAmendment,
    ClinicalAttachment,
    ClinicalEncounter,
    OdontogramEntry,
    Prescription,
    PrescriptionItem,
    TreatmentPlan,
    TreatmentPlanItem,
)


ATTACHMENT_CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".pdf": "application/pdf",
    ".dcm": "application/dicom",
}

ATTACHMENT_TYPES_BY_KIND = {
    ClinicalAttachment.Kind.XRAY: {
        "image/jpeg", "image/png", "application/pdf", "application/dicom"
    },
    ClinicalAttachment.Kind.PHOTO: {"image/jpeg", "image/png"},
    ClinicalAttachment.Kind.DOCUMENT: {"application/pdf"},
}


class ClinicalAmendmentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True)

    class Meta:
        model = ClinicalAmendment
        fields = ("id_clinical_amendment", "content", "reason", "author_name", "created_at")
        read_only_fields = ("id_clinical_amendment", "author_name", "created_at")


class OdontogramEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = OdontogramEntry
        fields = (
            "id_odontogram_entry", "tooth_number", "surface", "condition_code",
            "treatment_code", "note", "created_at", "updated_at",
        )
        read_only_fields = ("id_odontogram_entry", "created_at", "updated_at")


class ClinicalAttachmentSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True)
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = ClinicalAttachment
        fields = (
            "id_clinical_attachment", "kind", "file", "content_type",
            "size_bytes", "sha256", "description", "download_url",
            "created_at", "updated_at",
        )
        read_only_fields = (
            "id_clinical_attachment", "content_type", "size_bytes", "sha256",
            "download_url", "created_at", "updated_at",
        )

    def validate_file(self, value):
        if self.instance is not None:
            raise serializers.ValidationError(
                "Không thể thay file; hãy xóa file nháp và tải file mới."
            )
        if value.size <= 0:
            raise serializers.ValidationError("File không được rỗng.")
        if value.size > settings.CLINICAL_ATTACHMENT_MAX_BYTES:
            raise serializers.ValidationError("File vượt quá dung lượng cho phép.")

        extension = Path(value.name).suffix.lower()
        content_type = ATTACHMENT_CONTENT_TYPES.get(extension)
        if content_type is None:
            raise serializers.ValidationError(
                "Chỉ chấp nhận JPG, PNG, PDF hoặc DICOM."
            )

        header = value.read(132)
        value.seek(0)
        valid_signature = {
            "image/jpeg": header.startswith(b"\xff\xd8\xff"),
            "image/png": header.startswith(b"\x89PNG\r\n\x1a\n"),
            "application/pdf": header.startswith(b"%PDF-"),
            "application/dicom": len(header) >= 132 and header[128:132] == b"DICM",
        }[content_type]
        if not valid_signature:
            raise serializers.ValidationError("Nội dung file không đúng định dạng.")

        if content_type.startswith("image/"):
            try:
                image = Image.open(value)
                image.verify()
            except (UnidentifiedImageError, OSError, ValueError) as error:
                raise serializers.ValidationError("File ảnh không hợp lệ.") from error
            finally:
                value.seek(0)

        digest = hashlib.sha256()
        for chunk in value.chunks():
            digest.update(chunk)
        value.seek(0)
        value._clinical_content_type = content_type
        value._clinical_sha256 = digest.hexdigest()
        return value

    def validate(self, attrs):
        kind = attrs.get("kind", getattr(self.instance, "kind", None))
        uploaded_file = attrs.get("file")
        content_type = (
            getattr(uploaded_file, "_clinical_content_type", None)
            if uploaded_file is not None
            else getattr(self.instance, "content_type", None)
        )
        if content_type and content_type not in ATTACHMENT_TYPES_BY_KIND.get(kind, set()):
            raise serializers.ValidationError(
                {"kind": "Loại hồ sơ không phù hợp với định dạng file."}
            )
        return attrs

    def create(self, validated_data):
        uploaded_file = validated_data["file"]
        return super().create(
            {
                **validated_data,
                "content_type": uploaded_file._clinical_content_type,
                "size_bytes": uploaded_file.size,
                "sha256": uploaded_file._clinical_sha256,
            }
        )

    def get_download_url(self, obj) -> str:
        request = self.context.get("request")
        namespace = (
            request.resolver_match.namespace
            if request and request.resolver_match
            else "patients"
        )
        route = (
            "dentist_api:clinical-attachment-download"
            if namespace == "dentist_api"
            else "patients:clinical-attachment-download"
        )
        path = reverse(route, kwargs={"attachment_id": obj.pk})
        return request.build_absolute_uri(path) if request else path


class PrescriptionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrescriptionItem
        fields = (
            "id_prescription_item", "medicine_name", "strength", "dosage",
            "frequency", "duration", "quantity", "note", "created_at", "updated_at",
        )
        read_only_fields = ("id_prescription_item", "created_at", "updated_at")


class PrescriptionSerializer(serializers.ModelSerializer):
    items = PrescriptionItemSerializer(many=True, read_only=True)

    class Meta:
        model = Prescription
        fields = (
            "id_prescription", "status", "instructions", "issued_at", "voided_at",
            "void_reason", "items", "created_at", "updated_at",
        )
        read_only_fields = (
            "id_prescription", "status", "issued_at", "voided_at", "void_reason",
            "items", "created_at", "updated_at",
        )


class TreatmentPlanItemSerializer(serializers.ModelSerializer):
    service_id = serializers.PrimaryKeyRelatedField(source="service", queryset=Service.objects.all())
    service_name = serializers.CharField(source="service.name", read_only=True)

    class Meta:
        model = TreatmentPlanItem
        fields = (
            "id_treatment_plan_item", "service_id", "service_name", "tooth_number",
            "sequence", "planned_price", "status", "note", "created_at", "updated_at",
        )
        read_only_fields = ("id_treatment_plan_item", "service_name", "created_at", "updated_at")


class TreatmentPlanSerializer(serializers.ModelSerializer):
    items = TreatmentPlanItemSerializer(many=True, read_only=True)

    class Meta:
        model = TreatmentPlan
        fields = (
            "id_treatment_plan", "originating_encounter_id", "patient_profile_id",
            "dentist_id", "branch_id", "title", "description", "status",
            "total_estimate", "items", "created_at", "updated_at",
        )
        read_only_fields = (
            "id_treatment_plan", "originating_encounter_id", "patient_profile_id",
            "dentist_id", "branch_id", "status", "total_estimate", "items",
            "created_at", "updated_at",
        )


class ClinicalEncounterSerializer(serializers.ModelSerializer):
    odontogram_entries = OdontogramEntrySerializer(many=True, read_only=True)
    attachments = ClinicalAttachmentSerializer(many=True, read_only=True)
    amendments = ClinicalAmendmentSerializer(many=True, read_only=True)
    prescription = PrescriptionSerializer(read_only=True)

    class Meta:
        model = ClinicalEncounter
        fields = (
            "id_clinical_encounter", "appointment_id", "status", "chief_complaint",
            "medical_history", "diagnosis_summary", "notes", "finalized_at",
            "odontogram_entries", "amendments", "prescription", "created_at", "updated_at",
            "attachments",
        )
        read_only_fields = (
            "id_clinical_encounter", "appointment_id", "status", "finalized_at",
            "odontogram_entries", "amendments", "prescription", "created_at", "updated_at",
            "attachments",
        )


class PatientClinicalEncounterSerializer(serializers.ModelSerializer):
    odontogram_entries = OdontogramEntrySerializer(many=True, read_only=True)
    attachments = ClinicalAttachmentSerializer(many=True, read_only=True)
    amendments = ClinicalAmendmentSerializer(many=True, read_only=True)
    prescription = serializers.SerializerMethodField()
    service_name = serializers.CharField(
        source="appointment.service_name_snapshot", read_only=True
    )
    appointment_code = serializers.CharField(
        source="appointment.public_code", read_only=True
    )
    examined_at = serializers.DateTimeField(source="appointment.started_at", read_only=True)
    completed_at = serializers.DateTimeField(source="appointment.completed_at", read_only=True)
    appointment_status = serializers.CharField(source="appointment.status", read_only=True)
    dentist_name = serializers.CharField(
        source="appointment.dentist.user.full_name", read_only=True
    )
    branch_id = serializers.IntegerField(source="appointment.branch_id", read_only=True)
    branch_name = serializers.CharField(source="appointment.branch.name", read_only=True)
    treatment_plans = serializers.SerializerMethodField()

    class Meta:
        model = ClinicalEncounter
        fields = (
            "id_clinical_encounter", "appointment_code", "appointment_status",
            "service_name", "dentist_name", "branch_id", "branch_name",
            "examined_at", "completed_at",
            "chief_complaint", "medical_history", "diagnosis_summary", "notes",
            "finalized_at", "odontogram_entries", "amendments", "prescription",
            "treatment_plans", "attachments",
        )

    @extend_schema_field(PrescriptionSerializer(allow_null=True))
    def get_prescription(self, obj):
        try:
            prescription = obj.prescription
        except Prescription.DoesNotExist:
            return None
        if prescription.status not in {Prescription.Status.ISSUED, Prescription.Status.VOID}:
            return None
        return PrescriptionSerializer(prescription).data

    @extend_schema_field(TreatmentPlanSerializer(many=True))
    def get_treatment_plans(self, obj):
        plans = getattr(obj, "patient_visible_treatment_plans", [])
        return TreatmentPlanSerializer(plans, many=True).data


class VoidPrescriptionSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=1000, allow_blank=False, trim_whitespace=True)


class TreatmentPlanStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=TreatmentPlan.Status.choices)
