from math import ceil

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import PatientProfile
from apps.accounts.permissions import IsEmailVerified, IsPatientOnly
from apps.audit.services import AuditService
from apps.management_api.exceptions import ManagementConflict
from apps.management_api.scheduling_services import RescheduleService

from .exceptions import SchedulingError
from .models import Appointment, AppointmentStatusHistory
from .serializers import (
    PatientAppointmentCancellationSerializer,
    PatientAppointmentListQuerySerializer,
    PatientAppointmentRescheduleSerializer,
    PatientAppointmentSerializer,
)
from .services import AppointmentService
from .views import error_response


UPCOMING_STATUSES = [
    Appointment.Status.PENDING,
    Appointment.Status.CONFIRMED,
    Appointment.Status.CHECKED_IN,
    Appointment.Status.IN_PROGRESS,
]
HISTORY_STATUSES = [
    Appointment.Status.COMPLETED,
    Appointment.Status.CANCELLED,
    Appointment.Status.NO_SHOW,
]


class PatientAppointmentBaseAPIView(APIView):
    permission_classes = [IsAuthenticated, IsPatientOnly]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "patient_appointments"

    def queryset(self):
        return Appointment.objects.filter(
            patient_profile__user=self.request.user,
            status__in=UPCOMING_STATUSES + HISTORY_STATUSES,
        ).select_related(
            "branch__organization", "branch_service__service", "dentist__user",
            "chair", "rescheduled_from", "rescheduled_to",
        )

    def appointment(self, public_code):
        return get_object_or_404(self.queryset(), public_code=public_code)


class PatientAppointmentListAPIView(PatientAppointmentBaseAPIView):
    serializer_class = PatientAppointmentSerializer

    @extend_schema(
        parameters=[PatientAppointmentListQuerySerializer],
        responses={200: PatientAppointmentSerializer(many=True)},
    )
    def get(self, request):
        query = PatientAppointmentListQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data
        is_upcoming = data["scope"] == "UPCOMING"
        statuses = UPCOMING_STATUSES if is_upcoming else HISTORY_STATUSES
        appointments = self.queryset().filter(status__in=statuses)
        if is_upcoming:
            # Check-in and in-progress appointments remain actionable after start time.
            appointments = appointments.filter(
                Q(starts_at__gte=timezone.now())
                | Q(status__in=[
                    Appointment.Status.CHECKED_IN,
                    Appointment.Status.IN_PROGRESS,
                ])
            )
        if data.get("status"):
            appointments = appointments.filter(status=data["status"])
        ordering = "starts_at" if data["scope"] == "UPCOMING" else "-starts_at"
        appointments = appointments.order_by(ordering, "public_code")
        total = appointments.count()
        offset = (data["page"] - 1) * data["page_size"]
        items = appointments[offset:offset + data["page_size"]]
        profile = get_object_or_404(PatientProfile, user=request.user)
        AuditService.record_read(
            actor_user=request.user, action="PATIENT_APPOINTMENT_LIST_VIEWED",
            resource_type="PatientProfile", resource_id=profile.pk,
            after_data={"scope": data["scope"], "status": data.get("status")},
            request=request,
        )
        return Response({
            "data": self.serializer_class(items, many=True).data,
            "meta": {
                "count": total,
                "page": data["page"],
                "page_size": data["page_size"],
                "total_pages": ceil(total / data["page_size"]) if total else 0,
            },
        })


class PatientAppointmentDetailAPIView(PatientAppointmentBaseAPIView):
    serializer_class = PatientAppointmentSerializer

    @extend_schema(responses={200: PatientAppointmentSerializer})
    def get(self, request, public_code):
        appointment = self.appointment(public_code)
        AuditService.record_read(
            actor_user=request.user, organization=appointment.branch.organization,
            branch=appointment.branch, action="PATIENT_APPOINTMENT_VIEWED",
            resource_type="Appointment", resource_id=appointment.pk, request=request,
        )
        return Response({"data": self.serializer_class(appointment).data})


class PatientAppointmentCancelAPIView(PatientAppointmentBaseAPIView):
    serializer_class = PatientAppointmentCancellationSerializer
    throttle_scope = "appointment_booking"

    @extend_schema(
        request=PatientAppointmentCancellationSerializer,
        responses={200: PatientAppointmentSerializer},
    )
    def post(self, request, public_code):
        payload = self.serializer_class(data=request.data)
        payload.is_valid(raise_exception=True)
        appointment = self.appointment(public_code)
        try:
            appointment = AppointmentService.transition_status(
                appointment_id=appointment.pk,
                to_status=Appointment.Status.CANCELLED,
                actor_type=AppointmentStatusHistory.ActorType.PATIENT,
                actor_user=request.user,
                reason=payload.validated_data["reason"],
                request=request,
            )
        except DjangoValidationError as error:
            scheduling_error = SchedulingError(
                "; ".join(error.messages), code="appointment_cancellation_conflict"
            )
            return error_response(scheduling_error, status.HTTP_409_CONFLICT)
        return Response({"data": PatientAppointmentSerializer(appointment).data})


class PatientAppointmentRescheduleAPIView(PatientAppointmentBaseAPIView):
    permission_classes = [IsAuthenticated, IsPatientOnly, IsEmailVerified]
    serializer_class = PatientAppointmentRescheduleSerializer
    throttle_scope = "appointment_booking"

    @extend_schema(
        request=PatientAppointmentRescheduleSerializer,
        responses={200: PatientAppointmentSerializer, 201: PatientAppointmentSerializer},
    )
    def post(self, request, public_code):
        payload = self.serializer_class(data=request.data)
        payload.is_valid(raise_exception=True)
        appointment = self.appointment(public_code)
        try:
            successor, created = RescheduleService.reschedule(
                appointment=appointment,
                actor_user=request.user,
                request=request,
                **payload.validated_data,
            )
        except DjangoValidationError as error:
            scheduling_error = SchedulingError(
                "; ".join(error.messages), code="appointment_reschedule_invalid"
            )
            return error_response(scheduling_error, status.HTTP_400_BAD_REQUEST)
        except ManagementConflict as error:
            message = error.detail.get("message", "Appointment cannot be rescheduled.")
            scheduling_error = SchedulingError(
                str(message), code="appointment_reschedule_conflict"
            )
            return error_response(scheduling_error, status.HTTP_409_CONFLICT)
        return Response(
            {"data": PatientAppointmentSerializer(successor).data},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
