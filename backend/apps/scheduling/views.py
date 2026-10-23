from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.urls import reverse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import Dentist
from apps.accounts.permissions import IsEmailVerified
from apps.catalog.models import BranchService

from .availability import AvailabilityService
from .booking import BookingService
from .exceptions import BookingValidationError, SchedulingError, SlotUnavailableError
from .models import Appointment, AppointmentStatusHistory
from .serializers import (
    AppointmentHoldCreateSerializer,
    AppointmentSerializer,
    SlotQuerySerializer,
)
from .services import AppointmentService


def error_response(error, http_status):
    return Response(
        {"error": {"code": error.code, "message": error.message}},
        status=http_status,
    )


class SlotListAPIView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "slot_search"

    @extend_schema(
        parameters=[
            OpenApiParameter("branch_service_id", int, required=True),
            OpenApiParameter("date", str, required=True),
            OpenApiParameter("dentist_id", int, required=False),
        ],
        responses={200: dict},
    )
    def get(self, request):
        query = SlotQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data

        branch_service = get_object_or_404(
            BranchService.objects.select_related(
                "branch__organization",
                "service",
            ),
            pk=data["branch_service_id"],
            is_active=True,
            branch__is_active=True,
            service__is_active=True,
        )
        dentist = None
        if data.get("dentist_id"):
            dentist = get_object_or_404(
                Dentist,
                pk=data["dentist_id"],
                is_active=True,
            )

        options = AvailabilityService.list_slots(
            branch_service=branch_service,
            target_date=data["date"],
            dentist=dentist,
        )
        response_data = [
            {
                "starts_at": option.starts_at.isoformat(),
                "ends_at": option.ends_at.isoformat(),
                "available_dentist_ids": list(option.dentist_ids),
                "available_dentist_count": len(option.dentist_ids),
                "available_chair_count": len(option.chair_ids),
            }
            for option in options
        ]
        return Response(
            {
                "data": response_data,
                "meta": {
                    "date": data["date"].isoformat(),
                    "slot_step_minutes": AvailabilityService.SLOT_STEP_MINUTES,
                    "count": len(response_data),
                },
            }
        )


class AppointmentHoldCreateAPIView(APIView):
    permission_classes = [IsAuthenticated, IsEmailVerified]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "appointment_booking"

    @extend_schema(
        request=AppointmentHoldCreateSerializer,
        responses={201: AppointmentSerializer},
    )
    def post(self, request):
        serializer = AppointmentHoldCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        branch_service = get_object_or_404(
            BranchService.objects.select_related(
                "branch__organization",
                "service",
            ),
            pk=data["branch_service_id"],
            is_active=True,
            branch__is_active=True,
            service__is_active=True,
        )
        requested_dentist = None
        if data.get("dentist_id"):
            requested_dentist = get_object_or_404(
                Dentist,
                pk=data["dentist_id"],
                is_active=True,
            )

        try:
            appointment = BookingService.create_hold(
                patient_user=request.user,
                branch_service=branch_service,
                starts_at=data["starts_at"],
                requested_dentist=requested_dentist,
                contact_name=data.get("contact_name"),
                contact_phone=data.get("contact_phone"),
                contact_email=data.get("contact_email"),
                patient_note=data.get("patient_note", ""),
                request=request,
            )
        except SlotUnavailableError as error:
            return error_response(error, status.HTTP_409_CONFLICT)
        except BookingValidationError as error:
            return error_response(error, status.HTTP_400_BAD_REQUEST)

        response_serializer = AppointmentSerializer(appointment)
        location = reverse(
            "scheduling:appointment-confirm",
            kwargs={"public_code": appointment.public_code},
        )
        return Response(
            {"data": response_serializer.data},
            status=status.HTTP_201_CREATED,
            headers={"Location": location},
        )


class AppointmentConfirmAPIView(APIView):
    permission_classes = [IsAuthenticated, IsEmailVerified]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "appointment_booking"

    @extend_schema(request=None, responses={200: AppointmentSerializer})
    def post(self, request, public_code):
        appointment = get_object_or_404(
            Appointment.objects.select_related("patient_profile__user"),
            public_code=public_code,
            patient_profile__user=request.user,
        )
        try:
            appointment = AppointmentService.confirm_hold(
                appointment_id=appointment.id_appointment,
                patient_user=request.user,
                request=request,
            )
        except DjangoValidationError as error:
            scheduling_error = SchedulingError(
                "; ".join(error.messages),
                code="invalid_status_transition",
            )
            return error_response(scheduling_error, status.HTTP_409_CONFLICT)

        return Response({"data": AppointmentSerializer(appointment).data})


class AppointmentHoldCancelAPIView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "appointment_booking"

    @extend_schema(request=None, responses={200: AppointmentSerializer})
    def post(self, request, public_code):
        appointment = get_object_or_404(
            Appointment.objects.select_related("patient_profile__user"),
            public_code=public_code,
            patient_profile__user=request.user,
            status=Appointment.Status.HELD,
        )
        try:
            appointment = AppointmentService.transition_status(
                appointment_id=appointment.id_appointment,
                to_status=Appointment.Status.CANCELLED,
                actor_type=AppointmentStatusHistory.ActorType.PATIENT,
                actor_user=request.user,
                reason="Người bệnh bỏ giữ chỗ.",
                request=request,
            )
        except DjangoValidationError as error:
            scheduling_error = SchedulingError(
                "; ".join(error.messages), code="hold_cancellation_conflict"
            )
            return error_response(scheduling_error, status.HTTP_409_CONFLICT)
        return Response({"data": AppointmentSerializer(appointment).data})

