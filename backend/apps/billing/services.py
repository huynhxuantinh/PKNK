import uuid
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.audit.services import AuditService
from apps.notifications.models import Notification
from apps.notifications.services import NotificationService
from apps.scheduling.models import Appointment

from .models import Invoice, InvoiceLine, Payment
from .payos_service import PayosCancellationUnavailable, cancel_pending_checkouts


def _is_whole_vnd(value):
    return Decimal(value) == Decimal(value).to_integral_value()


class BillingService:
    @staticmethod
    def _audit(invoice, *, actor_user, action, before, after, request):
        AuditService.record_write(
            actor_user=actor_user,
            organization=invoice.branch.organization,
            branch=invoice.branch,
            action=action,
            resource_type="Invoice",
            resource_id=invoice.pk,
            before_data=before,
            after_data=after,
            request=request,
        )

    @classmethod
    @transaction.atomic
    def create_invoice(cls, *, appointment_id, actor_user, replacement_for_id=None, request=None):
        appointment = Appointment.objects.select_for_update().select_related(
            "branch__organization", "patient_profile", "branch_service__service"
        ).get(pk=appointment_id)
        if appointment.status != Appointment.Status.COMPLETED:
            raise ValidationError("Chỉ lập hóa đơn cho lượt khám đã hoàn thành.")
        if Invoice.objects.filter(appointment=appointment).exclude(status=Invoice.Status.VOID).exists():
            raise ValidationError("Lượt khám đã có hóa đơn chưa VOID.")
        replacement = None
        if replacement_for_id is not None:
            replacement = Invoice.objects.select_for_update().filter(
                pk=replacement_for_id, appointment=appointment, status=Invoice.Status.VOID
            ).first()
            if replacement is None:
                raise ValidationError("Hóa đơn được thay thế không hợp lệ.")
        price = appointment.service_price_snapshot
        if price <= 0 or not _is_whole_vnd(price):
            raise ValidationError("Giá dịch vụ đã chốt phải là số VND nguyên và lớn hơn 0.")
        invoice = Invoice.objects.create(
            appointment=appointment,
            branch=appointment.branch,
            patient_profile=appointment.patient_profile,
            replacement_for=replacement,
            invoice_number=f"INV-{uuid.uuid4().hex[:24].upper()}",
            subtotal=price,
            total=price,
            created_by=actor_user,
        )
        service = appointment.branch_service.service
        InvoiceLine.objects.create(
            invoice=invoice,
            service=service,
            service_code_snapshot=service.code,
            description=appointment.service_name_snapshot,
            quantity=1,
            unit_price=price,
            line_total=price,
        )
        cls._audit(
            invoice, actor_user=actor_user, action="INVOICE_CREATED",
            before={}, after={"status": invoice.status, "appointment_id": appointment.pk},
            request=request,
        )
        return invoice

    @classmethod
    @transaction.atomic
    def update_draft(cls, *, invoice_id, actor_user, discount=None, lines=None, request=None):
        invoice = Invoice.objects.select_for_update().select_related(
            "branch__organization"
        ).get(pk=invoice_id)
        if invoice.status != Invoice.Status.DRAFT:
            raise ValidationError("Chỉ hóa đơn DRAFT mới được sửa.")
        before = {"subtotal": str(invoice.subtotal), "discount": str(invoice.discount), "total": str(invoice.total)}
        if lines is not None:
            InvoiceLine.objects.filter(invoice=invoice).delete()
            rows = []
            for item in lines:
                service = item.get("service")
                if service and service.organization_id != invoice.branch.organization_id:
                    raise ValidationError("Dịch vụ không thuộc organization của hóa đơn.")
                unit_price = item["unit_price"]
                quantity = item["quantity"]
                if not _is_whole_vnd(unit_price):
                    raise ValidationError("Đơn giá VND không được có phần lẻ.")
                rows.append(InvoiceLine(
                    invoice=invoice,
                    service=service,
                    service_code_snapshot=service.code if service else "",
                    description=item["description"].strip(),
                    quantity=quantity,
                    unit_price=unit_price,
                    line_total=unit_price * quantity,
                ))
            InvoiceLine.objects.bulk_create(rows)
        subtotal = InvoiceLine.objects.filter(invoice=invoice).aggregate(
            value=Sum("line_total")
        )["value"] or Decimal("0")
        next_discount = invoice.discount if discount is None else discount
        if not _is_whole_vnd(next_discount):
            raise ValidationError("Giảm giá VND không được có phần lẻ.")
        if next_discount < 0 or next_discount > subtotal:
            raise ValidationError("Giảm giá phải từ 0 đến subtotal.")
        invoice.subtotal = subtotal
        invoice.discount = next_discount
        invoice.total = subtotal - next_discount
        invoice.save(update_fields=["subtotal", "discount", "total", "updated_at"])
        cls._audit(
            invoice, actor_user=actor_user, action="INVOICE_DRAFT_UPDATED",
            before=before,
            after={"subtotal": str(invoice.subtotal), "discount": str(invoice.discount), "total": str(invoice.total)},
            request=request,
        )
        return invoice

    @classmethod
    @transaction.atomic
    def issue_invoice(cls, *, invoice_id, actor_user, request=None):
        invoice = Invoice.objects.select_for_update().select_related("branch__organization").get(pk=invoice_id)
        if invoice.status != Invoice.Status.DRAFT:
            raise ValidationError("Chỉ hóa đơn DRAFT mới được phát hành.")
        if not invoice.lines.exists() or invoice.total <= 0:
            raise ValidationError("Hóa đơn phải có dòng chi tiết và tổng tiền lớn hơn 0.")
        if not all(_is_whole_vnd(value) for value in (invoice.subtotal, invoice.discount, invoice.total)):
            raise ValidationError("Số tiền VND không được có phần lẻ.")
        invoice.status = Invoice.Status.ISSUED
        invoice.issued_by = actor_user
        invoice.issued_at = timezone.now()
        invoice.save(update_fields=["status", "issued_by", "issued_at", "updated_at"])
        NotificationService.publish_invoice_event(
            invoice=invoice,
            event_type=Notification.Type.INVOICE_ISSUED,
            event_suffix=invoice.issued_at.isoformat(),
        )
        cls._audit(invoice, actor_user=actor_user, action="INVOICE_ISSUED", before={"status": "DRAFT"}, after={"status": "ISSUED"}, request=request)
        return invoice

    @classmethod
    @transaction.atomic
    def void_invoice(cls, *, invoice_id, reason, actor_user, request=None):
        invoice = Invoice.objects.select_for_update().select_related("branch__organization").get(pk=invoice_id)
        if invoice.status not in {Invoice.Status.DRAFT, Invoice.Status.ISSUED}:
            raise ValidationError("Chỉ hóa đơn DRAFT hoặc ISSUED mới được VOID.")
        if invoice.payments.filter(status=Payment.Status.POSTED).exists():
            raise ValidationError("Phải VOID payment trước khi VOID hóa đơn.")
        try:
            cancel_pending_checkouts(invoice)
        except PayosCancellationUnavailable as error:
            raise ValidationError(
                "Không thể hủy link thanh toán payOS đang hoạt động; hóa đơn chưa được hủy."
            ) from error
        old_status = invoice.status
        invoice.status = Invoice.Status.VOID
        invoice.voided_by = actor_user
        invoice.voided_at = timezone.now()
        invoice.void_reason = reason.strip()
        invoice.save(update_fields=["status", "voided_by", "voided_at", "void_reason", "updated_at"])
        cls._audit(invoice, actor_user=actor_user, action="INVOICE_VOIDED", before={"status": old_status}, after={"status": "VOID"}, request=request)
        return invoice

    @classmethod
    @transaction.atomic
    def post_payment(cls, *, invoice_id, method, amount, idempotency_key, actor_user, external_reference="", request=None):
        existing = Payment.objects.select_related("invoice").filter(idempotency_key=idempotency_key).first()
        if existing:
            if existing.invoice_id != invoice_id:
                raise ValidationError("Idempotency key đã được dùng cho hóa đơn khác.")
            return existing, False
        invoice = Invoice.objects.select_for_update().select_related("branch__organization").get(pk=invoice_id)
        if invoice.status != Invoice.Status.ISSUED:
            raise ValidationError("Chỉ hóa đơn ISSUED mới được thanh toán.")
        if amount != invoice.total or not _is_whole_vnd(amount):
            raise ValidationError("MVP yêu cầu thanh toán đúng toàn bộ số tiền hóa đơn bằng VND nguyên.")
        now = timezone.now()
        payment = Payment.objects.create(
            invoice=invoice,
            payment_number=f"PAY-{uuid.uuid4().hex[:24].upper()}",
            method=method,
            amount=amount,
            external_reference=external_reference.strip(),
            idempotency_key=idempotency_key,
            posted_by=actor_user,
            posted_at=now,
        )
        invoice.status = Invoice.Status.PAID
        invoice.paid_at = now
        invoice.save(update_fields=["status", "paid_at", "updated_at"])
        NotificationService.publish_invoice_event(
            invoice=invoice,
            event_type=Notification.Type.INVOICE_PAID,
            event_suffix=f"payment:{payment.pk}",
        )
        cls._audit(invoice, actor_user=actor_user, action="PAYMENT_POSTED", before={"status": "ISSUED"}, after={"status": "PAID", "payment_id": payment.pk}, request=request)
        return payment, True

    @classmethod
    @transaction.atomic
    def void_payment(cls, *, payment_id, reason, actor_user, request=None):
        payment = Payment.objects.select_for_update().select_related("invoice__branch__organization").get(pk=payment_id)
        invoice = Invoice.objects.select_for_update().get(pk=payment.invoice_id)
        if payment.idempotency_key.startswith("payos:"):
            raise ValidationError(
                "Thanh toán payOS phải hoàn tiền thực tế qua quy trình riêng trước khi điều chỉnh hóa đơn."
            )
        if payment.status != Payment.Status.POSTED or invoice.status != Invoice.Status.PAID:
            raise ValidationError("Chỉ payment POSTED của hóa đơn PAID mới được VOID.")
        payment.status = Payment.Status.VOID
        payment.voided_by = actor_user
        payment.voided_at = timezone.now()
        payment.void_reason = reason.strip()
        payment.save(update_fields=["status", "voided_by", "voided_at", "void_reason"])
        invoice.status = Invoice.Status.ISSUED
        invoice.paid_at = None
        invoice.save(update_fields=["status", "paid_at", "updated_at"])
        cls._audit(invoice, actor_user=actor_user, action="PAYMENT_VOIDED", before={"status": "PAID"}, after={"status": "ISSUED", "payment_id": payment.pk}, request=request)
        return payment
