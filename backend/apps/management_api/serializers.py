from django.contrib.gis.geos import Point
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import Dentist, User
from apps.catalog.models import BranchService, Service
from apps.locations.models import Branch, BranchOpeningHour, Chair, Holiday, Province, Ward
from apps.organizations.models import Membership, Organization, StaffInvitation
from apps.organizations.services import (
    BranchAdminConflict,
    StaffRoleConflict,
    validate_branch_admin_scope,
    validate_staff_role_separation,
)

from .exceptions import ManagementConflict


class OrganizationManagementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = (
            "id_organization", "name", "slug", "timezone", "auto_confirm",
            "slot_hold_minutes", "cancellation_cutoff_minutes",
            "no_show_grace_minutes", "is_active", "created_at", "updated_at",
        )
        read_only_fields = ("id_organization", "slug", "created_at", "updated_at")


class BranchManagementSerializer(serializers.ModelSerializer):
    province_code = serializers.SlugRelatedField(
        source="province", slug_field="code", queryset=Province.objects.all()
    )
    ward_code = serializers.SlugRelatedField(
        source="ward", slug_field="code", queryset=Ward.objects.select_related("province")
    )
    latitude = serializers.FloatField(write_only=True, min_value=-90, max_value=90)
    longitude = serializers.FloatField(write_only=True, min_value=-180, max_value=180)
    location = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = (
            "id_branch", "organization_id", "code", "name", "phone", "email",
            "province_code", "ward_code", "address_line", "latitude", "longitude",
            "location", "is_active", "created_at", "updated_at",
        )
        read_only_fields = ("id_branch", "organization_id", "created_at", "updated_at")

    def get_location(self, obj) -> dict[str, float]:
        return {"latitude": obj.location.y, "longitude": obj.location.x}

    def validate(self, attrs):
        has_latitude = "latitude" in attrs
        has_longitude = "longitude" in attrs
        if has_latitude != has_longitude:
            raise serializers.ValidationError("latitude và longitude phải được gửi cùng nhau.")
        province = attrs.get("province", getattr(self.instance, "province", None))
        ward = attrs.get("ward", getattr(self.instance, "ward", None))
        if ward and province and ward.province_id != province.pk:
            raise serializers.ValidationError({"ward_code": "Phường/xã không thuộc tỉnh/thành đã chọn."})
        return attrs

    def create(self, validated_data):
        latitude = validated_data.pop("latitude")
        longitude = validated_data.pop("longitude")
        return Branch.objects.create(location=Point(longitude, latitude, srid=4326), **validated_data)

    def update(self, instance, validated_data):
        latitude = validated_data.pop("latitude", None)
        longitude = validated_data.pop("longitude", None)
        if (latitude is None) != (longitude is None):
            raise serializers.ValidationError("latitude và longitude phải được gửi cùng nhau.")
        if latitude is not None:
            validated_data["location"] = Point(longitude, latitude, srid=4326)
        return super().update(instance, validated_data)


class OpeningHourManagementSerializer(serializers.ModelSerializer):
    class Meta:
        model = BranchOpeningHour
        fields = ("weekday", "is_closed", "open_time", "close_time")

    def validate(self, attrs):
        closed = attrs.get("is_closed", False)
        open_time = attrs.get("open_time")
        close_time = attrs.get("close_time")
        if closed and (open_time is not None or close_time is not None):
            raise serializers.ValidationError("Ngày đóng cửa không có giờ mở/đóng cửa.")
        if not closed and (open_time is None or close_time is None or open_time >= close_time):
            raise serializers.ValidationError("Giờ mở cửa phải nhỏ hơn giờ đóng cửa.")
        return attrs


class OpeningHoursReplaceSerializer(serializers.Serializer):
    opening_hours = OpeningHourManagementSerializer(many=True)

    def validate_opening_hours(self, value):
        weekdays = [item["weekday"] for item in value]
        if sorted(weekdays) != list(range(1, 8)):
            raise serializers.ValidationError("Phải gửi đủ đúng 7 ngày, từ 1 đến 7.")
        return value


class HolidayManagementSerializer(serializers.ModelSerializer):
    branch_id = serializers.PrimaryKeyRelatedField(
        source="branch", queryset=Branch.objects.all(), allow_null=True, required=False
    )

    class Meta:
        model = Holiday
        fields = ("id_holiday", "organization_id", "branch_id", "holiday_date", "name", "is_closed")
        read_only_fields = ("id_holiday", "organization_id")


class ChairManagementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chair
        fields = ("id_chair", "branch_id", "code", "name", "resource_type", "is_active")
        read_only_fields = ("id_chair", "branch_id")


class ServiceManagementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = (
            "id_service", "organization_id", "code", "name", "description",
            "standard_duration_minutes", "buffer_minutes", "standard_price",
            "is_active", "created_at", "updated_at",
        )
        read_only_fields = ("id_service", "organization_id", "created_at", "updated_at")


class BranchServiceManagementSerializer(serializers.ModelSerializer):
    service_id = serializers.PrimaryKeyRelatedField(source="service", queryset=Service.objects.all())
    service_name = serializers.CharField(source="service.name", read_only=True)

    class Meta:
        model = BranchService
        fields = (
            "id_branch_service", "branch_id", "service_id", "service_name", "price",
            "duration_minutes", "buffer_minutes", "is_active",
        )
        read_only_fields = ("id_branch_service", "branch_id")


class MembershipManagementSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_full_name = serializers.CharField(source="user.full_name", read_only=True)
    branch_id = serializers.PrimaryKeyRelatedField(
        source="branch", queryset=Branch.objects.all(), allow_null=True, required=False
    )

    class Meta:
        model = Membership
        fields = (
            "id_membership", "user_id", "user_email", "user_full_name",
            "organization_id", "branch_id", "role", "is_active", "created_at",
        )
        read_only_fields = (
            "id_membership", "user_id", "organization_id", "user_email",
            "user_full_name", "created_at",
        )

    def validate_role(self, value):
        if value not in {
            Membership.Role.ORGANIZATION_ADMIN,
            Membership.Role.BRANCH_ADMIN,
        }:
            raise serializers.ValidationError("Endpoint này chỉ quản lý Admin membership.")
        return value


class MembershipCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=[Membership.Role.ORGANIZATION_ADMIN, Membership.Role.BRANCH_ADMIN]
    )
    branch_id = serializers.PrimaryKeyRelatedField(
        source="branch", queryset=Branch.objects.all(), allow_null=True, required=False
    )

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, attrs):
        role = attrs["role"]
        branch = attrs.get("branch")
        if role == Membership.Role.ORGANIZATION_ADMIN and branch is not None:
            raise serializers.ValidationError({"branch_id": "Organization Admin không gắn chi nhánh."})
        if role == Membership.Role.BRANCH_ADMIN and branch is None:
            raise serializers.ValidationError({"branch_id": "Branch Admin phải gắn chi nhánh."})
        if branch is not None and not branch.is_active:
            raise serializers.ValidationError({"branch_id": "Chi nhánh đã ngưng hoạt động."})
        email = attrs["email"]
        try:
            if role == Membership.Role.BRANCH_ADMIN:
                validate_branch_admin_scope(branch=branch, email=email)
            validate_staff_role_separation(role=role, email=email)
        except (BranchAdminConflict, StaffRoleConflict) as error:
            raise ManagementConflict(str(error)) from error
        return attrs


class DentistManagementSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = Dentist
        fields = (
            "id_dentist", "user_id", "user_email", "full_name", "organization_id",
            "license_number", "biography", "is_active", "created_at", "updated_at",
        )
        read_only_fields = (
            "id_dentist", "user_id", "user_email", "full_name", "organization_id",
            "created_at", "updated_at",
        )


class DentistCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    license_number = serializers.CharField(max_length=100, allow_null=True, required=False)
    biography = serializers.CharField(allow_blank=True, allow_null=True, required=False)

    def validate_email(self, value):
        try:
            user = User.objects.get(email__iexact=value.strip())
        except User.DoesNotExist as error:
            raise serializers.ValidationError("Tài khoản phải đăng ký trước khi tạo hồ sơ nha sĩ.") from error
        if not user.is_active or user.email_verified_at is None:
            raise serializers.ValidationError("Tài khoản phải hoạt động và đã xác minh email.")
        if hasattr(user, "dentist_profile"):
            raise serializers.ValidationError("Tài khoản đã có hồ sơ nha sĩ.")
        return user


class IdListSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), allow_empty=True
    )

    def validate_ids(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Danh sách ID không được trùng.")
        return value


class StaffInvitationAcceptSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=200, trim_whitespace=False)


class StaffInvitationPreviewSerializer(serializers.Serializer):
    email = serializers.EmailField(read_only=True)
    organization_name = serializers.CharField(read_only=True)
    branch_name = serializers.CharField(read_only=True, allow_null=True)
    role = serializers.ChoiceField(choices=Membership.Role.choices, read_only=True)
    invited_by_name = serializers.CharField(read_only=True)
    expires_at = serializers.DateTimeField(read_only=True)
    has_account = serializers.BooleanField(read_only=True)


class StaffInvitationAcceptNewSerializer(StaffInvitationAcceptSerializer):
    full_name = serializers.CharField(max_length=200)
    phone = serializers.RegexField(
        regex=r"^\+?[0-9]{9,15}$",
        max_length=16,
        error_messages={"invalid": "Số điện thoại không hợp lệ."},
    )
    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        min_length=8,
        max_length=128,
    )


class StaffInvitationManagementSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    invited_by_email = serializers.EmailField(source="invited_by.email", read_only=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = StaffInvitation
        fields = (
            "id_staff_invitation",
            "email",
            "role",
            "branch_id",
            "branch_name",
            "status",
            "email_delivery_status",
            "email_sent_at",
            "email_failed_at",
            "expires_at",
            "created_at",
            "invited_by_email",
        )
        read_only_fields = fields

    def get_status(self, obj):
        if obj.accepted_at is not None:
            return "ACCEPTED"
        if obj.revoked_at is not None:
            return "REVOKED"
        if obj.expires_at <= timezone.now():
            return "EXPIRED"
        return "PENDING"
