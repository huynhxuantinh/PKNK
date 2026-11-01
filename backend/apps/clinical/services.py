from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.audit.services import AuditService
from apps.scheduling.models import Appointment

from .models import (
    ClinicalAmendment,
    ClinicalEncounter,
    ClinicalPerformedService,
    Prescription,
    TreatmentPlan,
)


class ClinicalWorkflowService:
    @staticmethod
    def ensure_draft(encounter):
        if encounter.status != ClinicalEncounter.Status.DRAFT:
            raise ValidationError("Bệnh án đã chốt và không thể sửa trực tiếp.")
        if encounter.appointment.status != Appointment.Status.IN_PROGRESS:
            raise ValidationError("Chỉ được sửa bệnh án khi lượt khám đang diễn ra.")

    @classmethod
    @transaction.atomic
    def replace_performed_services(cls, *, encounter_id, items, actor_user, request=None):
        """Replace dentist-confirmed services performed in a draft encounter."""
        encounter = ClinicalEncounter.objects.select_for_update().select_related(
            "appointment__branch__organization"
        ).get(pk=encounter_id)
        cls.ensure_draft(encounter)

        branch_service_ids = [item["branch_service_id"] for item in items]
        from apps.catalog.models import BranchService

        branch_services = {
            branch_service.pk: branch_service
            for branch_service in BranchService.objects.select_related("service").filter(
                pk__in=branch_service_ids,
                branch_id=encounter.appointment.branch_id,
                is_active=True,
                service__is_active=True,
            )
        }
        if set(branch_service_ids).difference(branch_services):
            raise ValidationError("Dịch vụ thực hiện không thuộc danh mục đang hoạt động của chi nhánh.")

        before_count = encounter.performed_services.count()
        ClinicalPerformedService.objects.filter(encounter=encounter).delete()
        ClinicalPerformedService.objects.bulk_create(
            [
                ClinicalPerformedService(
                    encounter=encounter,
                    branch_service=branch_services[item["branch_service_id"]],
                    service_code_snapshot=branch_services[item["branch_service_id"]].service.code,
                    service_name_snapshot=branch_services[item["branch_service_id"]].service.name,
                    unit_price_snapshot=branch_services[item["branch_service_id"]].price,
                    quantity=item["quantity"],
                    tooth_reference=item.get("tooth_reference", "").strip(),
                    clinical_note=item.get("clinical_note", "").strip(),
                )
                for item in items
            ]
        )
        encounter.performed_services_confirmed = True
        encounter.save(update_fields=["performed_services_confirmed", "updated_at"])
        AuditService.record_write(
            actor_user=actor_user,
            organization=encounter.appointment.branch.organization,
            branch=encounter.appointment.branch,
            action="CLINICAL_PERFORMED_SERVICES_REPLACED",
            resource_type="ClinicalEncounter",
            resource_id=encounter.pk,
            before_data={"performed_service_count": before_count},
            after_data={
                "performed_service_count": len(items),
                "performed_services_confirmed": True,
            },
            request=request,
        )
        return encounter

    @classmethod
    @transaction.atomic
    def finalize_encounter(cls, *, encounter_id, actor_user, request=None):
        encounter = ClinicalEncounter.objects.select_for_update().select_related(
            "appointment__branch__organization"
        ).get(pk=encounter_id)
        cls.ensure_draft(encounter)
        if not encounter.diagnosis_summary.strip():
            raise ValidationError("Phải nhập chẩn đoán trước khi chốt bệnh án.")
        if not encounter.performed_services_confirmed:
            raise ValidationError(
                "Cần xác nhận dịch vụ đã thực hiện hoặc xác nhận không có thủ thuật trước khi chốt bệnh án."
            )
        now = timezone.now()
        encounter.status = ClinicalEncounter.Status.FINALIZED
        encounter.finalized_by = actor_user
        encounter.finalized_at = now
        encounter.save(update_fields=["status", "finalized_by", "finalized_at", "updated_at"])
        AuditService.record_write(
            actor_user=actor_user,
            organization=encounter.appointment.branch.organization,
            branch=encounter.appointment.branch,
            action="CLINICAL_ENCOUNTER_FINALIZED",
            resource_type="ClinicalEncounter",
            resource_id=encounter.pk,
            before_data={"status": ClinicalEncounter.Status.DRAFT},
            after_data={"status": ClinicalEncounter.Status.FINALIZED},
            request=request,
        )
        return encounter

    @classmethod
    @transaction.atomic
    def add_amendment(cls, *, encounter_id, content, reason, actor_user, request=None):
        encounter = ClinicalEncounter.objects.select_for_update().select_related(
            "appointment__branch__organization"
        ).get(pk=encounter_id)
        if encounter.status != ClinicalEncounter.Status.FINALIZED:
            raise ValidationError("Chỉ bổ sung amendment sau khi bệnh án đã chốt.")
        amendment = ClinicalAmendment.objects.create(
            encounter=encounter,
            content=content.strip(),
            reason=reason.strip(),
            author=actor_user,
        )
        AuditService.record_write(
            actor_user=actor_user,
            organization=encounter.appointment.branch.organization,
            branch=encounter.appointment.branch,
            action="CLINICAL_AMENDMENT_CREATED",
            resource_type="ClinicalAmendment",
            resource_id=amendment.pk,
            after_data={"encounter_id": encounter.pk},
            request=request,
        )
        return amendment

    @staticmethod
    @transaction.atomic
    def issue_prescription(*, prescription_id, actor_user, request=None):
        prescription = Prescription.objects.select_for_update().select_related(
            "encounter__appointment__branch__organization"
        ).get(pk=prescription_id)
        if prescription.status != Prescription.Status.DRAFT:
            raise ValidationError("Chỉ đơn thuốc bản nháp mới được phát hành.")
        if prescription.encounter.status != ClinicalEncounter.Status.FINALIZED:
            raise ValidationError("Phải chốt bệnh án trước khi phát hành đơn thuốc.")
        if not prescription.items.exists():
            raise ValidationError("Đơn thuốc phải có ít nhất một thuốc.")
        prescription.status = Prescription.Status.ISSUED
        prescription.issued_by = actor_user
        prescription.issued_at = timezone.now()
        prescription.save(update_fields=["status", "issued_by", "issued_at", "updated_at"])
        appointment = prescription.encounter.appointment
        AuditService.record_write(
            actor_user=actor_user, organization=appointment.branch.organization,
            branch=appointment.branch, action="PRESCRIPTION_ISSUED",
            resource_type="Prescription", resource_id=prescription.pk,
            before_data={"status": Prescription.Status.DRAFT},
            after_data={"status": Prescription.Status.ISSUED}, request=request,
        )
        return prescription

    @staticmethod
    @transaction.atomic
    def void_prescription(*, prescription_id, reason, actor_user, request=None):
        prescription = Prescription.objects.select_for_update().select_related(
            "encounter__appointment__branch__organization"
        ).get(pk=prescription_id)
        if prescription.status != Prescription.Status.ISSUED:
            raise ValidationError("Chỉ đơn thuốc đã phát hành mới được VOID.")
        prescription.status = Prescription.Status.VOID
        prescription.voided_by = actor_user
        prescription.voided_at = timezone.now()
        prescription.void_reason = reason.strip()
        prescription.save(update_fields=["status", "voided_by", "voided_at", "void_reason", "updated_at"])
        appointment = prescription.encounter.appointment
        AuditService.record_write(
            actor_user=actor_user, organization=appointment.branch.organization,
            branch=appointment.branch, action="PRESCRIPTION_VOIDED",
            resource_type="Prescription", resource_id=prescription.pk,
            before_data={"status": Prescription.Status.ISSUED},
            after_data={"status": Prescription.Status.VOID}, request=request,
        )
        return prescription

    @staticmethod
    def recalculate_plan_total(plan):
        total = plan.items.exclude(
            status="CANCELLED"
        ).aggregate(total=Sum("planned_price"))["total"] or Decimal("0")
        TreatmentPlan.objects.filter(pk=plan.pk).update(total_estimate=total)
        plan.total_estimate = total
        return plan


def validate_appointment_completion(appointment):
    try:
        encounter = appointment.clinical_encounter
    except ClinicalEncounter.DoesNotExist as error:
        raise ValidationError("Phải có bệnh án trước khi hoàn thành lượt khám.") from error
    if encounter.status != ClinicalEncounter.Status.FINALIZED:
        raise ValidationError("Bệnh án phải được chốt trước khi hoàn thành lượt khám.")
    try:
        prescription = encounter.prescription
    except Prescription.DoesNotExist:
        return
    if prescription.status not in {Prescription.Status.ISSUED, Prescription.Status.VOID}:
        raise ValidationError("Đơn thuốc phải được phát hành hoặc VOID trước khi hoàn thành.")
