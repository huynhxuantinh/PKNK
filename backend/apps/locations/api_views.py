from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.db.models import Exists, F, OuterRef, Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import Dentist
from apps.catalog.models import BranchService
from apps.organizations.models import Membership

from .models import Branch, BranchImage, BranchOpeningHour, Holiday, Province, Ward
from .pagination import BranchPagination
from .serializers import (
    BranchDetailResponseSerializer,
    BranchDetailSerializer,
    BranchDentistSerializer,
    BranchDentistsQuerySerializer,
    BranchDentistsResponseSerializer,
    BranchListItemSerializer,
    BranchListQuerySerializer,
    BranchListResponseSerializer,
    BranchServiceSerializer,
    BranchServicesQuerySerializer,
    BranchServicesResponseSerializer,
    ProvinceOptionSerializer,
    WardOptionSerializer,
)


class ProvinceListAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        provinces = Province.objects.all().order_by("name")
        return Response({"data": ProvinceOptionSerializer(provinces, many=True).data})


class WardListAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        province_code = request.query_params.get("province_code", "").strip()
        wards = Ward.objects.none()
        if province_code:
            wards = Ward.objects.filter(province_id=province_code).order_by("name")
        return Response({"data": WardOptionSerializer(wards, many=True).data})


class BranchListAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "branch_list"
    pagination_class = BranchPagination

    @extend_schema(
        operation_id="branch_list",
        parameters=[BranchListQuerySerializer],
        responses={200: BranchListResponseSerializer},
    )
    def get(self, request):
        query_serializer = BranchListQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        filters = query_serializer.validated_data

        local_now = timezone.localtime(timezone.now())
        open_hours = BranchOpeningHour.objects.filter(
            branch_id=OuterRef("pk"),
            weekday=local_now.isoweekday(),
            is_closed=False,
            open_time__lte=local_now.time(),
            close_time__gt=local_now.time(),
        )
        closed_holidays = Holiday.objects.filter(
            organization_id=OuterRef("organization_id"),
            holiday_date=local_now.date(),
            is_closed=True,
        ).filter(Q(branch_id=OuterRef("pk")) | Q(branch__isnull=True))

        queryset = (
            Branch.objects.filter(is_active=True, organization__is_active=True)
            .select_related("province", "ward")
            .annotate(
                api_has_open_hour=Exists(open_hours),
                api_has_closed_holiday=Exists(closed_holidays),
            )
            .prefetch_related(
                Prefetch(
                    "images",
                    queryset=BranchImage.objects.filter(is_primary=True),
                    to_attr="api_primary_images",
                )
            )
        )

        if text_query := filters.get("q"):
            queryset = queryset.filter(
                Q(name__icontains=text_query)
                | Q(code__icontains=text_query)
                | Q(address_line__icontains=text_query)
                | Q(province__full_name__icontains=text_query)
                | Q(ward__full_name__icontains=text_query)
            )
        if province_code := filters.get("province_code"):
            queryset = queryset.filter(province_id=province_code)
        if ward_code := filters.get("ward_code"):
            queryset = queryset.filter(ward_id=ward_code)
        if service_id := filters.get("service_id"):
            queryset = queryset.filter(
                branch_services__service_id=service_id,
                branch_services__is_active=True,
                branch_services__service__is_active=True,
            )
        if dentist_id := filters.get("dentist_id"):
            queryset = queryset.filter(
                memberships__user__dentist_profile__id_dentist=dentist_id,
                memberships__user__dentist_profile__is_active=True,
                memberships__user__dentist_profile__organization=F("organization"),
                memberships__user__is_active=True,
                memberships__organization=F("organization"),
                memberships__role=Membership.Role.DENTIST,
                memberships__is_active=True,
            )
            if service_id := filters.get("service_id"):
                queryset = queryset.filter(
                    memberships__user__dentist_profile__dentist_services__service_id=(
                        service_id
                    )
                )
        # DRF treats an omitted checkbox-style boolean in QueryDict as False.
        # Only filter by opening status when the client explicitly sends it.
        if "open_now" in request.query_params:
            if filters["open_now"]:
                queryset = queryset.filter(
                    api_has_open_hour=True,
                    api_has_closed_holiday=False,
                )
            else:
                queryset = queryset.filter(
                    Q(api_has_open_hour=False) | Q(api_has_closed_holiday=True)
                )

        if "latitude" in filters:
            reference = Point(
                filters["longitude"], filters["latitude"], srid=4326
            )
            if radius_km := filters.get("radius_km"):
                queryset = queryset.filter(
                    location__distance_lte=(reference, D(km=radius_km))
                )
            queryset = queryset.annotate(distance=Distance("location", reference))
            ordering = ("distance", "name", "pk")
        else:
            ordering = ("name", "pk")

        queryset = queryset.distinct().order_by(*ordering)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = BranchListItemSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class BranchDetailAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "branch_detail"

    @extend_schema(
        operation_id="branch_detail",
        responses={200: BranchDetailResponseSerializer},
    )
    def get(self, request, id_branch):
        branch_services = BranchService.objects.filter(
            is_active=True,
            service__is_active=True,
        ).select_related("service").order_by("service__name")
        branch = get_object_or_404(
            Branch.objects.filter(
                is_active=True,
                organization__is_active=True,
            )
            .select_related("organization", "province", "ward")
            .prefetch_related(
                "opening_hours",
                "images",
                Prefetch(
                    "branch_services",
                    queryset=branch_services,
                    to_attr="active_branch_services",
                ),
            ),
            pk=id_branch,
        )
        branch.api_dentists = list(
            Dentist.objects.filter(
                organization=branch.organization,
                is_active=True,
                user__is_active=True,
                user__memberships__organization=branch.organization,
                user__memberships__branch=branch,
                user__memberships__role=Membership.Role.DENTIST,
                user__memberships__is_active=True,
            )
            .select_related("user")
            .distinct()
            .order_by("user__full_name")
        )
        return Response({"data": BranchDetailSerializer(branch).data})


class BranchServicesAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "branch_services"
    pagination_class = BranchPagination

    @extend_schema(
        operation_id="branch_services_list",
        parameters=[BranchServicesQuerySerializer],
        responses={200: BranchServicesResponseSerializer},
    )
    def get(self, request, id_branch):
        branch = get_object_or_404(
            Branch.objects.filter(
                is_active=True,
                organization__is_active=True,
            ),
            pk=id_branch,
        )
        query_serializer = BranchServicesQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        filters = query_serializer.validated_data

        services = BranchService.objects.filter(
            branch=branch,
            is_active=True,
            service__is_active=True,
        ).select_related("service")
        if text_query := filters.get("q"):
            services = services.filter(
                Q(service__name__icontains=text_query)
                | Q(service__code__icontains=text_query)
                | Q(service__description__icontains=text_query)
            )
        services = services.order_by("service__name", "pk")

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(services, request, view=self)
        serializer = BranchServiceSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class BranchDentistsAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "branch_dentists"
    pagination_class = BranchPagination

    @extend_schema(
        operation_id="branch_dentists_list",
        parameters=[BranchDentistsQuerySerializer],
        responses={200: BranchDentistsResponseSerializer},
    )
    def get(self, request, id_branch):
        branch = get_object_or_404(
            Branch.objects.filter(
                is_active=True,
                organization__is_active=True,
            ),
            pk=id_branch,
        )
        query_serializer = BranchDentistsQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        filters = query_serializer.validated_data
        service_id = filters["service_id"]

        get_object_or_404(
            BranchService.objects.filter(
                branch=branch,
                is_active=True,
                service__is_active=True,
            ),
            service_id=service_id,
        )
        dentists = Dentist.objects.filter(
            organization=branch.organization,
            is_active=True,
            user__is_active=True,
            dentist_services__service_id=service_id,
            user__memberships__organization=branch.organization,
            user__memberships__branch=branch,
            user__memberships__role=Membership.Role.DENTIST,
            user__memberships__is_active=True,
        ).select_related("user")
        if text_query := filters.get("q"):
            dentists = dentists.filter(
                Q(user__full_name__icontains=text_query)
                | Q(license_number__icontains=text_query)
                | Q(biography__icontains=text_query)
            )
        dentists = dentists.distinct().order_by("user__full_name", "pk")

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(dentists, request, view=self)
        serializer = BranchDentistSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)
