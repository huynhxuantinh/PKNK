from rest_framework import serializers

from apps.catalog.models import Service

from .models import Invoice, InvoiceLine, Payment


class InvoiceLineSerializer(serializers.ModelSerializer):
    service_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = InvoiceLine
        fields = ("id_invoice_line", "service_id", "service_code_snapshot", "description", "quantity", "unit_price", "line_total")


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = (
            "id_payment", "payment_number", "method", "amount", "status",
            "external_reference", "posted_at", "voided_at", "void_reason",
        )


class InvoiceSerializer(serializers.ModelSerializer):
    appointment_code = serializers.CharField(source="appointment.public_code", read_only=True)
    patient_name = serializers.CharField(source="patient_profile.user.full_name", read_only=True)
    lines = InvoiceLineSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)

    class Meta:
        model = Invoice
        fields = (
            "id_invoice", "invoice_number", "appointment_code", "branch_id",
            "patient_profile_id", "patient_name", "replacement_for_id", "status",
            "currency", "subtotal", "discount", "total", "lines", "payments",
            "issued_at", "paid_at", "voided_at", "void_reason", "created_at",
        )


class InvoiceCreateSerializer(serializers.Serializer):
    appointment_code = serializers.CharField(max_length=30)
    replacement_for_id = serializers.IntegerField(required=False, allow_null=True)


class InvoiceListQuerySerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Invoice.Status.choices, required=False)
    appointment_code = serializers.CharField(max_length=30, required=False)
    limit = serializers.IntegerField(min_value=1, max_value=100, default=20)
    offset = serializers.IntegerField(min_value=0, default=0)


class InvoiceLineWriteSerializer(serializers.Serializer):
    service = serializers.PrimaryKeyRelatedField(queryset=Service.objects.all(), required=False, allow_null=True)
    description = serializers.CharField(max_length=255)
    quantity = serializers.IntegerField(min_value=1)
    unit_price = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)


class InvoiceDraftUpdateSerializer(serializers.Serializer):
    discount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0, required=False)
    lines = InvoiceLineWriteSerializer(many=True, required=False, allow_empty=True)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=3, max_length=1000, trim_whitespace=True)


class PaymentCreateSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=Payment.Method.choices)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=1)
    external_reference = serializers.CharField(max_length=100, required=False, allow_blank=True)
    idempotency_key = serializers.CharField(min_length=8, max_length=64)
