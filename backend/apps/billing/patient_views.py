from math import ceil

from django.core.exceptions import ImproperlyConfigured, ValidationError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import PatientProfile
from apps.accounts.permissions import IsPatientOnly
from apps.audit.services import AuditService

from .models import Invoice
from .payos_service import create_checkout
from .patient_serializers import PatientInvoiceListQuerySerializer, PatientInvoiceSerializer


class PatientInvoiceListAPIView(APIView):
    permission_classes = [IsAuthenticated, IsPatientOnly]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "patient_read"
    serializer_class = PatientInvoiceSerializer

    @extend_schema(
        operation_id="patient_invoice_list",
        parameters=[PatientInvoiceListQuerySerializer],
        responses={200: PatientInvoiceSerializer(many=True)},
    )
    def get(self, request):
        query = PatientInvoiceListQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data
        invoices = Invoice.objects.filter(
            patient_profile__user=request.user,
            status__in=[Invoice.Status.ISSUED, Invoice.Status.PAID],
        ).select_related("appointment", "branch", "patient_profile__user").prefetch_related(
            "lines", "payments"
        ).order_by("-issued_at", "-id_invoice")
        total = invoices.count()
        offset = (data["page"] - 1) * data["page_size"]
        items = invoices[offset:offset + data["page_size"]]
        profile = get_object_or_404(PatientProfile, user=request.user)
        AuditService.record_read(
            actor_user=request.user,
            action="PATIENT_INVOICE_LIST_VIEWED",
            resource_type="PatientProfile",
            resource_id=profile.pk,
            after_data={"page": data["page"], "page_size": data["page_size"]},
            request=request,
        )
        return Response({
            "data": PatientInvoiceSerializer(items, many=True).data,
            "meta": {
                "count": total,
                "page": data["page"],
                "page_size": data["page_size"],
                "total_pages": ceil(total / data["page_size"]) if total else 0,
            },
        })


class PatientInvoiceDetailAPIView(APIView):
    permission_classes = [IsAuthenticated, IsPatientOnly]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "patient_read"
    serializer_class = PatientInvoiceSerializer

    @extend_schema(operation_id="patient_invoice_retrieve", responses={200: PatientInvoiceSerializer})
    def get(self, request, invoice_id):
        invoice = get_object_or_404(
            Invoice.objects.select_related(
                "appointment", "branch__organization", "patient_profile__user"
            ).prefetch_related("lines", "payments"),
            pk=invoice_id,
            patient_profile__user=request.user,
            status__in=[Invoice.Status.ISSUED, Invoice.Status.PAID],
        )
        AuditService.record_read(
            actor_user=request.user, organization=invoice.branch.organization,
            branch=invoice.branch, action="PATIENT_INVOICE_VIEWED",
            resource_type="Invoice", resource_id=invoice.pk, request=request,
        )
        return Response({"data": PatientInvoiceSerializer(invoice).data})


class PatientInvoicePayosAPIView(APIView):
    permission_classes = [IsAuthenticated, IsPatientOnly]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "patient_payment"

    def post(self, request, invoice_id):
        invoice = get_object_or_404(
            Invoice.objects.select_related("patient_profile__user", "branch"),
            pk=invoice_id,
            patient_profile__user=request.user,
        )
        if invoice.status != Invoice.Status.ISSUED:
            return Response(
                {"code": "invoice_not_payable", "message": "Hóa đơn không ở trạng thái chờ thanh toán."},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            payos_transaction, created = create_checkout(invoice=invoice, user=request.user)
        except (ImproperlyConfigured, ValidationError) as error:
            return Response(
                {"code": "payos_unavailable", "message": str(error)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            {
                "data": {
                    "order_code": payos_transaction.order_code,
                    "checkout_url": payos_transaction.checkout_url,
                }
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
