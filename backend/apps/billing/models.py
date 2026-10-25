from django.conf import settings
from django.db import models


class Invoice(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Bản nháp"
        ISSUED = "ISSUED", "Đã phát hành"
        PAID = "PAID", "Đã thanh toán"
        VOID = "VOID", "Đã hủy"

    id_invoice = models.BigAutoField(primary_key=True)
    appointment = models.ForeignKey("scheduling.Appointment", db_column="id_appointment", on_delete=models.PROTECT, related_name="invoices")
    branch = models.ForeignKey("locations.Branch", db_column="id_branch", on_delete=models.PROTECT, related_name="invoices")
    patient_profile = models.ForeignKey("accounts.PatientProfile", db_column="id_patient_profile", on_delete=models.PROTECT, related_name="invoices")
    replacement_for = models.OneToOneField("self", db_column="id_replacement_for", on_delete=models.PROTECT, related_name="replacement_invoice", null=True, blank=True)
    invoice_number = models.CharField(max_length=40, unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    currency = models.CharField(max_length=3, default="VND")
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, db_column="id_created_by", on_delete=models.PROTECT, related_name="invoices_created")
    issued_by = models.ForeignKey(settings.AUTH_USER_MODEL, db_column="id_issued_by", on_delete=models.PROTECT, related_name="invoices_issued", null=True, blank=True)
    issued_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, db_column="id_voided_by", on_delete=models.PROTECT, related_name="invoices_voided", null=True, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "invoices"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["branch", "status", "created_at"], name="idx_invoice_branch_status"),
            models.Index(fields=["branch", "status", "paid_at"], name="idx_invoice_branch_paid"),
            models.Index(fields=["patient_profile", "created_at"], name="idx_invoice_patient_date"),
        ]
        constraints = [
            models.UniqueConstraint(fields=["appointment"], condition=~models.Q(status="VOID"), name="uq_invoice_active_appointment"),
            models.CheckConstraint(condition=models.Q(status__in=["DRAFT", "ISSUED", "PAID", "VOID"]), name="ck_invoices_status"),
            models.CheckConstraint(condition=models.Q(currency="VND"), name="ck_invoices_currency"),
            models.CheckConstraint(condition=models.Q(subtotal__gte=0), name="ck_invoices_subtotal"),
            models.CheckConstraint(condition=models.Q(discount__gte=0), name="ck_invoices_discount"),
            models.CheckConstraint(condition=models.Q(discount__lte=models.F("subtotal")), name="ck_invoices_discount_limit"),
            models.CheckConstraint(condition=models.Q(total=models.F("subtotal") - models.F("discount")), name="ck_invoices_total_math"),
            models.CheckConstraint(
                condition=(
                    models.Q(status="DRAFT", issued_at__isnull=True, issued_by__isnull=True, paid_at__isnull=True, voided_at__isnull=True, voided_by__isnull=True, void_reason="")
                    | models.Q(status="ISSUED", issued_at__isnull=False, issued_by__isnull=False, paid_at__isnull=True, voided_at__isnull=True, voided_by__isnull=True, void_reason="")
                    | models.Q(status="PAID", issued_at__isnull=False, issued_by__isnull=False, paid_at__isnull=False, voided_at__isnull=True, voided_by__isnull=True, void_reason="")
                    | (models.Q(status="VOID", voided_at__isnull=False, voided_by__isnull=False) & ~models.Q(void_reason=""))
                ),
                name="ck_invoices_state_fields",
            ),
        ]


class InvoiceLine(models.Model):
    id_invoice_line = models.BigAutoField(primary_key=True)
    invoice = models.ForeignKey(Invoice, db_column="id_invoice", on_delete=models.PROTECT, related_name="lines")
    service = models.ForeignKey("catalog.Service", db_column="id_service", on_delete=models.PROTECT, related_name="invoice_lines", null=True, blank=True)
    service_code_snapshot = models.CharField(max_length=50, blank=True)
    description = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=14, decimal_places=2)
    line_total = models.DecimalField(max_digits=14, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "invoice_lines"
        ordering = ["id_invoice_line"]
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="ck_invoice_lines_quantity"),
            models.CheckConstraint(condition=models.Q(unit_price__gte=0), name="ck_invoice_lines_unit_price"),
            models.CheckConstraint(condition=models.Q(line_total__gte=0), name="ck_invoice_lines_total"),
        ]


class Payment(models.Model):
    class Status(models.TextChoices):
        POSTED = "POSTED", "Đã ghi nhận"
        VOID = "VOID", "Đã hủy"

    class Method(models.TextChoices):
        CASH = "CASH", "Tiền mặt"
        BANK_TRANSFER = "BANK_TRANSFER", "Chuyển khoản"
        CARD = "CARD", "Thẻ"

    id_payment = models.BigAutoField(primary_key=True)
    invoice = models.ForeignKey(Invoice, db_column="id_invoice", on_delete=models.PROTECT, related_name="payments")
    payment_number = models.CharField(max_length=40, unique=True)
    method = models.CharField(max_length=20, choices=Method.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.POSTED)
    external_reference = models.CharField(max_length=100, blank=True)
    idempotency_key = models.CharField(max_length=64, unique=True)
    posted_by = models.ForeignKey(settings.AUTH_USER_MODEL, db_column="id_posted_by", on_delete=models.PROTECT, related_name="payments_posted")
    posted_at = models.DateTimeField()
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, db_column="id_voided_by", on_delete=models.PROTECT, related_name="payments_voided", null=True, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "payments"
        ordering = ["-posted_at"]
        indexes = [models.Index(fields=["invoice", "status"], name="idx_payment_invoice_status")]
        constraints = [
            models.UniqueConstraint(fields=["invoice"], condition=models.Q(status="POSTED"), name="uq_payment_posted_invoice"),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="ck_payments_amount"),
            models.CheckConstraint(condition=models.Q(status__in=["POSTED", "VOID"]), name="ck_payments_status"),
            models.CheckConstraint(
                condition=(
                    models.Q(status="POSTED", voided_at__isnull=True, voided_by__isnull=True, void_reason="")
                    | (models.Q(status="VOID", voided_at__isnull=False, voided_by__isnull=False) & ~models.Q(void_reason=""))
                ),
                name="ck_payments_state_fields",
            ),
        ]


class PayosTransaction(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Đang chờ"
        SUCCEEDED = "SUCCEEDED", "Thành công"
        CANCELLED = "CANCELLED", "Đã hủy"
        NEEDS_REVIEW = "NEEDS_REVIEW", "Cần kiểm tra"

    order_code = models.BigAutoField(primary_key=True)
    invoice = models.ForeignKey(
        Invoice, on_delete=models.PROTECT, related_name="payos_transactions"
    )
    initiated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="payos_transactions_initiated",
    )
    amount = models.PositiveBigIntegerField()
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    checkout_url = models.URLField(max_length=500, blank=True)
    payos_reference = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payos_transactions"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["invoice", "status", "created_at"],
                name="idx_payos_invoice_status",
            )
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0), name="ck_payos_amount_positive"
            )
        ]
