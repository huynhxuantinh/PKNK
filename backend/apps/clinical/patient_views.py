from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import PatientProfile
from apps.audit.services import AuditService
from apps.scheduling.models import Appointment

from .models import ClinicalAttachment, ClinicalEncounter, TreatmentPlan
from .serializers import PatientClinicalEncounterSerializer
from .views import attachment_file_response


class PatientClinicalEncounterBaseAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def queryset(self):
        profile = get_object_or_404(PatientProfile, user=self.request.user)
        return ClinicalEncounter.objects.filter(
            appointment__patient_profile=profile,
            appointment__status=Appointment.Status.COMPLETED,
            status=ClinicalEncounter.Status.FINALIZED,
        ).select_related(
            "appointment__branch__organization",
            "appointment__branch_service__service",
            "appointment__dentist__user",
        ).prefetch_related(
            "odontogram_entries",
            "attachments",
            "amendments",
            "prescription__items",
            Prefetch(
                "treatment_plans",
                queryset=TreatmentPlan.objects.exclude(
                    status=TreatmentPlan.Status.DRAFT
                ).prefetch_related("items__service"),
                to_attr="patient_visible_treatment_plans",
            ),
        )

    @staticmethod
    def audit(request, encounter, action):
        AuditService.record_read(
            actor_user=request.user,
            organization=encounter.appointment.branch.organization,
            branch=encounter.appointment.branch,
            action=action,
            resource_type="ClinicalEncounter",
            resource_id=encounter.pk,
            request=request,
        )


class PatientClinicalEncounterListAPIView(PatientClinicalEncounterBaseAPIView):
    serializer_class = PatientClinicalEncounterSerializer

    @extend_schema(
        operation_id="patient_clinical_encounter_list",
        responses={200: PatientClinicalEncounterSerializer(many=True)},
    )
    def get(self, request):
        encounters = self.queryset().order_by("-finalized_at")
        profile = get_object_or_404(PatientProfile, user=request.user)
        AuditService.record_read(
            actor_user=request.user,
            action="PATIENT_CLINICAL_ENCOUNTER_LIST_VIEWED",
            resource_type="PatientProfile",
            resource_id=profile.pk,
            request=request,
        )
        return Response(
            {
                "data": PatientClinicalEncounterSerializer(
                    encounters, many=True, context={"request": request}
                ).data
            }
        )


class PatientClinicalEncounterDetailAPIView(PatientClinicalEncounterBaseAPIView):
    serializer_class = PatientClinicalEncounterSerializer

    @extend_schema(
        operation_id="patient_clinical_encounter_detail",
        responses={200: PatientClinicalEncounterSerializer},
    )
    def get(self, request, encounter_id):
        encounter = get_object_or_404(self.queryset(), pk=encounter_id)
        self.audit(request, encounter, "PATIENT_CLINICAL_ENCOUNTER_VIEWED")
        return Response(
            {
                "data": PatientClinicalEncounterSerializer(
                    encounter, context={"request": request}
                ).data
            }
        )


class PatientClinicalAttachmentDownloadAPIView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "clinical_attachment"

    @extend_schema(responses={200: OpenApiTypes.BINARY})
    def get(self, request, attachment_id):
        profile = get_object_or_404(PatientProfile, user=request.user)
        attachment = get_object_or_404(
            ClinicalAttachment.objects.select_related(
                "encounter__appointment__branch__organization"
            ).filter(
                encounter__appointment__patient_profile=profile,
                encounter__appointment__status=Appointment.Status.COMPLETED,
                encounter__status=ClinicalEncounter.Status.FINALIZED,
            ),
            pk=attachment_id,
        )
        appointment = attachment.encounter.appointment
        AuditService.record_read(
            actor_user=request.user,
            organization=appointment.branch.organization,
            branch=appointment.branch,
            action="PATIENT_CLINICAL_ATTACHMENT_DOWNLOADED",
            resource_type="ClinicalAttachment",
            resource_id=attachment.pk,
            request=request,
        )
        return attachment_file_response(attachment)
