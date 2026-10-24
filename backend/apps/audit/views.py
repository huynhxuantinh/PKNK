from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.access_control.scopes import organization_ids_for
from apps.accounts.permissions import IsManagementStaff
from apps.organizations.models import Membership, Organization

from .models import AuditEvent
from .serializers import AuditEventFilterSerializer, AuditEventSerializer
from .services import AuditService


class OrganizationAuditEventListAPIView(APIView):
    permission_classes = [IsAuthenticated, IsManagementStaff]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "audit_events"

    @extend_schema(
        parameters=[
            OpenApiParameter("branch_id", int, required=False),
            OpenApiParameter("action", str, required=False),
            OpenApiParameter("access_type", str, required=False),
        ],
        responses={200: AuditEventSerializer(many=True)},
    )
    def get(self, request, organization_id):
        filters = AuditEventFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        organization = get_object_or_404(
            Organization.objects.filter(
                id_organization__in=organization_ids_for(
                    request.user, [Membership.Role.ORGANIZATION_ADMIN]
                )
            ),
            pk=organization_id,
        )
        events = AuditEvent.objects.filter(organization=organization).select_related(
            "actor_user"
        )
        if filters.validated_data.get("branch_id"):
            events = events.filter(branch_id=filters.validated_data["branch_id"])
        if filters.validated_data.get("action"):
            events = events.filter(action=filters.validated_data["action"])
        if filters.validated_data.get("access_type"):
            events = events.filter(access_type=filters.validated_data["access_type"])

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(events, request, view=self)
        AuditService.record_read(
            actor_user=request.user,
            organization=organization,
            action="AUDIT_EVENTS_LIST",
            resource_type="AuditEvent",
            after_data={"filters": list(request.query_params.keys())},
            request=request,
        )
        return paginator.get_paginated_response(AuditEventSerializer(page, many=True).data)

