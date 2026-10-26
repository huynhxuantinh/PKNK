from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.access_control.scopes import (
    branch_ids_for,
    organization_ids_for,
)
from apps.accounts.models import Dentist, User
from apps.accounts.permissions import IsEmailVerified, IsManagementStaff
from apps.audit.services import AuditService
from apps.catalog.models import BranchService, DentistService, Service
from apps.locations.models import Branch, BranchOpeningHour, Chair, Holiday
from apps.organizations.models import Membership, Organization
from apps.organizations.services import (
    ActivePatientAppointmentsExist,
    InvalidStaffInvitation,
    StaffInvitationService,
    deactivate_patient_memberships,
)
from apps.organizations.tasks import send_staff_invitation_email
from apps.scheduling.models import ACTIVE_APPOINTMENT_STATUSES, Appointment

from .exceptions import ManagementConflict
from .serializers import (
    BranchManagementSerializer,
    BranchServiceManagementSerializer,
    ChairManagementSerializer,
    DentistCreateSerializer,
    DentistManagementSerializer,
    HolidayManagementSerializer,
    IdListSerializer,
    MembershipCreateSerializer,
    MembershipManagementSerializer,
    OpeningHourManagementSerializer,
    OpeningHoursReplaceSerializer,
    OrganizationManagementSerializer,
    ServiceManagementSerializer,
    StaffInvitationAcceptSerializer,
)
from .services import audit_model_change, ensure_no_active_future_appointments


ORG_ADMIN = [Membership.Role.ORGANIZATION_ADMIN]
BRANCH_MANAGERS = [Membership.Role.ORGANIZATION_ADMIN, Membership.Role.BRANCH_ADMIN]


def deactivate_patient_role_for_staff(user, *, actor_user, request, source):
    try:
        deactivate_patient_memberships(
            user,
            actor_user=actor_user,
            request=request,
            source=source,
        )
    except ActivePatientAppointmentsExist as error:
        raise ManagementConflict(str(error)) from error


class ManagementAPIView(APIView):
    permission_classes = [IsAuthenticated, IsManagementStaff]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "management_mutation"

    def organization(self, organization_id, roles=ORG_ADMIN):
        return get_object_or_404(
            Organization.objects.filter(
                id_organization__in=organization_ids_for(self.request.user, roles)
            ),
            pk=organization_id,
        )

    def branch(self, branch_id, roles=BRANCH_MANAGERS):
        return get_object_or_404(
            Branch.objects.select_related("organization", "province", "ward").filter(
                id_branch__in=branch_ids_for(self.request.user, roles)
            ),
            pk=branch_id,
        )

class OrganizationDetailAPIView(ManagementAPIView):
    serializer_class = OrganizationManagementSerializer
    @extend_schema(responses={200: OrganizationManagementSerializer})
    def get(self, request, organization_id):
        organization = self.organization(organization_id)
        return Response({"data": OrganizationManagementSerializer(organization).data})

    @extend_schema(request=OrganizationManagementSerializer, responses={200: OrganizationManagementSerializer})
    @transaction.atomic
    def patch(self, request, organization_id):
        organization = self.organization(organization_id)
        serializer = OrganizationManagementSerializer(
            organization, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        before = {key: getattr(organization, key) for key in serializer.validated_data}
        serializer.save()
        audit_model_change(
            request=request, instance=organization, action="ORGANIZATION_UPDATED",
            before_data=before, after_data=serializer.validated_data,
        )
        return Response({"data": serializer.data})


class OrganizationBranchListCreateAPIView(ManagementAPIView):
    serializer_class = BranchManagementSerializer
    @extend_schema(responses={200: BranchManagementSerializer(many=True)})
    def get(self, request, organization_id):
        organization = self.organization(organization_id)
        branches = Branch.objects.filter(organization=organization).select_related("province", "ward")
        return Response({"data": BranchManagementSerializer(branches, many=True).data})

    @extend_schema(request=BranchManagementSerializer, responses={201: BranchManagementSerializer})
    @transaction.atomic
    def post(self, request, organization_id):
        organization = self.organization(organization_id)
        serializer = BranchManagementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]
        if Branch.objects.filter(organization=organization, code=code).exists():
            raise ValidationError({"code": "Mã chi nhánh đã tồn tại trong organization."})
        branch = serializer.save(organization=organization)
        audit_model_change(request=request, instance=branch, action="BRANCH_CREATED")
        return Response({"data": BranchManagementSerializer(branch).data}, status=status.HTTP_201_CREATED)


class BranchDetailAPIView(ManagementAPIView):
    serializer_class = BranchManagementSerializer
    @extend_schema(responses={200: BranchManagementSerializer})
    def get(self, request, branch_id):
        branch = self.branch(branch_id)
        return Response({"data": BranchManagementSerializer(branch).data})

    @extend_schema(request=BranchManagementSerializer, responses={200: BranchManagementSerializer})
    @transaction.atomic
    def patch(self, request, branch_id):
        branch = self.branch(branch_id)
        self.organization(branch.organization_id)
        branch = Branch.objects.select_for_update().get(pk=branch.pk)
        serializer = BranchManagementSerializer(branch, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data.get("is_active") is False and branch.is_active:
            ensure_no_active_future_appointments(
                "Không thể ngưng chi nhánh còn lịch tương lai.", branch=branch
            )
        code = serializer.validated_data.get("code")
        if code and Branch.objects.filter(organization=branch.organization, code=code).exclude(pk=branch.pk).exists():
            raise ValidationError({"code": "Mã chi nhánh đã tồn tại trong organization."})
        before = {key: getattr(branch, key) for key in serializer.validated_data}
        serializer.save()
        audit_model_change(
            request=request, instance=branch, action="BRANCH_UPDATED",
            before_data=before, after_data=serializer.validated_data,
        )
        return Response({"data": serializer.data})


class BranchOpeningHoursAPIView(ManagementAPIView):
    serializer_class = OpeningHourManagementSerializer
    def get(self, request, branch_id):
        branch = self.branch(branch_id)
        hours = branch.opening_hours.all().order_by("weekday")
        return Response({"data": OpeningHourManagementSerializer(hours, many=True).data})

    @extend_schema(request=OpeningHoursReplaceSerializer)
    @transaction.atomic
    def put(self, request, branch_id):
        branch = self.branch(branch_id)
        self.organization(branch.organization_id)
        payload = OpeningHoursReplaceSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        rows = payload.validated_data["opening_hours"]
        new_hours = {row["weekday"]: row for row in rows}
        appointments = Appointment.objects.select_for_update().filter(
            branch=branch,
            status__in=ACTIVE_APPOINTMENT_STATUSES,
            starts_at__gte=timezone.now(),
        )
        local_tz = ZoneInfo(branch.organization.timezone)
        for appointment in appointments:
            local_start = appointment.starts_at.astimezone(local_tz)
            local_end = appointment.occupied_until.astimezone(local_tz)
            day = new_hours[local_start.isoweekday()]
            if (
                day["is_closed"]
                or local_start.date() != local_end.date()
                or local_start.time() < day["open_time"]
                or local_end.time() > day["close_time"]
            ):
                raise ManagementConflict("Giờ mở cửa mới xung đột với lịch tương lai.")
        BranchOpeningHour.objects.filter(branch=branch).delete()
        BranchOpeningHour.objects.bulk_create(
            [BranchOpeningHour(branch=branch, **row) for row in rows]
        )
        AuditService.record_write(
            actor_user=request.user, organization=branch.organization, branch=branch,
            action="OPENING_HOURS_REPLACED", resource_type="Branch",
            resource_id=branch.pk, after_data={"weekdays": list(range(1, 8))}, request=request,
        )
        hours = branch.opening_hours.all().order_by("weekday")
        return Response({"data": OpeningHourManagementSerializer(hours, many=True).data})


class OrganizationHolidayListCreateAPIView(ManagementAPIView):
    serializer_class = HolidayManagementSerializer
    def get(self, request, organization_id):
        organization = self.organization(organization_id, BRANCH_MANAGERS)
        holidays = Holiday.objects.filter(organization=organization).select_related("branch")
        if not organization_ids_for(request.user, ORG_ADMIN).filter(
            organization_id=organization.pk
        ).exists():
            holidays = holidays.filter(
                Q(branch__isnull=True)
                | Q(branch_id__in=branch_ids_for(request.user, [Membership.Role.BRANCH_ADMIN]))
            )
        return Response({"data": HolidayManagementSerializer(holidays, many=True).data})

    @transaction.atomic
    def post(self, request, organization_id):
        organization = self.organization(organization_id)
        serializer = HolidayManagementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        branch = serializer.validated_data.get("branch")
        if branch and branch.organization_id != organization.pk:
            raise ValidationError({"branch_id": "Chi nhánh không thuộc organization."})
        if Holiday.objects.filter(
            organization=organization,
            branch=branch,
            holiday_date=serializer.validated_data["holiday_date"],
        ).exists():
            raise ValidationError({"holiday_date": "Ngày nghỉ đã tồn tại trong phạm vi này."})
        if serializer.validated_data.get("is_closed", True):
            filters = {
                "branch__organization": organization,
                "starts_at__date": serializer.validated_data["holiday_date"],
            }
            if branch:
                filters["branch"] = branch
            ensure_no_active_future_appointments(
                "Ngày nghỉ xung đột với lịch đang hoạt động.", **filters
            )
        holiday = serializer.save(organization=organization)
        audit_model_change(request=request, instance=holiday, action="HOLIDAY_CREATED", organization=organization)
        return Response({"data": HolidayManagementSerializer(holiday).data}, status=status.HTTP_201_CREATED)


class HolidayDetailAPIView(ManagementAPIView):
    serializer_class = HolidayManagementSerializer
    def get_object(self, holiday_id):
        return get_object_or_404(
            Holiday.objects.select_related("organization", "branch").filter(
                organization_id__in=organization_ids_for(self.request.user, ORG_ADMIN)
            ), pk=holiday_id,
        )

    @transaction.atomic
    def patch(self, request, holiday_id):
        holiday = self.get_object(holiday_id)
        serializer = HolidayManagementSerializer(holiday, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        branch = serializer.validated_data.get("branch", holiday.branch)
        if branch and branch.organization_id != holiday.organization_id:
            raise ValidationError({"branch_id": "Chi nhánh không thuộc organization."})
        holiday_date = serializer.validated_data.get("holiday_date", holiday.holiday_date)
        is_closed = serializer.validated_data.get("is_closed", holiday.is_closed)
        duplicate = Holiday.objects.filter(
            organization=holiday.organization,
            branch=branch,
            holiday_date=holiday_date,
        ).exclude(pk=holiday.pk)
        if duplicate.exists():
            raise ValidationError({"holiday_date": "Ngày nghỉ đã tồn tại trong phạm vi này."})
        if is_closed:
            filters = {
                "branch__organization": holiday.organization,
                "starts_at__date": holiday_date,
            }
            if branch:
                filters["branch"] = branch
            ensure_no_active_future_appointments(
                "Ngày nghỉ xung đột với lịch đang hoạt động.", **filters
            )
        serializer.save()
        audit_model_change(request=request, instance=holiday, action="HOLIDAY_UPDATED", organization=holiday.organization)
        return Response({"data": serializer.data})

    @transaction.atomic
    def delete(self, request, holiday_id):
        holiday = self.get_object(holiday_id)
        organization = holiday.organization
        resource_id = holiday.pk
        holiday.delete()
        AuditService.record_write(
            actor_user=request.user, organization=organization, action="HOLIDAY_DELETED",
            resource_type="Holiday", resource_id=resource_id, request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class BranchChairListCreateAPIView(ManagementAPIView):
    serializer_class = ChairManagementSerializer
    def get(self, request, branch_id):
        branch = self.branch(branch_id)
        return Response({"data": ChairManagementSerializer(branch.chairs.all(), many=True).data})

    @transaction.atomic
    def post(self, request, branch_id):
        branch = self.branch(branch_id)
        serializer = ChairManagementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]
        if Chair.objects.filter(branch=branch, code=code).exists():
            raise ValidationError({"code": "Mã ghế/phòng đã tồn tại."})
        chair = serializer.save(branch=branch)
        audit_model_change(request=request, instance=chair, action="CHAIR_CREATED")
        return Response({"data": ChairManagementSerializer(chair).data}, status=status.HTTP_201_CREATED)


class ChairDetailAPIView(ManagementAPIView):
    serializer_class = ChairManagementSerializer
    @transaction.atomic
    def patch(self, request, chair_id):
        chair = get_object_or_404(
            Chair.objects.select_related("branch__organization").filter(
                branch_id__in=branch_ids_for(request.user, BRANCH_MANAGERS)
            ), pk=chair_id,
        )
        chair = Chair.objects.select_for_update().get(pk=chair.pk)
        serializer = ChairManagementSerializer(chair, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data.get("code")
        if code and Chair.objects.filter(branch=chair.branch, code=code).exclude(pk=chair.pk).exists():
            raise ValidationError({"code": "Mã ghế/phòng đã tồn tại."})
        if serializer.validated_data.get("is_active") is False and chair.is_active:
            ensure_no_active_future_appointments(
                "Không thể ngưng ghế/phòng còn lịch tương lai.", chair=chair
            )
        serializer.save()
        audit_model_change(request=request, instance=chair, action="CHAIR_UPDATED")
        return Response({"data": serializer.data})


class OrganizationServiceListCreateAPIView(ManagementAPIView):
    serializer_class = ServiceManagementSerializer
    def get(self, request, organization_id):
        organization = self.organization(organization_id, BRANCH_MANAGERS)
        services = Service.objects.filter(organization=organization)
        return Response({"data": ServiceManagementSerializer(services, many=True).data})

    @transaction.atomic
    def post(self, request, organization_id):
        organization = self.organization(organization_id)
        serializer = ServiceManagementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]
        if Service.objects.filter(organization=organization, code=code).exists():
            raise ValidationError({"code": "Mã dịch vụ đã tồn tại."})
        service = serializer.save(organization=organization)
        audit_model_change(request=request, instance=service, action="SERVICE_CREATED")
        return Response({"data": ServiceManagementSerializer(service).data}, status=status.HTTP_201_CREATED)


class ServiceDetailAPIView(ManagementAPIView):
    serializer_class = ServiceManagementSerializer
    def get_object(self, service_id, roles=BRANCH_MANAGERS):
        return get_object_or_404(
            Service.objects.select_related("organization").filter(
                organization_id__in=organization_ids_for(self.request.user, roles)
            ), pk=service_id,
        )

    def get(self, request, service_id):
        service = self.get_object(service_id)
        return Response({"data": ServiceManagementSerializer(service).data})

    @transaction.atomic
    def patch(self, request, service_id):
        service = self.get_object(service_id, ORG_ADMIN)
        service = Service.objects.select_for_update().get(pk=service.pk)
        serializer = ServiceManagementSerializer(service, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data.get("code")
        if code and Service.objects.filter(organization=service.organization, code=code).exclude(pk=service.pk).exists():
            raise ValidationError({"code": "Mã dịch vụ đã tồn tại."})
        if serializer.validated_data.get("is_active") is False and service.is_active:
            ensure_no_active_future_appointments(
                "Không thể ngưng dịch vụ còn lịch tương lai.", branch_service__service=service
            )
        serializer.save()
        audit_model_change(request=request, instance=service, action="SERVICE_UPDATED")
        return Response({"data": serializer.data})


class BranchServiceListCreateAPIView(ManagementAPIView):
    serializer_class = BranchServiceManagementSerializer
    def get(self, request, branch_id):
        branch = self.branch(branch_id)
        rows = BranchService.objects.filter(branch=branch).select_related("service")
        return Response({"data": BranchServiceManagementSerializer(rows, many=True).data})

    @transaction.atomic
    def post(self, request, branch_id):
        branch = self.branch(branch_id)
        serializer = BranchServiceManagementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = serializer.validated_data["service"]
        if service.organization_id != branch.organization_id:
            raise ValidationError({"service_id": "Dịch vụ không thuộc organization của chi nhánh."})
        if BranchService.objects.filter(branch=branch, service=service).exists():
            raise ValidationError({"service_id": "Dịch vụ đã được cấu hình tại chi nhánh."})
        row = serializer.save(branch=branch)
        audit_model_change(request=request, instance=row, action="BRANCH_SERVICE_CREATED")
        return Response({"data": BranchServiceManagementSerializer(row).data}, status=status.HTTP_201_CREATED)


class BranchServiceDetailAPIView(ManagementAPIView):
    serializer_class = BranchServiceManagementSerializer
    @transaction.atomic
    def patch(self, request, branch_service_id):
        row = get_object_or_404(
            BranchService.objects.select_related("branch__organization", "service").filter(
                branch_id__in=branch_ids_for(request.user, BRANCH_MANAGERS)
            ), pk=branch_service_id,
        )
        row = BranchService.objects.select_for_update().get(pk=row.pk)
        serializer = BranchServiceManagementSerializer(row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        service = serializer.validated_data.get("service", row.service)
        if service.pk != row.service_id:
            raise ValidationError({"service_id": "Không được đổi dịch vụ của cấu hình giá hiện có."})
        if service.organization_id != row.branch.organization_id:
            raise ValidationError({"service_id": "Dịch vụ không thuộc organization của chi nhánh."})
        if serializer.validated_data.get("is_active") is False and row.is_active:
            ensure_no_active_future_appointments(
                "Không thể ngưng giá/dịch vụ còn lịch tương lai.", branch_service=row
            )
        serializer.save()
        audit_model_change(request=request, instance=row, action="BRANCH_SERVICE_UPDATED")
        return Response({"data": serializer.data})


class OrganizationMembershipListCreateAPIView(ManagementAPIView):
    serializer_class = MembershipManagementSerializer
    def get(self, request, organization_id):
        organization = self.organization(organization_id, BRANCH_MANAGERS)
        memberships = Membership.objects.filter(
            organization=organization,
            role__in=[Membership.Role.ORGANIZATION_ADMIN, Membership.Role.BRANCH_ADMIN],
        ).select_related("user", "branch")
        if not organization_ids_for(request.user, ORG_ADMIN).filter(
            organization_id=organization.pk
        ).exists():
            memberships = memberships.filter(
                branch_id__in=branch_ids_for(request.user, [Membership.Role.BRANCH_ADMIN])
            )
        return Response({"data": MembershipManagementSerializer(memberships, many=True).data})

    @transaction.atomic
    def post(self, request, organization_id):
        organization = self.organization(organization_id)
        serializer = MembershipCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        role = serializer.validated_data["role"]
        branch = serializer.validated_data.get("branch")
        if branch and branch.organization_id != organization.pk:
            raise ValidationError({"branch_id": "Chi nhánh không thuộc organization."})
        user = User.objects.filter(email__iexact=email).first()
        if user is None or user.email_verified_at is None:
            if user is not None and not user.is_active:
                raise ValidationError({"email": "Tài khoản đã bị vô hiệu hóa."})
            invitation, raw_token = StaffInvitationService.create(
                organization=organization,
                branch=branch,
                email=email,
                role=role,
                invited_by=request.user,
            )
            transaction.on_commit(
                lambda: send_staff_invitation_email.delay(invitation.pk, raw_token)
            )
            AuditService.record_write(
                actor_user=request.user,
                organization=organization,
                branch=branch,
                action="STAFF_INVITATION_CREATED",
                resource_type="StaffInvitation",
                resource_id=invitation.pk,
                after_data={"role": role},
                request=request,
            )
            return Response(
                {"data": {"invitation_id": invitation.pk, "status": "PENDING"}},
                status=status.HTTP_202_ACCEPTED,
            )
        if Membership.objects.filter(user=user, organization=organization, branch=branch, role=role).exists():
            raise ValidationError("Membership đã tồn tại.")
        deactivate_patient_role_for_staff(
            user,
            actor_user=request.user,
            request=request,
            source="ORGANIZATION_MEMBERSHIP_CREATED",
        )
        membership = Membership.objects.create(
            user=user, organization=organization, branch=branch, role=role
        )
        audit_model_change(request=request, instance=membership, action="MEMBERSHIP_CREATED")
        return Response({"data": MembershipManagementSerializer(membership).data}, status=status.HTTP_201_CREATED)


class StaffInvitationAcceptAPIView(APIView):
    permission_classes = [IsAuthenticated, IsEmailVerified]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "staff_invitation_accept"
    serializer_class = StaffInvitationAcceptSerializer

    @extend_schema(request=StaffInvitationAcceptSerializer, responses={200: MembershipManagementSerializer})
    @transaction.atomic
    def post(self, request):
        serializer = StaffInvitationAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            membership, invitation = StaffInvitationService.accept(
                raw_token=serializer.validated_data["token"],
                user=request.user,
                request=request,
            )
        except InvalidStaffInvitation as error:
            raise ValidationError(
                {"token": "Lời mời không hợp lệ, đã dùng hoặc đã hết hạn."}
            ) from error
        except ActivePatientAppointmentsExist as error:
            raise ManagementConflict(str(error)) from error
        AuditService.record_write(
            actor_user=request.user,
            organization=membership.organization,
            branch=membership.branch,
            action="STAFF_INVITATION_ACCEPTED",
            resource_type="Membership",
            resource_id=membership.pk,
            after_data={"invitation_id": invitation.pk, "role": membership.role},
            request=request,
        )
        return Response({"data": MembershipManagementSerializer(membership).data})


class MembershipDetailAPIView(ManagementAPIView):
    serializer_class = MembershipManagementSerializer
    @transaction.atomic
    def patch(self, request, membership_id):
        membership = get_object_or_404(
            Membership.objects.select_related("organization", "branch", "user").filter(
                organization_id__in=organization_ids_for(request.user, ORG_ADMIN)
            ), pk=membership_id,
        )
        membership = Membership.objects.select_for_update().get(pk=membership.pk)
        serializer = MembershipManagementSerializer(membership, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        branch = serializer.validated_data.get("branch", membership.branch)
        role = serializer.validated_data.get("role", membership.role)
        active = serializer.validated_data.get("is_active", membership.is_active)
        if branch and branch.organization_id != membership.organization_id:
            raise ValidationError({"branch_id": "Chi nhánh không thuộc organization."})
        if role == Membership.Role.ORGANIZATION_ADMIN and branch is not None:
            raise ValidationError({"branch_id": "Organization Admin không gắn chi nhánh."})
        if role == Membership.Role.BRANCH_ADMIN and branch is None:
            raise ValidationError({"branch_id": "Branch Admin phải gắn chi nhánh."})
        if Membership.objects.filter(
            user=membership.user,
            organization=membership.organization,
            branch=branch,
            role=role,
        ).exclude(pk=membership.pk).exists():
            raise ValidationError("Membership cùng scope và role đã tồn tại.")
        if (
            membership.role == Membership.Role.ORGANIZATION_ADMIN
            and membership.is_active
            and (not active or role != Membership.Role.ORGANIZATION_ADMIN)
        ):
            other_admins = Membership.objects.select_for_update().filter(
                organization=membership.organization,
                role=Membership.Role.ORGANIZATION_ADMIN,
                is_active=True,
            ).exclude(pk=membership.pk)
            if not other_admins.exists():
                raise ManagementConflict("Không thể vô hiệu hóa Organization Admin cuối cùng.")
        if active:
            deactivate_patient_role_for_staff(
                membership.user,
                actor_user=request.user,
                request=request,
                source="MEMBERSHIP_ACTIVATED",
            )
        serializer.save()
        audit_model_change(request=request, instance=membership, action="MEMBERSHIP_UPDATED")
        return Response({"data": serializer.data})


class OrganizationDentistListCreateAPIView(ManagementAPIView):
    serializer_class = DentistManagementSerializer
    def get(self, request, organization_id):
        organization = self.organization(organization_id, BRANCH_MANAGERS)
        dentists = Dentist.objects.filter(organization=organization).select_related("user")
        if not organization_ids_for(request.user, ORG_ADMIN).filter(
            organization_id=organization.pk
        ).exists():
            dentists = dentists.filter(
                user__memberships__branch_id__in=branch_ids_for(
                    request.user, [Membership.Role.BRANCH_ADMIN]
                ),
                user__memberships__role=Membership.Role.DENTIST,
                user__memberships__is_active=True,
            ).distinct()
        return Response({"data": DentistManagementSerializer(dentists, many=True).data})

    @transaction.atomic
    def post(self, request, organization_id):
        organization = self.organization(organization_id)
        serializer = DentistCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        license_number = serializer.validated_data.get("license_number")
        if license_number and Dentist.objects.filter(
            organization=organization, license_number=license_number
        ).exists():
            raise ValidationError({"license_number": "Số giấy phép đã tồn tại trong organization."})
        dentist = Dentist.objects.create(
            user=serializer.validated_data["email"],
            organization=organization,
            license_number=serializer.validated_data.get("license_number"),
            biography=serializer.validated_data.get("biography"),
        )
        audit_model_change(request=request, instance=dentist, action="DENTIST_CREATED")
        return Response({"data": DentistManagementSerializer(dentist).data}, status=status.HTTP_201_CREATED)


class BranchDentistListAPIView(ManagementAPIView):
    serializer_class = DentistManagementSerializer

    @extend_schema(responses={200: DentistManagementSerializer(many=True)})
    def get(self, request, branch_id):
        branch = self.branch(branch_id)
        dentists = (
            Dentist.objects.filter(
                organization=branch.organization,
                is_active=True,
                user__memberships__organization=branch.organization,
                user__memberships__branch=branch,
                user__memberships__role=Membership.Role.DENTIST,
                user__memberships__is_active=True,
            )
            .select_related("user")
            .distinct()
            .order_by("user__full_name", "id_dentist")
        )
        return Response({"data": self.serializer_class(dentists, many=True).data})


class DentistDetailAPIView(ManagementAPIView):
    serializer_class = DentistManagementSerializer
    def get_object(self, dentist_id):
        return get_object_or_404(
            Dentist.objects.select_related("organization", "user").filter(
                organization_id__in=organization_ids_for(self.request.user, ORG_ADMIN)
            ), pk=dentist_id,
        )

    def get(self, request, dentist_id):
        return Response({"data": DentistManagementSerializer(self.get_object(dentist_id)).data})

    @transaction.atomic
    def patch(self, request, dentist_id):
        dentist = self.get_object(dentist_id)
        dentist = Dentist.objects.select_for_update().get(pk=dentist.pk)
        serializer = DentistManagementSerializer(dentist, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        license_number = serializer.validated_data.get("license_number")
        if license_number and Dentist.objects.filter(
            organization=dentist.organization, license_number=license_number
        ).exclude(pk=dentist.pk).exists():
            raise ValidationError({"license_number": "Số giấy phép đã tồn tại trong organization."})
        if serializer.validated_data.get("is_active") is False and dentist.is_active:
            ensure_no_active_future_appointments(
                "Không thể ngưng nha sĩ còn lịch tương lai.", dentist=dentist
            )
        serializer.save()
        audit_model_change(request=request, instance=dentist, action="DENTIST_UPDATED")
        return Response({"data": serializer.data})


class DentistServicesAPIView(ManagementAPIView):
    serializer_class = IdListSerializer
    def dentist(self, dentist_id):
        return get_object_or_404(
            Dentist.objects.select_related("organization").filter(
                organization_id__in=organization_ids_for(self.request.user, ORG_ADMIN)
            ), pk=dentist_id,
        )

    def get(self, request, dentist_id):
        dentist = self.dentist(dentist_id)
        services = Service.objects.filter(dentist_services__dentist=dentist)
        return Response({"data": ServiceManagementSerializer(services, many=True).data})

    @transaction.atomic
    def put(self, request, dentist_id):
        dentist = self.dentist(dentist_id)
        payload = IdListSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        services = list(Service.objects.filter(
            organization=dentist.organization, pk__in=payload.validated_data["ids"]
        ))
        if len(services) != len(payload.validated_data["ids"]):
            raise ValidationError({"ids": "Có dịch vụ không thuộc organization."})
        removed_ids = set(DentistService.objects.filter(dentist=dentist).values_list("service_id", flat=True)) - {s.pk for s in services}
        if removed_ids:
            ensure_no_active_future_appointments(
                "Không thể bỏ năng lực dịch vụ đang có lịch tương lai.",
                dentist=dentist, branch_service__service_id__in=removed_ids,
            )
        DentistService.objects.filter(dentist=dentist).exclude(service__in=services).delete()
        DentistService.objects.bulk_create(
            [DentistService(dentist=dentist, service=service) for service in services],
            ignore_conflicts=True,
        )
        AuditService.record_write(
            actor_user=request.user, organization=dentist.organization,
            action="DENTIST_SERVICES_REPLACED", resource_type="Dentist",
            resource_id=dentist.pk, after_data={"service_ids": sorted(s.pk for s in services)}, request=request,
        )
        return self.get(request, dentist_id)


class DentistBranchesAPIView(ManagementAPIView):
    serializer_class = IdListSerializer
    def dentist(self, dentist_id):
        return get_object_or_404(
            Dentist.objects.select_related("organization", "user").filter(
                organization_id__in=organization_ids_for(self.request.user, ORG_ADMIN)
            ), pk=dentist_id,
        )

    def get(self, request, dentist_id):
        dentist = self.dentist(dentist_id)
        branches = Branch.objects.filter(
            memberships__user=dentist.user,
            memberships__organization=dentist.organization,
            memberships__role=Membership.Role.DENTIST,
            memberships__is_active=True,
        ).distinct()
        return Response({"data": BranchManagementSerializer(branches, many=True).data})

    @transaction.atomic
    def put(self, request, dentist_id):
        dentist = self.dentist(dentist_id)
        payload = IdListSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        branches = list(Branch.objects.filter(
            organization=dentist.organization, pk__in=payload.validated_data["ids"]
        ).select_related("province", "ward"))
        if len(branches) != len(payload.validated_data["ids"]):
            raise ValidationError({"ids": "Có chi nhánh không thuộc organization."})
        target_ids = {branch.pk for branch in branches}
        if target_ids:
            deactivate_patient_role_for_staff(
                dentist.user,
                actor_user=request.user,
                request=request,
                source="DENTIST_BRANCHES_ASSIGNED",
            )
        memberships = Membership.objects.select_for_update().filter(
            user=dentist.user,
            organization=dentist.organization,
            role=Membership.Role.DENTIST,
        )
        removed_ids = set(memberships.filter(is_active=True).values_list("branch_id", flat=True)) - target_ids
        if removed_ids:
            ensure_no_active_future_appointments(
                "Không thể gỡ nha sĩ khỏi chi nhánh đang có lịch tương lai.",
                dentist=dentist, branch_id__in=removed_ids,
            )
        memberships.exclude(branch_id__in=target_ids).update(is_active=False)
        for branch in branches:
            Membership.objects.update_or_create(
                user=dentist.user,
                organization=dentist.organization,
                branch=branch,
                role=Membership.Role.DENTIST,
                defaults={"is_active": True},
            )
        AuditService.record_write(
            actor_user=request.user, organization=dentist.organization,
            action="DENTIST_BRANCHES_REPLACED", resource_type="Dentist",
            resource_id=dentist.pk, after_data={"branch_ids": sorted(target_ids)}, request=request,
        )
        return self.get(request, dentist_id)
