from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts.models import Dentist
from apps.catalog.models import BranchService

from .models import Branch, BranchImage, BranchOpeningHour, Province, Ward


class ProvinceOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Province
        fields = ("code", "full_name")


class WardOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ward
        fields = ("code", "full_name")


WEEKDAY_LABELS = {
    1: "Thứ hai",
    2: "Thứ ba",
    3: "Thứ tư",
    4: "Thứ năm",
    5: "Thứ sáu",
    6: "Thứ bảy",
    7: "Chủ nhật",
}


class BranchOpeningHourSerializer(serializers.ModelSerializer):
    weekday_label = serializers.SerializerMethodField()

    class Meta:
        model = BranchOpeningHour
        fields = (
            "weekday",
            "weekday_label",
            "is_closed",
            "open_time",
            "close_time",
        )

    def get_weekday_label(self, obj) -> str:
        return WEEKDAY_LABELS[obj.weekday]


class BranchImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = BranchImage
        fields = (
            "id_branch_image",
            "storage_key",
            "original_name",
            "mime_type",
            "is_primary",
            "sort_order",
        )


class BranchServiceSerializer(serializers.ModelSerializer):
    id_service = serializers.IntegerField(source="service_id", read_only=True)
    code = serializers.CharField(source="service.code", read_only=True)
    name = serializers.CharField(source="service.name", read_only=True)
    description = serializers.CharField(
        source="service.description",
        read_only=True,
        allow_null=True,
    )
    duration_minutes = serializers.SerializerMethodField()
    buffer_minutes = serializers.SerializerMethodField()

    class Meta:
        model = BranchService
        fields = (
            "id_branch_service",
            "id_service",
            "code",
            "name",
            "description",
            "price",
            "duration_minutes",
            "buffer_minutes",
        )

    def get_duration_minutes(self, obj) -> int:
        if obj.duration_minutes is not None:
            return obj.duration_minutes
        return obj.service.standard_duration_minutes

    def get_buffer_minutes(self, obj) -> int:
        if obj.buffer_minutes is not None:
            return obj.buffer_minutes
        return obj.service.buffer_minutes


class BranchDentistSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = Dentist
        fields = (
            "id_dentist",
            "full_name",
            "license_number",
            "biography",
        )


class BranchLocationSerializer(serializers.Serializer):
    latitude = serializers.FloatField(read_only=True)
    longitude = serializers.FloatField(read_only=True)


class BranchDetailSerializer(serializers.ModelSerializer):
    id_organization = serializers.IntegerField(
        source="organization_id",
        read_only=True,
    )
    organization_name = serializers.CharField(
        source="organization.name",
        read_only=True,
    )
    province_code = serializers.CharField(source="province_id", read_only=True)
    province_name = serializers.CharField(source="province.full_name", read_only=True)
    ward_code = serializers.CharField(source="ward_id", read_only=True)
    ward_name = serializers.CharField(source="ward.full_name", read_only=True)
    full_address = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    opening_hours = BranchOpeningHourSerializer(many=True, read_only=True)
    images = BranchImageSerializer(many=True, read_only=True)
    services = BranchServiceSerializer(
        source="active_branch_services",
        many=True,
        read_only=True,
    )
    dentists = BranchDentistSerializer(
        source="api_dentists",
        many=True,
        read_only=True,
    )

    class Meta:
        model = Branch
        fields = (
            "id_branch",
            "id_organization",
            "organization_name",
            "code",
            "name",
            "phone",
            "email",
            "province_code",
            "province_name",
            "ward_code",
            "ward_name",
            "address_line",
            "full_address",
            "location",
            "opening_hours",
            "images",
            "services",
            "dentists",
        )

    def get_full_address(self, obj) -> str:
        return ", ".join(
            [obj.address_line, obj.ward.full_name, obj.province.full_name]
        )

    @extend_schema_field(BranchLocationSerializer)
    def get_location(self, obj) -> dict[str, float]:
        return {
            "latitude": obj.location.y,
            "longitude": obj.location.x,
        }


class BranchDetailResponseSerializer(serializers.Serializer):
    data = BranchDetailSerializer(read_only=True)


class BranchListQuerySerializer(serializers.Serializer):
    q = serializers.CharField(required=False, max_length=200)
    province_code = serializers.CharField(required=False, max_length=20)
    ward_code = serializers.CharField(required=False, max_length=20)
    service_id = serializers.IntegerField(required=False, min_value=1)
    dentist_id = serializers.IntegerField(required=False, min_value=1)
    open_now = serializers.BooleanField(required=False)
    latitude = serializers.FloatField(required=False, min_value=-90, max_value=90)
    longitude = serializers.FloatField(required=False, min_value=-180, max_value=180)
    radius_km = serializers.FloatField(required=False, min_value=0.1, max_value=100)
    page = serializers.IntegerField(required=False, min_value=1)
    page_size = serializers.IntegerField(required=False, min_value=1, max_value=100)

    def validate(self, attrs):
        has_latitude = "latitude" in attrs
        has_longitude = "longitude" in attrs
        if has_latitude != has_longitude:
            raise serializers.ValidationError(
                "latitude và longitude phải được truyền cùng nhau."
            )
        if "radius_km" in attrs and not (has_latitude and has_longitude):
            raise serializers.ValidationError(
                {"radius_km": "Cần latitude và longitude để lọc theo bán kính."}
            )
        return attrs


class BranchListItemSerializer(serializers.ModelSerializer):
    province_code = serializers.CharField(source="province_id", read_only=True)
    province_name = serializers.CharField(source="province.full_name", read_only=True)
    ward_code = serializers.CharField(source="ward_id", read_only=True)
    ward_name = serializers.CharField(source="ward.full_name", read_only=True)
    full_address = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    distance_km = serializers.SerializerMethodField()
    is_open_now = serializers.SerializerMethodField()
    primary_image = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = (
            "id_branch",
            "code",
            "name",
            "phone",
            "province_code",
            "province_name",
            "ward_code",
            "ward_name",
            "address_line",
            "full_address",
            "location",
            "distance_km",
            "is_open_now",
            "primary_image",
        )

    def get_full_address(self, obj) -> str:
        return ", ".join(
            [obj.address_line, obj.ward.full_name, obj.province.full_name]
        )

    @extend_schema_field(BranchLocationSerializer)
    def get_location(self, obj) -> dict[str, float]:
        return {"latitude": obj.location.y, "longitude": obj.location.x}

    @extend_schema_field(serializers.FloatField(allow_null=True))
    def get_distance_km(self, obj) -> float | None:
        distance = getattr(obj, "distance", None)
        return round(distance.km, 2) if distance is not None else None

    def get_is_open_now(self, obj) -> bool:
        return bool(obj.api_has_open_hour and not obj.api_has_closed_holiday)

    @extend_schema_field(BranchImageSerializer(allow_null=True))
    def get_primary_image(self, obj) -> dict | None:
        images = getattr(obj, "api_primary_images", [])
        if not images:
            return None
        return BranchImageSerializer(images[0]).data


class BranchListMetaSerializer(serializers.Serializer):
    total = serializers.IntegerField(read_only=True)
    page = serializers.IntegerField(read_only=True)
    page_size = serializers.IntegerField(read_only=True)
    total_pages = serializers.IntegerField(read_only=True)


class BranchListLinksSerializer(serializers.Serializer):
    next = serializers.URLField(read_only=True, allow_null=True)
    previous = serializers.URLField(read_only=True, allow_null=True)


class BranchListResponseSerializer(serializers.Serializer):
    data = BranchListItemSerializer(many=True, read_only=True)
    meta = BranchListMetaSerializer(read_only=True)
    links = BranchListLinksSerializer(read_only=True)


class BranchServicesQuerySerializer(serializers.Serializer):
    q = serializers.CharField(required=False, max_length=200)
    page = serializers.IntegerField(required=False, min_value=1)
    page_size = serializers.IntegerField(required=False, min_value=1, max_value=100)


class BranchServicesResponseSerializer(serializers.Serializer):
    data = BranchServiceSerializer(many=True, read_only=True)
    meta = BranchListMetaSerializer(read_only=True)
    links = BranchListLinksSerializer(read_only=True)


class BranchDentistsQuerySerializer(serializers.Serializer):
    service_id = serializers.IntegerField(min_value=1)
    q = serializers.CharField(required=False, max_length=200)
    page = serializers.IntegerField(required=False, min_value=1)
    page_size = serializers.IntegerField(required=False, min_value=1, max_value=100)


class BranchDentistsResponseSerializer(serializers.Serializer):
    data = BranchDentistSerializer(many=True, read_only=True)
    meta = BranchListMetaSerializer(read_only=True)
    links = BranchListLinksSerializer(read_only=True)
