from django.shortcuts import get_object_or_404
from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit.services import AuditService

from .permissions import IsPatientOnly

from .models import PatientProfile
from .patient_serializers import (
    PatientProfileResponseSerializer,
    PatientProfileSerializer,
)


PROFILE_AUDIT_FIELDS = (
    "full_name",
    "date_of_birth",
    "gender",
    "phone",
    "province_code",
    "ward_code",
    "address_line",
)


def profile_audit_snapshot(profile, changed_fields):
    values = {
        "full_name": profile.user.full_name,
        "date_of_birth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
        "gender": profile.gender,
        "phone": profile.user.phone or None,
        "province_code": profile.province_id,
        "ward_code": profile.ward_id,
        "address_line": profile.address_line,
    }
    return {field: values[field] for field in changed_fields}


class PatientProfileMeAPIView(APIView):
    permission_classes = [IsAuthenticated, IsPatientOnly]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "patient_read"

    def get_object(self, request):
        return get_object_or_404(
            PatientProfile.objects.select_related("user", "province", "ward"),
            user=request.user,
        )

    @extend_schema(responses={200: PatientProfileResponseSerializer})
    def get(self, request):
        profile = self.get_object(request)
        AuditService.record_read(
            actor_user=request.user,
            action="PATIENT_PROFILE_VIEWED",
            resource_type="PatientProfile",
            resource_id=profile.pk,
            after_data={"owner_user_id": request.user.pk},
            request=request,
        )
        return Response({"data": PatientProfileSerializer(profile).data})

    @extend_schema(
        request=PatientProfileSerializer,
        responses={200: PatientProfileResponseSerializer},
    )
    @transaction.atomic
    def patch(self, request):
        profile = self.get_object(request)
        serializer = PatientProfileSerializer(
            profile,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer_field_names = {
            "province_code": "province",
            "ward_code": "ward",
        }
        changed_fields = [
            field
            for field in PROFILE_AUDIT_FIELDS
            if serializer_field_names.get(field, field) in serializer.validated_data
            or (
                field in {"full_name", "phone"}
                and field in serializer.validated_data.get("user", {})
            )
        ]
        before_data = profile_audit_snapshot(profile, changed_fields)
        serializer.save()
        AuditService.record_write(
            actor_user=request.user,
            action="PATIENT_PROFILE_UPDATED",
            resource_type="PatientProfile",
            resource_id=profile.pk,
            before_data=before_data,
            after_data=profile_audit_snapshot(profile, changed_fields),
            request=request,
        )
        return Response({"data": serializer.data})
