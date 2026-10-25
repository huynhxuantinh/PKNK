from datetime import timedelta
from decimal import Decimal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured, ValidationError
from django.db import transaction
from django.utils import timezone
from payos import PayOS
from payos.types import CreatePaymentLinkRequest

from apps.audit.services import AuditService

from .models import Invoice, Payment, PayosTransaction
from .services import BillingService


FRESH_CHECKOUT_WINDOW = timedelta(minutes=15)


def get_payos_client():
    credentials = (
        settings.PAYOS_CLIENT_ID,
        settings.PAYOS_API_KEY,
        settings.PAYOS_CHECKSUM_KEY,
    )
    if not all(credentials):
        raise ImproperlyConfigured("payOS chưa được cấu hình đầy đủ.")
    return PayOS(
        client_id=settings.PAYOS_CLIENT_ID,
        api_key=settings.PAYOS_API_KEY,
        checksum_key=settings.PAYOS_CHECKSUM_KEY,
    )


def _with_invoice_id(url, invoice_id):
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["invoice"] = str(invoice_id)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _whole_vnd(invoice):
    amount = Decimal(invoice.total)
    if amount <= 0 or amount != amount.to_integral_value():
        raise ValidationError("Số tiền hóa đơn phải là số VND nguyên dương.")
    return int(amount)


def create_checkout(*, invoice, user):
    amount = _whole_vnd(invoice)
    fresh_after = timezone.now() - FRESH_CHECKOUT_WINDOW
    reusable = invoice.payos_transactions.filter(
        status=PayosTransaction.Status.PENDING,
        checkout_url__gt="",
        created_at__gte=fresh_after,
    ).first()
    if reusable:
        return reusable, False

    payos_transaction = PayosTransaction.objects.create(
        invoice=invoice,
        initiated_by=user,
        amount=amount,
    )
    payment_data = CreatePaymentLinkRequest(
        order_code=payos_transaction.order_code,
        amount=amount,
        description=f"DV{payos_transaction.order_code}"[-9:],
        return_url=_with_invoice_id(settings.PAYOS_RETURN_URL, invoice.pk),
        cancel_url=_with_invoice_id(settings.PAYOS_CANCEL_URL, invoice.pk),
    )
    response = get_payos_client().payment_requests.create(payment_data=payment_data)
    payos_transaction.checkout_url = response.checkout_url
    payos_transaction.payos_reference = response.payment_link_id
    payos_transaction.save(
        update_fields=["checkout_url", "payos_reference", "updated_at"]
    )
    return payos_transaction, True


def _mark_for_review(payos_transaction, *, reason):
    payos_transaction.status = PayosTransaction.Status.NEEDS_REVIEW
    payos_transaction.save(update_fields=["status", "updated_at"])
    invoice = payos_transaction.invoice
    AuditService.record_write(
        actor_user=payos_transaction.initiated_by,
        organization=invoice.branch.organization,
        branch=invoice.branch,
        action="PAYOS_PAYMENT_NEEDS_REVIEW",
        resource_type="PayosTransaction",
        resource_id=payos_transaction.pk,
        after_data={"reason": reason, "invoice_id": invoice.pk},
    )


@transaction.atomic
def apply_verified_payment(*, order_code, amount, reference=""):
    try:
        payos_transaction = PayosTransaction.objects.select_for_update().select_related(
            "invoice__branch__organization", "initiated_by"
        ).get(pk=order_code)
    except PayosTransaction.DoesNotExist:
        return "IGNORED"
    if payos_transaction.status == PayosTransaction.Status.SUCCEEDED:
        return "SUCCEEDED"
    if int(amount) != payos_transaction.amount:
        _mark_for_review(payos_transaction, reason="AMOUNT_MISMATCH")
        return "NEEDS_REVIEW"
    try:
        BillingService.post_payment(
            invoice_id=payos_transaction.invoice_id,
            method=Payment.Method.BANK_TRANSFER,
            amount=Decimal(payos_transaction.amount),
            idempotency_key=f"payos:{payos_transaction.order_code}",
            actor_user=payos_transaction.initiated_by,
            external_reference=str(reference)[:100],
        )
    except ValidationError:
        _mark_for_review(payos_transaction, reason="INVOICE_STATE_CONFLICT")
        return "NEEDS_REVIEW"
    payos_transaction.status = PayosTransaction.Status.SUCCEEDED
    payos_transaction.payos_reference = str(reference)[:100]
    payos_transaction.save(
        update_fields=["status", "payos_reference", "updated_at"]
    )
    return "SUCCEEDED"


def apply_remote_status(payos_transaction, payment_link):
    if payment_link.status == "PAID":
        transactions = list(payment_link.transactions or [])
        reference = transactions[-1].reference if transactions else payment_link.id
        return apply_verified_payment(
            order_code=payos_transaction.order_code,
            amount=payment_link.amount_paid,
            reference=reference,
        )
    if payment_link.status in {"CANCELLED", "EXPIRED", "FAILED"}:
        PayosTransaction.objects.filter(
            pk=payos_transaction.pk, status=PayosTransaction.Status.PENDING
        ).update(status=PayosTransaction.Status.CANCELLED, updated_at=timezone.now())
        return "CANCELLED"
    return "PENDING"
