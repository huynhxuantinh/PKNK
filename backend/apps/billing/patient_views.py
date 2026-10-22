from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import AuditService

from .management_serializers import InvoiceSerializer
from .models import Invoice


class PatientInvoiceListAPIView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = InvoiceSerializer

    @extend_schema(operation_id="patient_invoice_list", responses={200: InvoiceSerializer(many=True)})
    def get(self, request):
        invoices = Invoice.objects.filter(
            patient_profile__user=request.user,
            status__in=[Invoice.Status.ISSUED, Invoice.Status.PAID],
        ).select_related("appointment", "branch", "patient_profile__user").prefetch_related("lines", "payments")
        return Response({"data": InvoiceSerializer(invoices, many=True).data})


class PatientInvoiceDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = InvoiceSerializer

    @extend_schema(operation_id="patient_invoice_retrieve", responses={200: InvoiceSerializer})
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
        return Response({"data": InvoiceSerializer(invoice).data})
