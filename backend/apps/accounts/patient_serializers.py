from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.locations.models import Province, Ward

from .models import PatientProfile


class PatientProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    email_verified = serializers.SerializerMethodField()
    full_name = serializers.CharField(source="user.full_name", max_length=200)
    province_code = serializers.SlugRelatedField(
        source="province",
        slug_field="code",
        queryset=Province.objects.all(),
        allow_null=True,
        required=False,
    )
    province_name = serializers.CharField(source="province.full_name", read_only=True)
    ward_code = serializers.SlugRelatedField(
        source="ward",
        slug_field="code",
        queryset=Ward.objects.select_related("province"),
        allow_null=True,
        required=False,
    )
    ward_name = serializers.CharField(source="ward.full_name", read_only=True)

    class Meta:
        model = PatientProfile
        fields = (
            "email",
            "email_verified",
            "full_name",
            "date_of_birth",
            "gender",
            "phone",
            "province_code",
            "province_name",
            "ward_code",
            "ward_name",
            "address_line",
            "updated_at",
        )
        read_only_fields = ("updated_at",)

    def get_email_verified(self, obj) -> bool:
        return obj.user.email_verified_at is not None

    def validate_date_of_birth(self, value):
        if value and value > timezone.localdate():
            raise serializers.ValidationError("Ngày sinh không được ở tương lai.")
        return value

    def validate(self, attrs):
        province = attrs.get("province", self.instance.province)
        ward = attrs.get("ward", self.instance.ward)
        if ward is not None and (province is None or ward.province_id != province.pk):
            raise serializers.ValidationError(
                {"ward_code": "Phường/xã không thuộc tỉnh/thành đã chọn."}
            )
        return attrs

    @transaction.atomic
    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        if "full_name" in user_data:
            instance.user.full_name = user_data["full_name"]
            instance.user.save(update_fields=["full_name"])

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance


class PatientProfileResponseSerializer(serializers.Serializer):
    data = PatientProfileSerializer(read_only=True)
