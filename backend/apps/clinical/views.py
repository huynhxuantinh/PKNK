from pathlib import Path

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.audit.services import AuditService
from apps.dentist_api.exceptions import DentistConflict
from apps.dentist_api.views import DentistAPIView
from apps.dentist_api.serializers import DentistAppointmentSerializer
from apps.scheduling.models import Appointment, AppointmentStatusHistory
from apps.scheduling.services import AppointmentService

from .models import (
    ClinicalEncounter,
    ClinicalAttachment,
    OdontogramEntry,
    Prescription,
    PrescriptionItem,
    TreatmentPlan,
    TreatmentPlanItem,
)
from .serializers import (
    ClinicalAmendmentSerializer,
    ClinicalAttachmentSerializer,
    ClinicalEncounterSerializer,
    OdontogramEntrySerializer,
    PrescriptionItemSerializer,
    PrescriptionSerializer,
    TreatmentPlanItemSerializer,
    TreatmentPlanSerializer,
    TreatmentPlanStatusSerializer,
    VoidPrescriptionSerializer,
)
from .services import ClinicalWorkflowService


def conflict(error):
    return DentistConflict("; ".join(error.messages))


def attachment_file_response(attachment):
    try:
        file_handle = attachment.file.open("rb")
    except (FileNotFoundError, OSError) as error:
        raise Http404("File không tồn tại.") from error
    extension = Path(attachment.file.name).suffix.lower()
    response = FileResponse(
        file_handle,
        as_attachment=True,
        filename=f"clinical-attachment-{attachment.pk}{extension}",
        content_type=attachment.content_type,
    )
    response["Content-Length"] = attachment.size_bytes
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Security-Policy"] = "sandbox"
    return response


class ClinicalAPIView(DentistAPIView):
    throttle_scope = "dentist_mutation"

    def scoped_encounters(self):
        dentist, branch_ids = self.dentist_and_branch_ids()
        return ClinicalEncounter.objects.filter(
            appointment__dentist=dentist,
            appointment__branch_id__in=branch_ids,
        ).select_related(
            "appointment__branch__organization",
            "appointment__patient_profile__user",
            "appointment__dentist__user",
        ).prefetch_related(
            "odontogram_entries", "attachments", "amendments", "prescription__items"
        )

    def encounter(self, encounter_id):
        return get_object_or_404(self.scoped_encounters(), pk=encounter_id)

    def audit_read(self, request, instance, action, resource_type):
        appointment = instance.appointment if hasattr(instance, "appointment") else instance.encounter.appointment
        AuditService.record_read(
            actor_user=request.user, organization=appointment.branch.organization,
            branch=appointment.branch, action=action, resource_type=resource_type,
            resource_id=instance.pk, request=request,
        )


class AppointmentClinicalEncounterAPIView(ClinicalAPIView):
    serializer_class = ClinicalEncounterSerializer

    def get_appointment(self, public_code):
        _, appointments = self.appointment_queryset()
        return get_object_or_404(appointments, public_code=public_code)

    def get(self, request, public_code):
        appointment = self.get_appointment(public_code)
        encounter = get_object_or_404(self.scoped_encounters(), appointment=appointment)
        self.audit_read(request, encounter, "CLINICAL_ENCOUNTER_VIEWED", "ClinicalEncounter")
        return Response({"data": self.serializer_class(encounter).data})

    @transaction.atomic
    def post(self, request, public_code):
        appointment = self.get_appointment(public_code)
        if appointment.status != Appointment.Status.IN_PROGRESS:
            raise DentistConflict("Chỉ tạo bệnh án khi lượt khám đang diễn ra.")
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        if ClinicalEncounter.objects.filter(appointment=appointment).exists():
            raise DentistConflict("Lượt khám đã có bệnh án.")
        encounter = serializer.save(appointment=appointment, created_by=request.user)
        AuditService.record_write(
            actor_user=request.user, organization=appointment.branch.organization,
            branch=appointment.branch, action="CLINICAL_ENCOUNTER_CREATED",
            resource_type="ClinicalEncounter", resource_id=encounter.pk,
            after_data={"status": encounter.status}, request=request,
        )
        return Response({"data": self.serializer_class(encounter).data}, status=status.HTTP_201_CREATED)


class ClinicalEncounterDetailAPIView(ClinicalAPIView):
    serializer_class = ClinicalEncounterSerializer

    def get(self, request, encounter_id):
        encounter = self.encounter(encounter_id)
        self.audit_read(request, encounter, "CLINICAL_ENCOUNTER_VIEWED", "ClinicalEncounter")
        return Response({"data": self.serializer_class(encounter).data})

    @transaction.atomic
    def patch(self, request, encounter_id):
        encounter = ClinicalEncounter.objects.select_for_update().select_related("appointment").get(
            pk=self.encounter(encounter_id).pk
        )
        try:
            ClinicalWorkflowService.ensure_draft(encounter)
        except DjangoValidationError as error:
            raise conflict(error)
        serializer = self.serializer_class(encounter, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        AuditService.record_write(
            actor_user=request.user, organization=encounter.appointment.branch.organization,
            branch=encounter.appointment.branch, action="CLINICAL_ENCOUNTER_UPDATED",
            resource_type="ClinicalEncounter", resource_id=encounter.pk,
            after_data={"changed_fields": sorted(serializer.validated_data)}, request=request,
        )
        return Response({"data": serializer.data})


class ClinicalEncounterFinalizeAPIView(ClinicalAPIView):
    serializer_class = ClinicalEncounterSerializer

    @extend_schema(request=None, responses={200: ClinicalEncounterSerializer})
    def post(self, request, encounter_id):
        encounter = self.encounter(encounter_id)
        try:
            encounter = ClinicalWorkflowService.finalize_encounter(
                encounter_id=encounter.pk, actor_user=request.user, request=request
            )
        except DjangoValidationError as error:
            raise conflict(error)
        return Response({"data": ClinicalEncounterSerializer(encounter).data})


class ClinicalAmendmentListCreateAPIView(ClinicalAPIView):
    serializer_class = ClinicalAmendmentSerializer

    def get(self, request, encounter_id):
        encounter = self.encounter(encounter_id)
        self.audit_read(request, encounter, "CLINICAL_AMENDMENTS_VIEWED", "ClinicalEncounter")
        return Response({"data": self.serializer_class(encounter.amendments.all(), many=True).data})

    def post(self, request, encounter_id):
        encounter = self.encounter(encounter_id)
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            amendment = ClinicalWorkflowService.add_amendment(
                encounter_id=encounter.pk, actor_user=request.user, request=request,
                **serializer.validated_data,
            )
        except DjangoValidationError as error:
            raise conflict(error)
        return Response({"data": self.serializer_class(amendment).data}, status=status.HTTP_201_CREATED)


class OdontogramListCreateAPIView(ClinicalAPIView):
    serializer_class = OdontogramEntrySerializer

    def get(self, request, encounter_id):
        encounter = self.encounter(encounter_id)
        self.audit_read(request, encounter, "ODONTOGRAM_VIEWED", "ClinicalEncounter")
        return Response({"data": self.serializer_class(encounter.odontogram_entries.all(), many=True).data})

    @transaction.atomic
    def post(self, request, encounter_id):
        encounter = ClinicalEncounter.objects.select_for_update().select_related("appointment").get(
            pk=self.encounter(encounter_id).pk
        )
        try:
            ClinicalWorkflowService.ensure_draft(encounter)
        except DjangoValidationError as error:
            raise conflict(error)
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        entry = serializer.save(encounter=encounter)
        self._audit_write(request, encounter, entry.pk, "ODONTOGRAM_ENTRY_CREATED")
        return Response({"data": self.serializer_class(entry).data}, status=status.HTTP_201_CREATED)

    @staticmethod
    def _audit_write(request, encounter, resource_id, action):
        AuditService.record_write(
            actor_user=request.user, organization=encounter.appointment.branch.organization,
            branch=encounter.appointment.branch, action=action,
            resource_type="OdontogramEntry", resource_id=resource_id, request=request,
        )


class OdontogramDetailAPIView(ClinicalAPIView):
    serializer_class = OdontogramEntrySerializer

    def item(self, item_id):
        return get_object_or_404(
            OdontogramEntry.objects.select_related("encounter__appointment__branch__organization").filter(
                encounter__in=self.scoped_encounters()
            ), pk=item_id,
        )

    @transaction.atomic
    def patch(self, request, item_id):
        item = self.item(item_id)
        encounter = ClinicalEncounter.objects.select_for_update().select_related("appointment__branch__organization").get(pk=item.encounter_id)
        try:
            ClinicalWorkflowService.ensure_draft(encounter)
        except DjangoValidationError as error:
            raise conflict(error)
        serializer = self.serializer_class(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        OdontogramListCreateAPIView._audit_write(request, encounter, item.pk, "ODONTOGRAM_ENTRY_UPDATED")
        return Response({"data": serializer.data})

    @transaction.atomic
    def delete(self, request, item_id):
        item = self.item(item_id)
        encounter = ClinicalEncounter.objects.select_for_update().select_related("appointment__branch__organization").get(pk=item.encounter_id)
        try:
            ClinicalWorkflowService.ensure_draft(encounter)
        except DjangoValidationError as error:
            raise conflict(error)
        resource_id = item.pk
        item.delete()
        OdontogramListCreateAPIView._audit_write(request, encounter, resource_id, "ODONTOGRAM_ENTRY_DELETED")
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClinicalAttachmentListCreateAPIView(ClinicalAPIView):
    serializer_class = ClinicalAttachmentSerializer
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "clinical_attachment"

    def get(self, request, encounter_id):
        encounter = self.encounter(encounter_id)
        self.audit_read(
            request, encounter, "CLINICAL_ATTACHMENTS_VIEWED", "ClinicalEncounter"
        )
        serializer = self.serializer_class(
            encounter.attachments.all(), many=True, context={"request": request}
        )
        return Response({"data": serializer.data})

    @transaction.atomic
    def post(self, request, encounter_id):
        encounter = ClinicalEncounter.objects.select_for_update().select_related(
            "appointment__branch__organization"
        ).get(pk=self.encounter(encounter_id).pk)
        try:
            ClinicalWorkflowService.ensure_draft(encounter)
        except DjangoValidationError as error:
            raise conflict(error)
        serializer = self.serializer_class(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        attachment = serializer.save(encounter=encounter, uploaded_by=request.user)
        self._audit_write(request, attachment, "CLINICAL_ATTACHMENT_CREATED")
        return Response(
            {
                "data": self.serializer_class(
                    attachment, context={"request": request}
                ).data
            },
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _audit_write(request, attachment, action):
        appointment = attachment.encounter.appointment
        AuditService.record_write(
            actor_user=request.user,
            organization=appointment.branch.organization,
            branch=appointment.branch,
            action=action,
            resource_type="ClinicalAttachment",
            resource_id=attachment.pk,
            after_data={
                "encounter_id": attachment.encounter_id,
                "kind": attachment.kind,
                "content_type": attachment.content_type,
                "size_bytes": attachment.size_bytes,
            },
            request=request,
        )


class ClinicalAttachmentDetailAPIView(ClinicalAPIView):
    serializer_class = ClinicalAttachmentSerializer
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "clinical_attachment"

    def item(self, attachment_id):
        return get_object_or_404(
            ClinicalAttachment.objects.select_related(
                "encounter__appointment__branch__organization"
            ).filter(encounter__in=self.scoped_encounters()),
            pk=attachment_id,
        )

    def get(self, request, attachment_id):
        attachment = self.item(attachment_id)
        self.audit_read(
            request, attachment, "CLINICAL_ATTACHMENT_VIEWED", "ClinicalAttachment"
        )
        return Response(
            {
                "data": self.serializer_class(
                    attachment, context={"request": request}
                ).data
            }
        )

    @transaction.atomic
    def patch(self, request, attachment_id):
        attachment = ClinicalAttachment.objects.select_for_update().select_related(
            "encounter__appointment__branch__organization"
        ).get(pk=self.item(attachment_id).pk)
        try:
            ClinicalWorkflowService.ensure_draft(attachment.encounter)
        except DjangoValidationError as error:
            raise conflict(error)
        serializer = self.serializer_class(
            attachment,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        ClinicalAttachmentListCreateAPIView._audit_write(
            request, attachment, "CLINICAL_ATTACHMENT_UPDATED"
        )
        return Response({"data": serializer.data})

    @transaction.atomic
    def delete(self, request, attachment_id):
        attachment = ClinicalAttachment.objects.select_for_update().select_related(
            "encounter__appointment__branch__organization"
        ).get(pk=self.item(attachment_id).pk)
        try:
            ClinicalWorkflowService.ensure_draft(attachment.encounter)
        except DjangoValidationError as error:
            raise conflict(error)
        storage = attachment.file.storage
        stored_name = attachment.file.name
        resource_id = attachment.pk
        encounter = attachment.encounter
        attachment.delete()
        transaction.on_commit(lambda: storage.delete(stored_name))
        AuditService.record_write(
            actor_user=request.user,
            organization=encounter.appointment.branch.organization,
            branch=encounter.appointment.branch,
            action="CLINICAL_ATTACHMENT_DELETED",
            resource_type="ClinicalAttachment",
            resource_id=resource_id,
            before_data={"encounter_id": encounter.pk},
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClinicalAttachmentDownloadAPIView(ClinicalAttachmentDetailAPIView):
    @extend_schema(
        responses={
            200: OpenApiResponse(
                response=OpenApiTypes.BINARY,
                description="Nội dung file bệnh án",
            )
        }
    )
    def get(self, request, attachment_id):
        attachment = self.item(attachment_id)
        self.audit_read(
            request, attachment, "CLINICAL_ATTACHMENT_DOWNLOADED", "ClinicalAttachment"
        )
        return attachment_file_response(attachment)


class PrescriptionAPIView(ClinicalAPIView):
    serializer_class = PrescriptionSerializer

    def get(self, request, encounter_id):
        encounter = self.encounter(encounter_id)
        prescription = get_object_or_404(Prescription.objects.prefetch_related("items"), encounter=encounter)
        self.audit_read(request, prescription, "PRESCRIPTION_VIEWED", "Prescription")
        return Response({"data": self.serializer_class(prescription).data})

    @transaction.atomic
    def post(self, request, encounter_id):
        encounter = ClinicalEncounter.objects.select_for_update().select_related("appointment").get(pk=self.encounter(encounter_id).pk)
        if encounter.status != ClinicalEncounter.Status.DRAFT or encounter.appointment.status != Appointment.Status.IN_PROGRESS:
            raise DentistConflict("Chỉ tạo đơn thuốc khi bệnh án đang soạn.")
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        if Prescription.objects.filter(encounter=encounter).exists():
            raise DentistConflict("Bệnh án đã có đơn thuốc.")
        prescription = serializer.save(encounter=encounter, created_by=request.user)
        self._audit(request, prescription, "PRESCRIPTION_CREATED")
        return Response({"data": self.serializer_class(prescription).data}, status=status.HTTP_201_CREATED)

    @staticmethod
    def _audit(request, prescription, action):
        appointment = prescription.encounter.appointment
        AuditService.record_write(
            actor_user=request.user, organization=appointment.branch.organization,
            branch=appointment.branch, action=action, resource_type="Prescription",
            resource_id=prescription.pk, request=request,
        )


class PrescriptionDetailAPIView(ClinicalAPIView):
    serializer_class = PrescriptionSerializer

    def item(self, prescription_id):
        return get_object_or_404(
            Prescription.objects.select_related("encounter__appointment__branch__organization").prefetch_related("items").filter(
                encounter__in=self.scoped_encounters()
            ), pk=prescription_id,
        )

    @transaction.atomic
    def patch(self, request, prescription_id):
        prescription = Prescription.objects.select_for_update().get(pk=self.item(prescription_id).pk)
        if prescription.status != Prescription.Status.DRAFT:
            raise DentistConflict("Đơn thuốc đã phát hành không thể sửa.")
        serializer = self.serializer_class(prescription, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        PrescriptionAPIView._audit(request, self.item(prescription_id), "PRESCRIPTION_UPDATED")
        return Response({"data": serializer.data})


class PrescriptionIssueAPIView(PrescriptionDetailAPIView):
    def post(self, request, prescription_id):
        prescription = self.item(prescription_id)
        try:
            prescription = ClinicalWorkflowService.issue_prescription(
                prescription_id=prescription.pk, actor_user=request.user, request=request
            )
        except DjangoValidationError as error:
            raise conflict(error)
        return Response({"data": self.serializer_class(prescription).data})


class PrescriptionVoidAPIView(PrescriptionDetailAPIView):
    def post(self, request, prescription_id):
        payload = VoidPrescriptionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        prescription = self.item(prescription_id)
        try:
            prescription = ClinicalWorkflowService.void_prescription(
                prescription_id=prescription.pk, actor_user=request.user,
                reason=payload.validated_data["reason"], request=request,
            )
        except DjangoValidationError as error:
            raise conflict(error)
        return Response({"data": self.serializer_class(prescription).data})


class PrescriptionItemListCreateAPIView(PrescriptionDetailAPIView):
    serializer_class = PrescriptionItemSerializer

    def get(self, request, prescription_id):
        prescription = self.item(prescription_id)
        self.audit_read(request, prescription, "PRESCRIPTION_ITEMS_VIEWED", "Prescription")
        return Response({"data": self.serializer_class(prescription.items.all(), many=True).data})

    @transaction.atomic
    def post(self, request, prescription_id):
        prescription = Prescription.objects.select_for_update().select_related("encounter__appointment__branch__organization").get(pk=self.item(prescription_id).pk)
        if prescription.status != Prescription.Status.DRAFT:
            raise DentistConflict("Chỉ được sửa thuốc khi đơn còn nháp.")
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = serializer.save(prescription=prescription)
        PrescriptionAPIView._audit(request, prescription, "PRESCRIPTION_ITEM_CREATED")
        return Response({"data": self.serializer_class(item).data}, status=status.HTTP_201_CREATED)


class PrescriptionItemDetailAPIView(ClinicalAPIView):
    serializer_class = PrescriptionItemSerializer

    def item(self, item_id):
        return get_object_or_404(
            PrescriptionItem.objects.select_related("prescription__encounter__appointment__branch__organization").filter(
                prescription__encounter__in=self.scoped_encounters()
            ), pk=item_id,
        )

    @transaction.atomic
    def patch(self, request, item_id):
        item = self.item(item_id)
        prescription = Prescription.objects.select_for_update().get(pk=item.prescription_id)
        if prescription.status != Prescription.Status.DRAFT:
            raise DentistConflict("Chỉ được sửa thuốc khi đơn còn nháp.")
        serializer = self.serializer_class(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        PrescriptionAPIView._audit(request, self.item(item_id).prescription, "PRESCRIPTION_ITEM_UPDATED")
        return Response({"data": serializer.data})

    @transaction.atomic
    def delete(self, request, item_id):
        item = self.item(item_id)
        prescription = Prescription.objects.select_for_update().select_related("encounter__appointment__branch__organization").get(pk=item.prescription_id)
        if prescription.status != Prescription.Status.DRAFT:
            raise DentistConflict("Chỉ được sửa thuốc khi đơn còn nháp.")
        item.delete()
        PrescriptionAPIView._audit(request, prescription, "PRESCRIPTION_ITEM_DELETED")
        return Response(status=status.HTTP_204_NO_CONTENT)


class TreatmentPlanListCreateAPIView(ClinicalAPIView):
    serializer_class = TreatmentPlanSerializer

    def get(self, request, encounter_id):
        encounter = self.encounter(encounter_id)
        self.audit_read(request, encounter, "TREATMENT_PLANS_VIEWED", "ClinicalEncounter")
        return Response({"data": self.serializer_class(encounter.treatment_plans.prefetch_related("items__service"), many=True).data})

    @transaction.atomic
    def post(self, request, encounter_id):
        encounter = ClinicalEncounter.objects.select_for_update().select_related("appointment__branch__organization", "appointment__patient_profile", "appointment__dentist").get(pk=self.encounter(encounter_id).pk)
        if encounter.status != ClinicalEncounter.Status.FINALIZED:
            raise DentistConflict("Phải chốt bệnh án trước khi lập kế hoạch điều trị.")
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        appointment = encounter.appointment
        plan = serializer.save(
            originating_encounter=encounter, organization=appointment.branch.organization,
            patient_profile=appointment.patient_profile, dentist=appointment.dentist,
            branch=appointment.branch,
        )
        self._audit(request, plan, "TREATMENT_PLAN_CREATED")
        return Response({"data": self.serializer_class(plan).data}, status=status.HTTP_201_CREATED)

    @staticmethod
    def _audit(request, plan, action):
        AuditService.record_write(
            actor_user=request.user, organization=plan.organization, branch=plan.branch,
            action=action, resource_type="TreatmentPlan", resource_id=plan.pk, request=request,
        )


class TreatmentPlanDetailAPIView(ClinicalAPIView):
    serializer_class = TreatmentPlanSerializer
    transitions = {
        TreatmentPlan.Status.DRAFT: {TreatmentPlan.Status.ACTIVE, TreatmentPlan.Status.CANCELLED},
        TreatmentPlan.Status.ACTIVE: {TreatmentPlan.Status.COMPLETED, TreatmentPlan.Status.CANCELLED},
    }

    def plan(self, plan_id):
        return get_object_or_404(
            TreatmentPlan.objects.select_related("originating_encounter__appointment", "organization", "branch").prefetch_related("items__service").filter(
                originating_encounter__in=self.scoped_encounters()
            ), pk=plan_id,
        )

    def get(self, request, plan_id):
        plan = self.plan(plan_id)
        AuditService.record_read(
            actor_user=request.user, organization=plan.organization, branch=plan.branch,
            action="TREATMENT_PLAN_VIEWED", resource_type="TreatmentPlan",
            resource_id=plan.pk, request=request,
        )
        return Response({"data": self.serializer_class(plan).data})

    @transaction.atomic
    def patch(self, request, plan_id):
        plan = TreatmentPlan.objects.select_for_update().get(pk=self.plan(plan_id).pk)
        if plan.status in {TreatmentPlan.Status.COMPLETED, TreatmentPlan.Status.CANCELLED}:
            raise DentistConflict("Kế hoạch đã kết thúc và không thể sửa.")
        requested_status = request.data.get("status")
        if requested_status and requested_status != plan.status:
            state = TreatmentPlanStatusSerializer(data={"status": requested_status})
            state.is_valid(raise_exception=True)
            if requested_status not in self.transitions.get(plan.status, set()):
                raise DentistConflict("Chuyển trạng thái kế hoạch điều trị không hợp lệ.")
        serializer = self.serializer_class(plan, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(status=requested_status or plan.status)
        TreatmentPlanListCreateAPIView._audit(request, plan, "TREATMENT_PLAN_UPDATED")
        return Response({"data": serializer.data})


class TreatmentPlanItemListCreateAPIView(TreatmentPlanDetailAPIView):
    serializer_class = TreatmentPlanItemSerializer

    def get(self, request, plan_id):
        plan = self.plan(plan_id)
        return Response({"data": self.serializer_class(plan.items.select_related("service"), many=True).data})

    @transaction.atomic
    def post(self, request, plan_id):
        plan = TreatmentPlan.objects.select_for_update().select_related("organization").get(pk=self.plan(plan_id).pk)
        if plan.status not in {TreatmentPlan.Status.DRAFT, TreatmentPlan.Status.ACTIVE}:
            raise DentistConflict("Kế hoạch đã kết thúc và không thể sửa.")
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data["service"].organization_id != plan.organization_id:
            raise ValidationError({"service_id": "Dịch vụ không thuộc organization."})
        item = serializer.save(treatment_plan=plan)
        ClinicalWorkflowService.recalculate_plan_total(plan)
        TreatmentPlanListCreateAPIView._audit(request, plan, "TREATMENT_PLAN_ITEM_CREATED")
        return Response({"data": self.serializer_class(item).data}, status=status.HTTP_201_CREATED)


class TreatmentPlanItemDetailAPIView(ClinicalAPIView):
    serializer_class = TreatmentPlanItemSerializer

    def item(self, item_id):
        return get_object_or_404(
            TreatmentPlanItem.objects.select_related("treatment_plan__organization", "service").filter(
                treatment_plan__originating_encounter__in=self.scoped_encounters()
            ), pk=item_id,
        )

    @transaction.atomic
    def patch(self, request, item_id):
        item = self.item(item_id)
        plan = TreatmentPlan.objects.select_for_update().get(pk=item.treatment_plan_id)
        if plan.status not in {TreatmentPlan.Status.DRAFT, TreatmentPlan.Status.ACTIVE}:
            raise DentistConflict("Kế hoạch đã kết thúc và không thể sửa.")
        serializer = self.serializer_class(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        service = serializer.validated_data.get("service", item.service)
        if service.organization_id != plan.organization_id:
            raise ValidationError({"service_id": "Dịch vụ không thuộc organization."})
        serializer.save()
        ClinicalWorkflowService.recalculate_plan_total(plan)
        TreatmentPlanListCreateAPIView._audit(request, plan, "TREATMENT_PLAN_ITEM_UPDATED")
        return Response({"data": serializer.data})

    @transaction.atomic
    def delete(self, request, item_id):
        item = self.item(item_id)
        plan = TreatmentPlan.objects.select_for_update().get(pk=item.treatment_plan_id)
        if plan.status not in {TreatmentPlan.Status.DRAFT, TreatmentPlan.Status.ACTIVE}:
            raise DentistConflict("Kế hoạch đã kết thúc và không thể sửa.")
        item.delete()
        ClinicalWorkflowService.recalculate_plan_total(plan)
        TreatmentPlanListCreateAPIView._audit(request, plan, "TREATMENT_PLAN_ITEM_DELETED")
        return Response(status=status.HTTP_204_NO_CONTENT)


class DentistAppointmentCompleteAPIView(ClinicalAPIView):
    serializer_class = DentistAppointmentSerializer

    @extend_schema(request=None, responses={200: DentistAppointmentSerializer})
    def post(self, request, public_code):
        _, appointments = self.appointment_queryset()
        appointment = get_object_or_404(appointments, public_code=public_code)
        try:
            appointment = AppointmentService.transition_status(
                appointment_id=appointment.pk, to_status=Appointment.Status.COMPLETED,
                actor_type=AppointmentStatusHistory.ActorType.DENTIST,
                actor_user=request.user, request=request,
            )
        except DjangoValidationError as error:
            raise conflict(error)
        return Response({"data": DentistAppointmentSerializer(appointment).data})
