from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from .availability import AvailabilityService
from .models import Appointment


class SlotQuerySerializer(serializers.Serializer):
    branch_service_id = serializers.IntegerField(min_value=1)
    date = serializers.DateField()
    dentist_id = serializers.IntegerField(min_value=1, required=False)

    def validate_date(self, value):
        today = timezone.localdate()
        if value < today:
            raise serializers.ValidationError("Ngày tìm kiếm không được ở quá khứ.")
        if value > today + timedelta(days=AvailabilityService.MAX_BOOKING_ADVANCE_DAYS):
            raise serializers.ValidationError("Chỉ được tìm lịch trong 90 ngày tới.")
        return value


class PatientRescheduleSlotQuerySerializer(serializers.Serializer):
    date = serializers.DateField()

    def validate_date(self, value):
        today = timezone.localdate()
        if value < today:
            raise serializers.ValidationError("Ngày tìm kiếm không được ở quá khứ.")
        if value > today + timedelta(days=AvailabilityService.MAX_BOOKING_ADVANCE_DAYS):
            raise serializers.ValidationError("Chỉ được tìm lịch trong 90 ngày tới.")
        return value


class AppointmentHoldCreateSerializer(serializers.Serializer):
    branch_service_id = serializers.IntegerField(min_value=1)
    starts_at = serializers.DateTimeField()
    dentist_id = serializers.IntegerField(min_value=1, required=False)
    contact_name = serializers.CharField(max_length=200, required=False, allow_blank=False)
    contact_phone = serializers.RegexField(
        regex=r"^\+?[0-9]{9,15}$",
        required=False,
        error_messages={"invalid": "Số điện thoại không hợp lệ."},
    )
    contact_email = serializers.EmailField(required=False)
    patient_note = serializers.CharField(max_length=1000, required=False, allow_blank=True)

    def validate_starts_at(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError("Thời gian đặt lịch phải ở tương lai.")
        return value


class AppointmentSerializer(serializers.ModelSerializer):
    id_branch = serializers.IntegerField(source="branch_id", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    branch_address = serializers.CharField(source="branch.address_line", read_only=True)
    id_branch_service = serializers.IntegerField(
        source="branch_service_id",
        read_only=True,
    )
    id_dentist = serializers.IntegerField(source="dentist_id", read_only=True)
    dentist_name = serializers.CharField(source="dentist.user.full_name", read_only=True)
    id_chair = serializers.IntegerField(source="chair_id", read_only=True)
    chair_name = serializers.CharField(source="chair.name", read_only=True)

    class Meta:
        model = Appointment
        fields = [
            "public_code",
            "status",
            "id_branch",
            "branch_name",
            "branch_address",
            "id_branch_service",
            "id_dentist",
            "dentist_name",
            "id_chair",
            "chair_name",
            "service_name_snapshot",
            "contact_name_snapshot",
            "contact_phone_snapshot",
            "contact_email_snapshot",
            "patient_note",
            "duration_minutes",
            "buffer_minutes",
            "starts_at",
            "ends_at",
            "held_at",
            "expires_at",
            "confirmed_at",
            "created_at",
        ]
        read_only_fields = fields


class PatientAppointmentListQuerySerializer(serializers.Serializer):
    scope = serializers.ChoiceField(choices=["UPCOMING", "HISTORY"], default="UPCOMING")
    status = serializers.ChoiceField(
        choices=[
            Appointment.Status.PENDING,
            Appointment.Status.CONFIRMED,
            Appointment.Status.CHECKED_IN,
            Appointment.Status.IN_PROGRESS,
            Appointment.Status.COMPLETED,
            Appointment.Status.CANCELLED,
            Appointment.Status.NO_SHOW,
        ],
        required=False,
    )
    page = serializers.IntegerField(min_value=1, default=1)
    page_size = serializers.IntegerField(min_value=1, max_value=100, default=20)

    def validate(self, attrs):
        upcoming = {
            Appointment.Status.PENDING,
            Appointment.Status.CONFIRMED,
            Appointment.Status.CHECKED_IN,
            Appointment.Status.IN_PROGRESS,
        }
        history = {
            Appointment.Status.COMPLETED,
            Appointment.Status.CANCELLED,
            Appointment.Status.NO_SHOW,
        }
        allowed = upcoming if attrs["scope"] == "UPCOMING" else history
        if attrs.get("status") and attrs["status"] not in allowed:
            raise serializers.ValidationError(
                {"status": "Status does not belong to the selected appointment group."}
            )
        return attrs


class PatientAppointmentSerializer(serializers.ModelSerializer):
    branch_id = serializers.IntegerField(read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    branch_address = serializers.CharField(source="branch.address_line", read_only=True)
    branch_service_id = serializers.IntegerField(read_only=True)
    dentist_id = serializers.IntegerField(read_only=True)
    dentist_name = serializers.CharField(source="dentist.user.full_name", read_only=True)
    rescheduled_from_code = serializers.CharField(
        source="rescheduled_from.public_code", read_only=True, allow_null=True
    )
    rescheduled_to_code = serializers.CharField(
        source="rescheduled_to.public_code", read_only=True, allow_null=True
    )
    can_cancel = serializers.SerializerMethodField()
    can_reschedule = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = (
            "public_code", "status", "branch_id", "branch_name", "branch_address",
            "branch_service_id", "service_name_snapshot", "service_price_snapshot",
            "contact_name_snapshot", "contact_phone_snapshot", "contact_email_snapshot",
            "patient_note",
            "dentist_id", "dentist_name", "starts_at", "ends_at", "occupied_until",
            "confirmed_at", "checked_in_at", "started_at", "completed_at",
            "cancelled_at", "no_show_at", "cancel_reason", "rescheduled_from_code",
            "rescheduled_to_code", "can_cancel", "can_reschedule", "created_at",
            "updated_at",
        )
        read_only_fields = fields

    @staticmethod
    def _can_change(obj):
        if obj.status not in {Appointment.Status.PENDING, Appointment.Status.CONFIRMED}:
            return False
        cutoff = timedelta(minutes=obj.branch.organization.cancellation_cutoff_minutes)
        return timezone.now() <= obj.starts_at - cutoff

    def get_can_cancel(self, obj) -> bool:
        return self._can_change(obj)

    def get_can_reschedule(self, obj) -> bool:
        return self._can_change(obj)


class PatientAppointmentCancellationSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=1000, allow_blank=False, trim_whitespace=True)


class PatientAppointmentRescheduleSerializer(serializers.Serializer):
    starts_at = serializers.DateTimeField()
    dentist_id = serializers.IntegerField(min_value=1, required=False)
    reason = serializers.CharField(max_length=1000, allow_blank=False, trim_whitespace=True)
    idempotency_key = serializers.RegexField(
        regex=r"^[A-Za-z0-9._:-]+$", min_length=8, max_length=64
    )

