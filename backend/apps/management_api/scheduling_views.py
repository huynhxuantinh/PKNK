from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.access_control.scopes import branch_ids_for, organization_ids_for
from apps.audit.services import AuditService
from apps.organizations.models import Membership
from apps.scheduling.models import Appointment, AppointmentStatusHistory, TimeOff, WorkShift
from apps.scheduling.services import AppointmentService

from .exceptions import ManagementConflict
from .scheduling_serializers import (
    CalendarAppointmentSerializer,
    CalendarQuerySerializer,
    CancellationSerializer,
    RescheduleSerializer,
    TimeOffManagementSerializer,
    WorkShiftManagementSerializer,
)
from .scheduling_services import (
    RescheduleService,
    ensure_dentist_assigned,
    ensure_shift_change_safe,
    ensure_time_off_safe,
)
from .views import BRANCH_MANAGERS, ORG_ADMIN, ManagementAPIView


def django_validation_to_drf(error):
    if hasattr(error, "message_dict"):
        return ValidationError(error.message_dict)
    return ManagementConflict("; ".join(error.messages))


def actor_type_for(user, appointment):
    if organization_ids_for(user, ORG_ADMIN).filter(
        organization_id=appointment.branch.organization_id
    ).exists():
        return AppointmentStatusHistory.ActorType.ORGANIZATION_ADMIN
    return AppointmentStatusHistory.ActorType.BRANCH_ADMIN


def scoped_appointment(user, public_code):
    return get_object_or_404(
        Appointment.objects.select_related(
            "branch__organization", "branch_service__service", "patient_profile__user",
            "dentist__user", "chair", "rescheduled_from",
        ).filter(branch_id__in=branch_ids_for(user, BRANCH_MANAGERS)),
        public_code=public_code,
    )


class BranchWorkShiftListCreateAPIView(ManagementAPIView):
    serializer_class = WorkShiftManagementSerializer

    def get(self, request, branch_id):
        branch = self.branch(branch_id)
        items = WorkShift.objects.filter(branch=branch).select_related("dentist__user")
        return Response({"data": self.serializer_class(items, many=True).data})

    @transaction.atomic
    def post(self, request, branch_id):
        branch = self.branch(branch_id)
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        dentist = serializer.validated_data["dentist"]
        try:
            ensure_dentist_assigned(dentist=dentist, branch=branch)
        except DjangoValidationError as error:
            raise django_validation_to_drf(error)
        shift = serializer.save(branch=branch)
        AuditService.record_write(
            actor_user=request.user, organization=branch.organization, branch=branch,
            action="WORK_SHIFT_CREATED", resource_type="WorkShift", resource_id=shift.pk,
            after_data=serializer.data, request=request,
        )
        return Response({"data": self.serializer_class(shift).data}, status=status.HTTP_201_CREATED)


class WorkShiftDetailAPIView(ManagementAPIView):
    serializer_class = WorkShiftManagementSerializer

    def object(self, shift_id):
        return get_object_or_404(
            WorkShift.objects.select_related("branch__organization", "dentist__user").filter(
                branch_id__in=branch_ids_for(self.request.user, BRANCH_MANAGERS)
            ),
            pk=shift_id,
        )

    @transaction.atomic
    def patch(self, request, shift_id):
        found = self.object(shift_id)
        shift = WorkShift.objects.select_for_update().select_related(
            "branch__organization", "dentist__user"
        ).get(pk=found.pk)
        serializer = self.serializer_class(shift, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        dentist = serializer.validated_data.get("dentist", shift.dentist)
        try:
            ensure_dentist_assigned(dentist=dentist, branch=shift.branch)
            ensure_shift_change_safe(shift=shift, proposed=serializer.validated_data)
        except DjangoValidationError as error:
            raise django_validation_to_drf(error)
        before = self.serializer_class(shift).data
        serializer.save()
        AuditService.record_write(
            actor_user=request.user, organization=shift.branch.organization, branch=shift.branch,
            action="WORK_SHIFT_UPDATED", resource_type="WorkShift", resource_id=shift.pk,
            before_data=before, after_data=serializer.data, request=request,
        )
        return Response({"data": serializer.data})


class BranchTimeOffListCreateAPIView(ManagementAPIView):
    serializer_class = TimeOffManagementSerializer

    def get(self, request, branch_id):
        branch = self.branch(branch_id)
        dentist_ids = Membership.objects.filter(
            organization=branch.organization, branch=branch,
            role=Membership.Role.DENTIST, is_active=True,
        ).values("user__dentist_profile")
        items = TimeOff.objects.filter(
            dentist_id__in=dentist_ids
        ).filter(Q(branch=branch) | Q(branch__isnull=True)).select_related("dentist__user")
        return Response({"data": self.serializer_class(items, many=True).data})

    @transaction.atomic
    def post(self, request, branch_id):
        branch = self.branch(branch_id)
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        dentist = data["dentist"]
        all_branches = data.pop("applies_to_all_branches", False)
        if all_branches and not organization_ids_for(request.user, ORG_ADMIN).filter(
            organization_id=branch.organization_id
        ).exists():
            raise ValidationError({"applies_to_all_branches": "Chỉ Organization Admin được tạo nghỉ toàn chuỗi."})
        try:
            ensure_dentist_assigned(dentist=dentist, branch=branch)
            if data.get("is_active", True):
                ensure_time_off_safe(
                    dentist=dentist, branch=None if all_branches else branch,
                    starts_at=data["starts_at"], ends_at=data["ends_at"],
                )
        except DjangoValidationError as error:
            raise django_validation_to_drf(error)
        item = serializer.save(branch=None if all_branches else branch)
        AuditService.record_write(
            actor_user=request.user, organization=branch.organization,
            branch=None if all_branches else branch, action="TIME_OFF_CREATED",
            resource_type="TimeOff", resource_id=item.pk, after_data=serializer.data,
            request=request,
        )
        return Response({"data": self.serializer_class(item).data}, status=status.HTTP_201_CREATED)


class TimeOffDetailAPIView(ManagementAPIView):
    serializer_class = TimeOffManagementSerializer

    def object(self, time_off_id):
        branch_ids = branch_ids_for(self.request.user, BRANCH_MANAGERS)
        organization_ids = organization_ids_for(self.request.user, ORG_ADMIN)
        return get_object_or_404(
            TimeOff.objects.select_related("branch__organization", "dentist__organization", "dentist__user").filter(
                Q(branch_id__in=branch_ids)
                | Q(branch__isnull=True, dentist__organization_id__in=organization_ids)
            ),
            pk=time_off_id,
        )

    @transaction.atomic
    def patch(self, request, time_off_id):
        found = self.object(time_off_id)
        item = TimeOff.objects.select_for_update().select_related(
            "branch__organization", "dentist__organization", "dentist__user"
        ).get(pk=found.pk)
        serializer = self.serializer_class(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        dentist = data.get("dentist", item.dentist)
        starts_at = data.get("starts_at", item.starts_at)
        ends_at = data.get("ends_at", item.ends_at)
        all_branches = data.pop("applies_to_all_branches", item.branch_id is None)
        organization = item.branch.organization if item.branch_id else item.dentist.organization
        if all_branches and not organization_ids_for(request.user, ORG_ADMIN).filter(
            organization_id=organization.pk
        ).exists():
            raise ValidationError({"applies_to_all_branches": "Chỉ Organization Admin được sửa nghỉ toàn chuỗi."})
        target_branch = None if all_branches else item.branch
        if target_branch is None and not all_branches:
            raise ValidationError("Không thể đổi nghỉ toàn chuỗi thành chi nhánh tại endpoint này.")
        if target_branch:
            try:
                ensure_dentist_assigned(dentist=dentist, branch=target_branch)
            except DjangoValidationError as error:
                raise django_validation_to_drf(error)
        if data.get("is_active", item.is_active):
            ensure_time_off_safe(
                dentist=dentist, branch=target_branch,
                starts_at=starts_at, ends_at=ends_at,
            )
        before = self.serializer_class(item).data
        serializer.save(branch=target_branch)
        AuditService.record_write(
            actor_user=request.user, organization=organization, branch=target_branch,
            action="TIME_OFF_UPDATED", resource_type="TimeOff", resource_id=item.pk,
            before_data=before, after_data=serializer.data, request=request,
        )
        return Response({"data": serializer.data})


class BranchAppointmentCalendarAPIView(ManagementAPIView):
    serializer_class = CalendarAppointmentSerializer
    throttle_scope = "management_scheduling"

    @extend_schema(parameters=[CalendarQuerySerializer], responses={200: CalendarAppointmentSerializer(many=True)})
    def get(self, request, branch_id):
        branch = self.branch(branch_id)
        query = CalendarQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data
        appointments = Appointment.objects.filter(
            branch=branch,
            starts_at__lt=data["date_to"],
            occupied_until__gt=data["date_from"],
        ).select_related("patient_profile__user", "dentist__user", "chair", "rescheduled_from")
        if data.get("status"):
            appointments = appointments.filter(status=data["status"])
        if data.get("dentist_id"):
            appointments = appointments.filter(dentist_id=data["dentist_id"])
        appointments = appointments.order_by("starts_at")
        AuditService.record_read(
            actor_user=request.user, organization=branch.organization, branch=branch,
            action="APPOINTMENT_CALENDAR_VIEWED", resource_type="AppointmentCalendar",
            resource_id=branch.pk, request=request,
        )
        result = self.serializer_class(appointments, many=True).data
        return Response({"data": result, "meta": {"count": len(result)}})


class ManagementAppointmentDetailAPIView(ManagementAPIView):
    serializer_class = CalendarAppointmentSerializer

    def get(self, request, public_code):
        appointment = scoped_appointment(request.user, public_code)
        AuditService.record_read(
            actor_user=request.user, organization=appointment.branch.organization,
            branch=appointment.branch, action="APPOINTMENT_VIEWED",
            resource_type="Appointment", resource_id=appointment.pk, request=request,
        )
        return Response({"data": self.serializer_class(appointment).data})


class AppointmentActionAPIView(ManagementAPIView):
    serializer_class = CalendarAppointmentSerializer
    target_status = None

    @extend_schema(request=None, responses={200: CalendarAppointmentSerializer})
    def post(self, request, public_code):
        appointment = scoped_appointment(request.user, public_code)
        try:
            changed = AppointmentService.transition_status(
                appointment_id=appointment.pk,
                to_status=self.target_status,
                actor_type=actor_type_for(request.user, appointment),
                actor_user=request.user,
                request=request,
            )
        except DjangoValidationError as error:
            raise django_validation_to_drf(error)
        return Response({"data": self.serializer_class(changed).data})


class AppointmentConfirmManagementAPIView(AppointmentActionAPIView):
    target_status = Appointment.Status.CONFIRMED


class AppointmentCheckInAPIView(AppointmentActionAPIView):
    target_status = Appointment.Status.CHECKED_IN


class AppointmentNoShowAPIView(AppointmentActionAPIView):
    target_status = Appointment.Status.NO_SHOW


class AppointmentCancelManagementAPIView(ManagementAPIView):
    serializer_class = CancellationSerializer

    def post(self, request, public_code):
        payload = self.serializer_class(data=request.data)
        payload.is_valid(raise_exception=True)
        appointment = scoped_appointment(request.user, public_code)
        try:
            changed = AppointmentService.transition_status(
                appointment_id=appointment.pk,
                to_status=Appointment.Status.CANCELLED,
                actor_type=actor_type_for(request.user, appointment),
                actor_user=request.user,
                reason=payload.validated_data["reason"],
                request=request,
            )
        except DjangoValidationError as error:
            raise django_validation_to_drf(error)
        return Response({"data": CalendarAppointmentSerializer(changed).data})


class AppointmentRescheduleAPIView(ManagementAPIView):
    serializer_class = RescheduleSerializer

    def post(self, request, public_code):
        payload = self.serializer_class(data=request.data)
        payload.is_valid(raise_exception=True)
        appointment = scoped_appointment(request.user, public_code)
        try:
            successor, created = RescheduleService.reschedule(
                appointment=appointment,
                actor_user=request.user,
                request=request,
                **payload.validated_data,
            )
        except DjangoValidationError as error:
            raise django_validation_to_drf(error)
        return Response(
            {"data": CalendarAppointmentSerializer(successor).data},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
