from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response

from apps.access_control.scopes import branch_ids_for
from apps.audit.services import AuditService
from apps.management_api.exceptions import ManagementConflict
from apps.management_api.views import BRANCH_MANAGERS, ManagementAPIView
from apps.scheduling.models import Appointment

from .management_serializers import (
    InvoiceCreateSerializer,
    InvoiceDraftUpdateSerializer,
    InvoiceSerializer,
    PaymentCreateSerializer,
    PaymentSerializer,
    ReasonSerializer,
)
from .models import Invoice, Payment
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

    def get(self, request, branch_id):
        branch = self.branch(branch_id)
        invoices = Invoice.objects.filter(branch=branch).select_related(
            "appointment", "patient_profile__user"
        ).prefetch_related("lines", "payments")
        if request.query_params.get("status") in Invoice.Status.values:
            invoices = invoices.filter(status=request.query_params["status"])
        return Response({"data": InvoiceSerializer(invoices, many=True).data})

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
