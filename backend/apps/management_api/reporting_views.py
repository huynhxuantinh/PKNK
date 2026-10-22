from drf_spectacular.utils import extend_schema
from rest_framework.response import Response

from apps.audit.services import AuditService

from .reporting_serializers import (
    AppointmentReportSerializer,
    ChairUtilizationReportSerializer,
    ReportPeriodSerializer,
    RevenueReportQuerySerializer,
    RevenueReportSerializer,
)
from .reporting_services import (
    AppointmentReportService,
    ChairUtilizationReportService,
    RevenueReportService,
)
from .views import ORG_ADMIN, ManagementAPIView


class ReportAPIView(ManagementAPIView):
    throttle_scope = "management_reports"
    query_serializer_class = ReportPeriodSerializer

    def period(self, request):
        serializer = self.query_serializer_class(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data


class RevenueReportAPIView(ReportAPIView):
    serializer_class = RevenueReportSerializer
    query_serializer_class = RevenueReportQuerySerializer


class OrganizationRevenueReportAPIView(RevenueReportAPIView):
    @extend_schema(parameters=[RevenueReportQuerySerializer], responses={200: RevenueReportSerializer})
    def get(self, request, organization_id):
        organization = self.organization(organization_id, ORG_ADMIN)
        period = self.period(request)
        report = RevenueReportService.build(organization=organization, **period)
        AuditService.record_read(
            actor_user=request.user, organization=organization,
            action="ORGANIZATION_REVENUE_REPORT_VIEWED", resource_type="Organization",
            resource_id=organization.pk, after_data=period, request=request,
        )
        return Response({"data": RevenueReportSerializer(report).data})


class OrganizationAppointmentReportAPIView(ReportAPIView):
    serializer_class = AppointmentReportSerializer

    @extend_schema(parameters=[ReportPeriodSerializer], responses={200: AppointmentReportSerializer})
    def get(self, request, organization_id):
        organization = self.organization(organization_id, ORG_ADMIN)
        period = self.period(request)
        report = AppointmentReportService.build(organization=organization, **period)
        AuditService.record_read(
            actor_user=request.user, organization=organization,
            action="ORGANIZATION_APPOINTMENT_REPORT_VIEWED", resource_type="Organization",
            resource_id=organization.pk, after_data=period, request=request,
        )
        return Response({"data": AppointmentReportSerializer(report).data})


class BranchAppointmentReportAPIView(ReportAPIView):
    serializer_class = AppointmentReportSerializer

    @extend_schema(parameters=[ReportPeriodSerializer], responses={200: AppointmentReportSerializer})
    def get(self, request, branch_id):
        branch = self.branch(branch_id)
        period = self.period(request)
        report = AppointmentReportService.build(
            organization=branch.organization, branch=branch, **period
        )
        AuditService.record_read(
            actor_user=request.user, organization=branch.organization, branch=branch,
            action="BRANCH_APPOINTMENT_REPORT_VIEWED", resource_type="Branch",
            resource_id=branch.pk, after_data=period, request=request,
        )
        return Response({"data": AppointmentReportSerializer(report).data})


class OrganizationChairUtilizationReportAPIView(ReportAPIView):
    serializer_class = ChairUtilizationReportSerializer

    @extend_schema(
        parameters=[ReportPeriodSerializer],
        responses={200: ChairUtilizationReportSerializer},
    )
    def get(self, request, organization_id):
        organization = self.organization(organization_id, ORG_ADMIN)
        period = self.period(request)
        report = ChairUtilizationReportService.build(organization=organization, **period)
        AuditService.record_read(
            actor_user=request.user, organization=organization,
            action="ORGANIZATION_CHAIR_UTILIZATION_REPORT_VIEWED",
            resource_type="Organization", resource_id=organization.pk,
            after_data=period, request=request,
        )
        return Response({"data": ChairUtilizationReportSerializer(report).data})


class BranchChairUtilizationReportAPIView(ReportAPIView):
    serializer_class = ChairUtilizationReportSerializer

    @extend_schema(
        parameters=[ReportPeriodSerializer],
        responses={200: ChairUtilizationReportSerializer},
    )
    def get(self, request, branch_id):
        branch = self.branch(branch_id)
        period = self.period(request)
        report = ChairUtilizationReportService.build(
            organization=branch.organization, branch=branch, **period
        )
        AuditService.record_read(
            actor_user=request.user, organization=branch.organization, branch=branch,
            action="BRANCH_CHAIR_UTILIZATION_REPORT_VIEWED", resource_type="Branch",
            resource_id=branch.pk, after_data=period, request=request,
        )
        return Response({"data": ChairUtilizationReportSerializer(report).data})


class BranchRevenueReportAPIView(RevenueReportAPIView):
    @extend_schema(parameters=[RevenueReportQuerySerializer], responses={200: RevenueReportSerializer})
    def get(self, request, branch_id):
        branch = self.branch(branch_id)
        period = self.period(request)
        report = RevenueReportService.build(
            organization=branch.organization, branch=branch, **period
        )
        AuditService.record_read(
            actor_user=request.user, organization=branch.organization, branch=branch,
            action="BRANCH_REVENUE_REPORT_VIEWED", resource_type="Branch",
            resource_id=branch.pk, after_data=period, request=request,
        )
        return Response({"data": RevenueReportSerializer(report).data})
