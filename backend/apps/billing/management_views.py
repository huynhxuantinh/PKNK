from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.core.exceptions import ImproperlyConfigured
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import DecimalField, F, OuterRef, Q, Subquery, Sum
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response

from apps.access_control.scopes import branch_ids_for
from apps.audit.services import AuditService
from apps.clinical.models import ClinicalPerformedService
from apps.management_api.exceptions import ManagementConflict
from apps.management_api.views import BRANCH_MANAGERS, ManagementAPIView
from apps.scheduling.models import Appointment

from .management_serializers import (
    InvoiceCreateSerializer,
    InvoiceDraftUpdateSerializer,
    InvoiceListQuerySerializer,
    InvoiceReadyAppointmentSerializer,
    InvoiceReadyAppointmentQuerySerializer,
    InvoiceSerializer,
    PaymentCreateSerializer,
    PaymentSerializer,
    ReasonSerializer,
)
from .models import Invoice, Payment
from .payos_service import PayosCheckoutUnavailable, create_checkout
from .services import BillingService


def billing_conflict(error):
    if hasattr(error, "message_dict"):
        return ManagementConflict(str(error.message_dict))
    return ManagementConflict("; ".join(error.messages))


def scoped_invoice(user, invoice_id):
    return get_object_or_404(
        Invoice.objects.select_related(
            "appointment", "branch__organization", "patient_profile__user"
        ).prefetch_related("lines", "payments").filter(
            branch_id__in=branch_ids_for(user, BRANCH_MANAGERS)
        ),
        pk=invoice_id,
    )


class BranchInvoiceListCreateAPIView(ManagementAPIView):
    serializer_class = InvoiceSerializer

    @extend_schema(parameters=[InvoiceListQuerySerializer], responses={200: InvoiceSerializer(many=True)})
    def get(self, request, branch_id):
        branch = self.branch(branch_id)
        query = InvoiceListQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        filters = query.validated_data
        invoices = Invoice.objects.filter(branch=branch).select_related(
            "appointment", "patient_profile__user"
        ).prefetch_related("lines", "payments")
        if filters.get("status"):
            invoices = invoices.filter(status=filters["status"])
        if filters.get("appointment_code"):
            invoices = invoices.filter(appointment__public_code=filters["appointment_code"])
        invoices = invoices.order_by("-created_at", "-id_invoice")
        count = invoices.count()
        offset = filters["offset"]
        limit = filters["limit"]
        page = invoices[offset:offset + limit]
        return Response({
            "data": self.serializer_class(page, many=True).data,
            "meta": {"count": count, "limit": limit, "offset": offset},
        })

    @extend_schema(request=InvoiceCreateSerializer, responses={201: InvoiceSerializer})
    def post(self, request, branch_id):
        branch = self.branch(branch_id)
        payload = InvoiceCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        appointment = get_object_or_404(
            Appointment.objects.filter(branch=branch),
            public_code=payload.validated_data["appointment_code"],
        )
        try:
            invoice = BillingService.create_invoice(
                appointment_id=appointment.pk,
                replacement_for_id=payload.validated_data.get("replacement_for_id"),
                actor_user=request.user,
                request=request,
            )
        except DjangoValidationError as error:
            raise billing_conflict(error)
        return Response({"data": InvoiceSerializer(invoice).data}, status=status.HTTP_201_CREATED)


class BranchInvoiceReadyAppointmentListAPIView(ManagementAPIView):
    """Completed visits with confirmed clinical services but no active invoice."""

    @extend_schema(parameters=[InvoiceReadyAppointmentQuerySerializer], responses={200: InvoiceReadyAppointmentSerializer(many=True)})
    def get(self, request, branch_id):
        branch = self.branch(branch_id)
        query = InvoiceReadyAppointmentQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        filters = query.validated_data
        appointments = (
            Appointment.objects.filter(
                branch=branch,
                status=Appointment.Status.COMPLETED,
                clinical_encounter__status="FINALIZED",
            )
            .annotate(
                performed_total=Subquery(
                    ClinicalPerformedService.objects.filter(
                        encounter_id=OuterRef("clinical_encounter__pk")
                    )
                    .values("encounter_id")
                    .annotate(total=Sum(F("unit_price_snapshot") * F("quantity")))
                    .values("total")[:1],
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                )
            )
            .filter(
                Q(
                    clinical_encounter__legacy_billing_allowed=True,
                    service_price_snapshot__gt=0,
                )
                | Q(
                    clinical_encounter__performed_services_confirmed=True,
                    clinical_encounter__performed_services__isnull=False,
                    performed_total__gt=0,
                )
            )
            .exclude(invoices__status__in=[Invoice.Status.DRAFT, Invoice.Status.ISSUED, Invoice.Status.PAID])
            .select_related("patient_profile__user", "dentist__user", "clinical_encounter")
            .prefetch_related("clinical_encounter__performed_services")
            .order_by("-completed_at", "-id_appointment")
            .distinct()
        )
        hcm = ZoneInfo("Asia/Ho_Chi_Minh")
        if filters.get("date_from"):
            appointments = appointments.filter(
                completed_at__gte=datetime.combine(filters["date_from"], time.min, tzinfo=hcm)
            )
        if filters.get("date_to"):
            appointments = appointments.filter(
                completed_at__lt=datetime.combine(filters["date_to"] + timedelta(days=1), time.min, tzinfo=hcm)
            )
        count = appointments.count()
        offset = filters["offset"]
        limit = filters["limit"]
        page = appointments[offset:offset + limit]
        return Response({
            "data": InvoiceReadyAppointmentSerializer(page, many=True).data,
            "meta": {"count": count, "limit": limit, "offset": offset},
        })


class InvoiceDetailAPIView(ManagementAPIView):
    serializer_class = InvoiceSerializer

    def get(self, request, invoice_id):
        invoice = scoped_invoice(request.user, invoice_id)
        AuditService.record_read(
            actor_user=request.user, organization=invoice.branch.organization,
            branch=invoice.branch, action="INVOICE_VIEWED", resource_type="Invoice",
            resource_id=invoice.pk, request=request,
        )
        return Response({"data": InvoiceSerializer(invoice).data})

    @extend_schema(request=InvoiceDraftUpdateSerializer, responses={200: InvoiceSerializer})
    def patch(self, request, invoice_id):
        invoice = scoped_invoice(request.user, invoice_id)
        payload = InvoiceDraftUpdateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            invoice = BillingService.update_draft(
                invoice_id=invoice.pk,
                actor_user=request.user,
                request=request,
                **payload.validated_data,
            )
        except DjangoValidationError as error:
            raise billing_conflict(error)
        return Response({"data": InvoiceSerializer(invoice).data})


class InvoiceIssueAPIView(ManagementAPIView):
    @extend_schema(request=None, responses={200: InvoiceSerializer})
    def post(self, request, invoice_id):
        invoice = scoped_invoice(request.user, invoice_id)
        try:
            invoice = BillingService.issue_invoice(invoice_id=invoice.pk, actor_user=request.user, request=request)
        except DjangoValidationError as error:
            raise billing_conflict(error)
        return Response({"data": InvoiceSerializer(invoice).data})


class InvoiceVoidAPIView(ManagementAPIView):
    @extend_schema(request=ReasonSerializer, responses={200: InvoiceSerializer})
    def post(self, request, invoice_id):
        invoice = scoped_invoice(request.user, invoice_id)
        payload = ReasonSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            invoice = BillingService.void_invoice(
                invoice_id=invoice.pk, reason=payload.validated_data["reason"],
                actor_user=request.user, request=request,
            )
        except DjangoValidationError as error:
            raise billing_conflict(error)
        return Response({"data": InvoiceSerializer(invoice).data})


class InvoicePaymentCreateAPIView(ManagementAPIView):
    @extend_schema(request=PaymentCreateSerializer, responses={201: PaymentSerializer})
    def post(self, request, invoice_id):
        invoice = scoped_invoice(request.user, invoice_id)
        payload = PaymentCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            payment, created = BillingService.post_payment(
                invoice_id=invoice.pk, actor_user=request.user, request=request,
                **payload.validated_data,
            )
        except DjangoValidationError as error:
            raise billing_conflict(error)
        return Response(
            {"data": PaymentSerializer(payment).data},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class InvoicePayosCheckoutAPIView(ManagementAPIView):
    """Create or reuse the payOS QR checkout shown at the counter."""

    @extend_schema(request=None, responses={201: dict})
    def post(self, request, invoice_id):
        invoice = scoped_invoice(request.user, invoice_id)
        try:
            checkout, created = create_checkout(invoice=invoice, user=request.user)
        except DjangoValidationError as error:
            raise billing_conflict(error)
        except ImproperlyConfigured:
            return Response(
                {
                    "code": "payos_not_configured",
                    "message": "payOS chưa được cấu hình cho môi trường này.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except PayosCheckoutUnavailable:
            return Response(
                {
                    "code": "payos_unavailable",
                    "message": "Không thể tạo mã payOS lúc này. Vui lòng thử lại.",
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(
            {
                "data": {
                    "order_code": checkout.order_code,
                    "checkout_url": checkout.checkout_url,
                    "qr_code": checkout.qr_code,
                    "status": checkout.status,
                }
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class PaymentVoidAPIView(ManagementAPIView):
    @extend_schema(request=ReasonSerializer, responses={200: PaymentSerializer})
    def post(self, request, payment_id):
        payment = get_object_or_404(
            Payment.objects.select_related("invoice__branch__organization").filter(
                invoice__branch_id__in=branch_ids_for(request.user, BRANCH_MANAGERS)
            ),
            pk=payment_id,
        )
        payload = ReasonSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            payment = BillingService.void_payment(
                payment_id=payment.pk, reason=payload.validated_data["reason"],
                actor_user=request.user, request=request,
            )
        except DjangoValidationError as error:
            raise billing_conflict(error)
        return Response({"data": PaymentSerializer(payment).data})
