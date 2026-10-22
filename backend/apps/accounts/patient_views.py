from django.shortcuts import get_object_or_404
from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import AuditService

from .models import PatientProfile
from .patient_serializers import (
    PatientProfileResponseSerializer,
    PatientProfileSerializer,
)


class PatientProfileMeAPIView(APIView):
    permission_classes = [IsAuthenticated]

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
        serializer.save()
        AuditService.record_write(
            actor_user=request.user,
            action="PATIENT_PROFILE_UPDATED",
            resource_type="PatientProfile",
            resource_id=profile.pk,
            before_data={"changed_fields": sorted(serializer.validated_data.keys())},
            after_data={"changed_fields": sorted(serializer.validated_data.keys())},
            request=request,
        )
        return Response({"data": serializer.data})
