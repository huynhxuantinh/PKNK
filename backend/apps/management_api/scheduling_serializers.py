from datetime import timedelta

from rest_framework import serializers

from apps.accounts.models import Dentist
from apps.scheduling.models import Appointment, TimeOff, WorkShift


class WorkShiftManagementSerializer(serializers.ModelSerializer):
    dentist_id = serializers.PrimaryKeyRelatedField(
        source="dentist", queryset=Dentist.objects.select_related("organization", "user")
    )

    class Meta:
        model = WorkShift
        fields = (
            "id_work_shift", "branch_id", "dentist_id", "weekday",
            "start_time", "end_time", "valid_from", "valid_to", "is_active",
        )
        read_only_fields = ("id_work_shift", "branch_id")

    def validate(self, attrs):
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        valid_from = attrs.get("valid_from", getattr(self.instance, "valid_from", None))
        valid_to = attrs.get("valid_to", getattr(self.instance, "valid_to", None))
        if start and end and start >= end:
            raise serializers.ValidationError({"end_time": "Giờ kết thúc phải sau giờ bắt đầu."})
        if valid_from and valid_to and valid_to < valid_from:
            raise serializers.ValidationError({"valid_to": "Ngày kết thúc không hợp lệ."})
        return attrs


class TimeOffManagementSerializer(serializers.ModelSerializer):
    dentist_id = serializers.PrimaryKeyRelatedField(
        source="dentist", queryset=Dentist.objects.select_related("organization", "user")
    )
    applies_to_all_branches = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = TimeOff
        fields = (
            "id_time_off", "branch_id", "dentist_id", "starts_at", "ends_at",
            "reason", "is_active", "applies_to_all_branches",
        )
        read_only_fields = ("id_time_off", "branch_id")

    def validate(self, attrs):
        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts_at and ends_at and starts_at >= ends_at:
            raise serializers.ValidationError({"ends_at": "Thời gian kết thúc phải sau bắt đầu."})
        return attrs


class CalendarQuerySerializer(serializers.Serializer):
    date_from = serializers.DateTimeField()
    date_to = serializers.DateTimeField()
    status = serializers.ChoiceField(choices=Appointment.Status.choices, required=False)
    dentist_id = serializers.IntegerField(min_value=1, required=False)

    def validate(self, attrs):
        if attrs["date_from"] >= attrs["date_to"]:
            raise serializers.ValidationError("date_to phải sau date_from.")
        if attrs["date_to"] - attrs["date_from"] > timedelta(days=31):
            raise serializers.ValidationError("Khoảng xem lịch tối đa 31 ngày.")
        return attrs


class RescheduleSlotQuerySerializer(serializers.Serializer):
    date = serializers.DateField()
    dentist_id = serializers.IntegerField(min_value=1, required=False)


class CalendarAppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient_profile.user.full_name", read_only=True)
    patient_phone = serializers.CharField(source="patient_profile.user.phone", read_only=True)
    dentist_name = serializers.CharField(source="dentist.user.full_name", read_only=True)
    chair_name = serializers.CharField(source="chair.name", read_only=True)
    rescheduled_from_code = serializers.CharField(
        source="rescheduled_from.public_code", read_only=True, allow_null=True
    )

    class Meta:
        model = Appointment
        fields = (
            "public_code", "branch_id", "branch_service_id", "service_name_snapshot",
            "patient_name", "patient_phone", "contact_name_snapshot",
            "contact_phone_snapshot", "contact_email_snapshot", "patient_note",
            "dentist_id", "dentist_name",
            "chair_id", "chair_name", "starts_at", "ends_at", "occupied_until",
            "status", "confirmed_at", "checked_in_at", "cancelled_at", "no_show_at",
            "cancel_reason", "rescheduled_from_code", "created_at", "updated_at",
        )


class CancellationSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=1000, allow_blank=False, trim_whitespace=True)


class RescheduleSerializer(serializers.Serializer):
    starts_at = serializers.DateTimeField()
    dentist_id = serializers.IntegerField(min_value=1, required=False)
    reason = serializers.CharField(max_length=1000, allow_blank=False, trim_whitespace=True)
    idempotency_key = serializers.RegexField(
        regex=r"^[A-Za-z0-9._:-]+$", min_length=8, max_length=64
    )
