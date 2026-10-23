from rest_framework import serializers

from .models import Invoice, InvoiceLine, Payment


class PatientInvoiceListQuerySerializer(serializers.Serializer):
    page = serializers.IntegerField(min_value=1, default=1)
    page_size = serializers.IntegerField(min_value=1, max_value=100, default=20)


class PatientInvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLine
        fields = ("description", "quantity", "unit_price", "line_total")


class PatientPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ("method", "amount", "status", "posted_at")


class PatientInvoiceSerializer(serializers.ModelSerializer):
    appointment_code = serializers.CharField(source="appointment.public_code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    lines = PatientInvoiceLineSerializer(many=True, read_only=True)
    payments = PatientPaymentSerializer(many=True, read_only=True)

    class Meta:
        model = Invoice
        fields = (
            "id_invoice", "invoice_number", "appointment_code", "branch_name", "status",
            "currency", "subtotal", "discount", "total", "lines", "payments",
            "issued_at", "paid_at", "created_at",
        )
