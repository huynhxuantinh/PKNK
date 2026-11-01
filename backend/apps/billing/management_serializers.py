from rest_framework import serializers

from apps.catalog.models import Service

from .models import Invoice, InvoiceLine, Payment


class InvoiceLineSerializer(serializers.ModelSerializer):
    service_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = InvoiceLine
        fields = ("id_invoice_line", "service_id", "service_code_snapshot", "description", "quantity", "unit_price", "line_total")


class PaymentSerializer(serializers.ModelSerializer):
    source = serializers.SerializerMethodField()

    def get_source(self, obj):
        return "PAYOS" if obj.idempotency_key.startswith("payos:") else "MANUAL"

    class Meta:
        model = Payment
        fields = (
            "id_payment", "payment_number", "method", "amount", "status",
            "external_reference", "source", "posted_at", "voided_at", "void_reason",
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


class InvoiceReadyAppointmentSerializer(serializers.Serializer):
    """Completed clinical work that can become one draft invoice."""

    appointment_code = serializers.CharField(source="public_code", read_only=True)
    patient_name = serializers.CharField(source="patient_profile.user.full_name", read_only=True)
    dentist_name = serializers.CharField(source="dentist.user.full_name", read_only=True)
    completed_at = serializers.DateTimeField(read_only=True)
    performed_services = serializers.SerializerMethodField()
    estimated_total = serializers.SerializerMethodField()

    def get_performed_services(self, appointment):
        encounter = appointment.clinical_encounter
        return [
            {
                "service_name": item.service_name_snapshot,
                "quantity": item.quantity,
                "unit_price": item.unit_price_snapshot,
                "tooth_reference": item.tooth_reference,
            }
            for item in encounter.performed_services.all()
        ]

    def get_estimated_total(self, appointment):
        return sum(
            item.unit_price_snapshot * item.quantity
            for item in appointment.clinical_encounter.performed_services.all()
        )


class InvoiceReadyAppointmentQuerySerializer(serializers.Serializer):
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    limit = serializers.IntegerField(min_value=1, max_value=100, default=20)
    offset = serializers.IntegerField(min_value=0, default=0)

    def validate(self, attrs):
        if attrs.get("date_from") and attrs.get("date_to") and attrs["date_from"] > attrs["date_to"]:
            raise serializers.ValidationError({"date_to": "Ngày đến phải sau hoặc bằng ngày từ."})
        return attrs


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
    adjustment_reason = serializers.CharField(min_length=3, max_length=1000, trim_whitespace=True)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=3, max_length=1000, trim_whitespace=True)


class PaymentCreateSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=Payment.Method.choices)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=1)
    external_reference = serializers.CharField(max_length=100, required=False, allow_blank=True)
    idempotency_key = serializers.CharField(min_length=8, max_length=64)
