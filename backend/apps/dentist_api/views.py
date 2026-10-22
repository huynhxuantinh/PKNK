from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import Dentist
from apps.audit.services import AuditService
from apps.organizations.models import Membership
from apps.scheduling.models import Appointment, AppointmentStatusHistory
from apps.scheduling.services import AppointmentService

from .serializers import (
    DentistAppointmentSerializer,
    DentistScheduleQuerySerializer,
    PatientSummaryQuerySerializer,
)
from .exceptions import DentistConflict


class DentistAPIView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "dentist_read"

    def dentist_and_branch_ids(self):
        dentist = Dentist.objects.select_related("organization", "user").filter(
            user=self.request.user,
            user__is_active=True,
            organization__is_active=True,
            is_active=True,
        ).first()
        if dentist is None:
            raise PermissionDenied("Tài khoản nha sĩ không hoạt động.")
        branch_ids = list(
            Membership.objects.filter(
                user=self.request.user,
                organization=dentist.organization,
                branch__organization=dentist.organization,
                branch__is_active=True,
                role=Membership.Role.DENTIST,
                is_active=True,
            ).values_list("branch_id", flat=True)
        )
        if not branch_ids:
            raise PermissionDenied("Nha sĩ không còn quyền tại chi nhánh nào.")
        return dentist, branch_ids

    def appointment_queryset(self):
        dentist, branch_ids = self.dentist_and_branch_ids()
        queryset = Appointment.objects.filter(
            dentist=dentist,
            branch_id__in=branch_ids,
        ).select_related(
            "branch__organization",
            "branch_service__service",
            "chair",
            "patient_profile__user",
            "dentist__user",
        )
        return dentist, queryset


class DentistScheduleAPIView(DentistAPIView):
    serializer_class = DentistAppointmentSerializer

    @extend_schema(
        parameters=[DentistScheduleQuerySerializer],
        responses={200: DentistAppointmentSerializer(many=True)},
    )
    def get(self, request):
        query = DentistScheduleQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data
        dentist, appointments = self.appointment_queryset()
        appointments = appointments.filter(
            starts_at__lt=data["date_to"],
            occupied_until__gt=data["date_from"],
        )
        if data.get("status"):
            appointments = appointments.filter(status=data["status"])
        appointments = appointments.order_by("starts_at")
        result = self.serializer_class(appointments, many=True).data
        AuditService.record_read(
            actor_user=request.user,
            organization=dentist.organization,
            action="DENTIST_SCHEDULE_VIEWED",
            resource_type="DentistSchedule",
            resource_id=dentist.pk,
            request=request,
        )
        return Response({"data": result, "meta": {"count": len(result)}})


class DentistAppointmentDetailAPIView(DentistAPIView):
    serializer_class = DentistAppointmentSerializer

    @extend_schema(responses={200: DentistAppointmentSerializer})
    def get(self, request, public_code):
        _, appointments = self.appointment_queryset()
        appointment = get_object_or_404(appointments, public_code=public_code)
        AuditService.record_read(
            actor_user=request.user,
            organization=appointment.branch.organization,
            branch=appointment.branch,
            action="DENTIST_APPOINTMENT_VIEWED",
            resource_type="Appointment",
            resource_id=appointment.pk,
            request=request,
        )
        return Response({"data": self.serializer_class(appointment).data})


class DentistAppointmentStartAPIView(DentistAPIView):
    serializer_class = DentistAppointmentSerializer
    throttle_scope = "dentist_mutation"

    @extend_schema(request=None, responses={200: DentistAppointmentSerializer})
    def post(self, request, public_code):
        _, appointments = self.appointment_queryset()
        appointment = get_object_or_404(appointments, public_code=public_code)
        try:
            appointment = AppointmentService.transition_status(
                appointment_id=appointment.pk,
                to_status=Appointment.Status.IN_PROGRESS,
                actor_type=AppointmentStatusHistory.ActorType.DENTIST,
                actor_user=request.user,
                request=request,
            )
        except DjangoValidationError as error:
            raise DentistConflict("; ".join(error.messages)) from error
        return Response({"data": self.serializer_class(appointment).data})


class DentistPatientSummaryAPIView(DentistAPIView):
    @extend_schema(
        parameters=[PatientSummaryQuerySerializer],
        responses={200: dict},
    )
    def get(self, request, patient_profile_id):
        query = PatientSummaryQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        _, appointments = self.appointment_queryset()
        appointment = get_object_or_404(
            appointments,
            public_code=query.validated_data["appointment_code"],
            patient_profile_id=patient_profile_id,
            status__in=[
                Appointment.Status.CONFIRMED,
                Appointment.Status.CHECKED_IN,
                Appointment.Status.IN_PROGRESS,
                Appointment.Status.COMPLETED,
            ],
        )
        patient = appointment.patient_profile
        from apps.clinical.models import ClinicalEncounter
        from apps.clinical.serializers import PatientClinicalEncounterSerializer

        clinical_history = ClinicalEncounter.objects.filter(
            appointment__patient_profile=patient,
            status=ClinicalEncounter.Status.FINALIZED,
        )
        if appointment.status == Appointment.Status.COMPLETED:
            clinical_history = clinical_history.filter(
                appointment__dentist_id=appointment.dentist_id
            )
        else:
            clinical_history = clinical_history.filter(
                appointment__branch__organization=appointment.branch.organization
            )
        clinical_history = clinical_history.select_related(
            "appointment__branch__organization",
            "appointment__branch_service__service",
        ).prefetch_related("odontogram_entries", "amendments", "prescription__items")
        AuditService.record_read(
            actor_user=request.user,
            organization=appointment.branch.organization,
            branch=appointment.branch,
            action="PATIENT_SUMMARY_VIEWED",
            resource_type="PatientProfile",
            resource_id=patient.pk,
            request=request,
        )
        return Response(
            {
                "data": {
                    "id_patient_profile": patient.pk,
                    "full_name": patient.user.full_name,
                    "date_of_birth": patient.date_of_birth,
                    "gender": patient.gender,
                    "phone": patient.phone,
                    "appointment_context": {
                        "public_code": appointment.public_code,
                        "branch_id": appointment.branch_id,
                        "service_name": appointment.service_name_snapshot,
                        "status": appointment.status,
                    },
                    "clinical_history": PatientClinicalEncounterSerializer(
                        clinical_history.order_by("-finalized_at"), many=True
                    ).data,
                }
            }
        )

