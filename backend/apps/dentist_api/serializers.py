from datetime import timedelta

from rest_framework import serializers

from apps.scheduling.models import Appointment


class DentistScheduleQuerySerializer(serializers.Serializer):
    date_from = serializers.DateTimeField()
    date_to = serializers.DateTimeField()
    status = serializers.ChoiceField(
        choices=Appointment.Status.choices,
        required=False,
    )

    def validate(self, attrs):
        if attrs["date_from"] >= attrs["date_to"]:
            raise serializers.ValidationError("date_to phải sau date_from.")
        if attrs["date_to"] - attrs["date_from"] > timedelta(days=31):
            raise serializers.ValidationError("Khoảng xem lịch tối đa 31 ngày.")
        return attrs


class DentistAppointmentSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    chair_name = serializers.CharField(source="chair.name", read_only=True)
    patient_name = serializers.CharField(
        source="patient_profile.user.full_name",
        read_only=True,
    )
    patient_phone = serializers.CharField(
        source="patient_profile.phone",
        read_only=True,
    )
    contact_name_snapshot = serializers.CharField(read_only=True, allow_null=True)
    contact_phone_snapshot = serializers.CharField(read_only=True, allow_null=True)
    contact_email_snapshot = serializers.EmailField(read_only=True, allow_null=True)
    patient_note = serializers.CharField(read_only=True)

    class Meta:
        model = Appointment
        fields = (
            "public_code",
            "patient_profile_id",
            "branch_id",
            "branch_name",
            "branch_service_id",
            "service_name_snapshot",
            "chair_id",
            "chair_name",
            "patient_name",
            "patient_phone",
            "contact_name_snapshot",
            "contact_phone_snapshot",
            "contact_email_snapshot",
            "patient_note",
            "starts_at",
            "ends_at",
            "status",
            "confirmed_at",
            "checked_in_at",
            "started_at",
        )


class PatientSummaryQuerySerializer(serializers.Serializer):
    appointment_code = serializers.CharField(max_length=30)

