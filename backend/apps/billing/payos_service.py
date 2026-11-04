from datetime import timedelta
from decimal import Decimal
import logging
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured, ValidationError
from django.db import transaction
from django.utils import timezone
from payos import PayOS, PayOSError
from payos.types import CreatePaymentLinkRequest

from apps.audit.services import AuditService

from .models import Invoice, Payment, PayosTransaction


FRESH_CHECKOUT_WINDOW = timedelta(minutes=15)
logger = logging.getLogger(__name__)


class PayosCheckoutUnavailable(Exception):
    pass


class PayosCancellationUnavailable(Exception):
    pass


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


def _retire_previous_checkouts(invoice):
    """Verify every unreused payment link before issuing a replacement."""
    pending = list(
        PayosTransaction.objects.select_for_update().filter(
            invoice=invoice,
            status__in=[
                PayosTransaction.Status.PENDING,
                PayosTransaction.Status.NEEDS_REVIEW,
            ],
        )
    )
    if not pending:
        return

    try:
        client = get_payos_client()
        for item in pending:
            payment_link = client.payment_requests.get(item.order_code)
            if item.status == PayosTransaction.Status.NEEDS_REVIEW:
                if payment_link.status in {"CANCELLED", "EXPIRED", "FAILED"}:
                    item.status = PayosTransaction.Status.CANCELLED
                    item.save(update_fields=["status", "updated_at"])
                    continue
                raise PayosCheckoutUnavailable(
                    "Giao dịch payOS trước đó cần được đối soát trước khi tạo link mới."
                )
            outcome = apply_remote_status(item, payment_link)
            invoice.refresh_from_db(fields=["status", "paid_at"])
            if outcome == "NEEDS_REVIEW":
                raise PayosCheckoutUnavailable(
                    "Giao dịch payOS trước đó cần được kiểm tra."
                )
            if invoice.status == Invoice.Status.PAID or outcome == "SUCCEEDED":
                raise ValidationError("Hóa đơn đã được thanh toán qua payOS.")
            if outcome == "CANCELLED":
                continue

            payment_link = client.payment_requests.cancel(
                item.order_code,
                cancellation_reason="Replacing expired payment link",
            )
            outcome = apply_remote_status(item, payment_link)
            invoice.refresh_from_db(fields=["status", "paid_at"])
            if invoice.status == Invoice.Status.PAID or outcome == "SUCCEEDED":
                raise ValidationError("Hóa đơn đã được thanh toán qua payOS.")
            if outcome != "CANCELLED":
                raise PayosCheckoutUnavailable(
                    "payOS không xác nhận link cũ đã hết hiệu lực hoặc được hủy."
                )
    except (PayOSError, httpx.RequestError, ImproperlyConfigured) as error:
        raise PayosCheckoutUnavailable(
            "Không thể kiểm tra hoặc hủy link payOS cũ."
        ) from error


def create_checkout(*, invoice, user):
    provider_error = None
    with transaction.atomic():
        invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
        if invoice.status != Invoice.Status.ISSUED:
            raise ValidationError("Hóa đơn không còn ở trạng thái chờ thanh toán.")
        amount = _whole_vnd(invoice)
        fresh_after = timezone.now() - FRESH_CHECKOUT_WINDOW
        reusable = invoice.payos_transactions.filter(
            status=PayosTransaction.Status.PENDING,
            checkout_url__gt="",
            created_at__gte=fresh_after,
        ).first()
        if reusable:
            return reusable, False

        _retire_previous_checkouts(invoice)
        invoice.refresh_from_db(fields=["status"])
        if invoice.status != Invoice.Status.ISSUED:
            raise ValidationError("Hóa đơn không còn ở trạng thái chờ thanh toán.")

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
        try:
            response = get_payos_client().payment_requests.create(
                payment_data=payment_data
            )
        except (PayOSError, httpx.RequestError) as error:
            # A timeout can happen after payOS has accepted the order. Never
            # label that outcome as cancelled until the remote order is known.
            try:
                payment_link = get_payos_client().payment_requests.get(
                    payos_transaction.order_code
                )
            except (PayOSError, httpx.RequestError, ImproperlyConfigured):
                _mark_for_review(
                    payos_transaction,
                    reason="CHECKOUT_CREATION_OUTCOME_UNKNOWN",
                )
            else:
                if payment_link.status in {"CANCELLED", "EXPIRED", "FAILED"}:
                    apply_remote_status(payos_transaction, payment_link)
                else:
                    _mark_for_review(
                        payos_transaction,
                        reason="CHECKOUT_CREATION_OUTCOME_UNKNOWN",
                    )
            provider_error = error
        else:
            payos_transaction.checkout_url = response.checkout_url
            payos_transaction.qr_code = getattr(response, "qr_code", "")
            payos_transaction.payos_reference = response.payment_link_id
            payos_transaction.save(
                update_fields=["checkout_url", "qr_code", "payos_reference", "updated_at"]
            )
            return payos_transaction, True

    raise PayosCheckoutUnavailable("Không thể kết nối payOS.") from provider_error


def cancel_pending_checkouts(invoice, *, cancellation_reason="Invoice voided"):
    pending = list(
        PayosTransaction.objects.select_for_update().filter(
            invoice=invoice,
            status=PayosTransaction.Status.PENDING,
        )
    )
    with_checkout_url = [item for item in pending if item.checkout_url]
    try:
        client = get_payos_client() if with_checkout_url else None
        for item in with_checkout_url:
            try:
                payment_link = client.payment_requests.cancel(
                    item.order_code,
                    cancellation_reason=cancellation_reason,
                )
            except (PayOSError, httpx.RequestError):
                payment_link = client.payment_requests.get(item.order_code)
                if payment_link.status in {"CANCELLED", "EXPIRED"}:
                    continue
                if payment_link.status == "PAID":
                    apply_remote_status(item, payment_link)
                    raise PayosCancellationUnavailable(
                        "Link payOS đã được thanh toán."
                    )
                raise PayosCancellationUnavailable(
                    "Link payOS vẫn chưa được hủy."
                )
            if payment_link.status == "PAID":
                apply_remote_status(item, payment_link)
                raise PayosCancellationUnavailable(
                    "Link payOS đã được thanh toán."
                )
            if payment_link.status != "CANCELLED":
                raise PayosCancellationUnavailable(
                    "payOS không xác nhận link đã được hủy."
                )
    except (PayOSError, httpx.RequestError, ImproperlyConfigured) as error:
        raise PayosCancellationUnavailable("Không thể hủy link payOS.") from error

    for item in pending:
        item.status = PayosTransaction.Status.CANCELLED
        item.save(update_fields=["status", "updated_at"])


def resolve_pending_checkouts_for_cash(invoice):
    """Synchronize and cancel payOS checkouts before counter cash payment."""
    pending = list(
        PayosTransaction.objects.select_for_update().filter(
            invoice=invoice,
            status=PayosTransaction.Status.PENDING,
        )
    )
    if not pending:
        return

    with_checkout_url = [item for item in pending if item.checkout_url]
    try:
        client = get_payos_client() if with_checkout_url else None
        for item in with_checkout_url:
            outcome = apply_remote_status(
                item, client.payment_requests.get(item.order_code)
            )
            invoice.refresh_from_db(fields=["status", "paid_at"])
            if outcome == "SUCCEEDED" or invoice.status == Invoice.Status.PAID:
                raise ValidationError("Hóa đơn đã được thanh toán qua payOS.")
            if outcome == "NEEDS_REVIEW":
                raise ValidationError(
                    "Giao dịch payOS cần được kiểm tra trước khi thu tiền mặt."
                )
        cancel_pending_checkouts(
            invoice,
            cancellation_reason="Cash payment at counter",
        )
    except PayosCancellationUnavailable as error:
        invoice.refresh_from_db(fields=["status", "paid_at"])
        if invoice.status == Invoice.Status.PAID:
            raise ValidationError("Hóa đơn đã được thanh toán qua payOS.") from error
        raise ValidationError(
            "Không thể xác nhận tiền mặt khi link payOS chưa được hủy."
        ) from error
    except (PayOSError, httpx.RequestError, ImproperlyConfigured) as error:
        raise ValidationError(
            "Không thể đối soát link payOS trước khi thu tiền mặt."
        ) from error

    invoice.refresh_from_db(fields=["status", "paid_at"])
    if invoice.status != Invoice.Status.ISSUED:
        raise ValidationError("Hóa đơn không còn ở trạng thái chờ thanh toán.")


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
def resolve_review_transaction(*, order_code, action, reason, actor_user, received_amount=None, payos_reference=""):
    """Resolve a flagged payment only after an explicit staff verification."""
    from .services import BillingService

    transaction_probe = PayosTransaction.objects.only("invoice_id").get(
        pk=order_code
    )
    # Keep the same lock order as webhook processing: invoice, then checkout.
    Invoice.objects.select_for_update().get(pk=transaction_probe.invoice_id)
    payos_transaction = PayosTransaction.objects.select_for_update().select_related(
        "invoice__branch__organization"
    ).get(pk=order_code)
    if payos_transaction.status != PayosTransaction.Status.NEEDS_REVIEW:
        raise ValidationError("Giao dịch không còn ở trạng thái cần đối soát.")

    invoice = payos_transaction.invoice
    if action == "CONFIRM_RECEIVED":
        if received_amount != payos_transaction.amount:
            raise ValidationError("Số tiền thực nhận không khớp với giao dịch payOS.")
        try:
            BillingService.post_payment(
                invoice_id=invoice.pk,
                method=Payment.Method.BANK_TRANSFER,
                amount=Decimal(received_amount),
                idempotency_key=f"payos:{payos_transaction.order_code}",
                actor_user=actor_user,
                external_reference=payos_reference,
            )
        except ValidationError as error:
            raise ValidationError("Không thể xác nhận tiền thực nhận cho hóa đơn này.") from error
        payos_transaction.status = PayosTransaction.Status.SUCCEEDED
        payos_transaction.payos_reference = payos_reference[:100]
        audit_action = "PAYOS_REVIEW_CONFIRMED"
    else:
        try:
            client = get_payos_client()
            payment_link = client.payment_requests.get(payos_transaction.order_code)
            if payment_link.status not in {"CANCELLED", "EXPIRED", "FAILED"}:
                payment_link = client.payment_requests.cancel(
                    payos_transaction.order_code,
                    cancellation_reason="Review resolved: payment not received",
                )
            if payment_link.status == "PAID":
                raise ValidationError(
                    "Link payOS đã nhận thanh toán; cần xác nhận tiền thực nhận."
                )
            if payment_link.status not in {"CANCELLED", "EXPIRED", "FAILED"}:
                raise ValidationError(
                    "payOS chưa xác nhận link đã hết hiệu lực hoặc được hủy."
                )
        except (PayOSError, httpx.RequestError, ImproperlyConfigured) as error:
            raise ValidationError(
                "Không thể kiểm tra hoặc hủy link payOS trước khi xử lý."
            ) from error
        payos_transaction.status = PayosTransaction.Status.CANCELLED
        audit_action = "PAYOS_REVIEW_REJECTED"

    update_fields = ["status", "updated_at"]
    if action == "CONFIRM_RECEIVED":
        update_fields.append("payos_reference")
    payos_transaction.save(update_fields=update_fields)
    AuditService.record_write(
        actor_user=actor_user,
        organization=payos_transaction.invoice.branch.organization,
        branch=payos_transaction.invoice.branch,
        action=audit_action,
        resource_type="PayosTransaction",
        resource_id=payos_transaction.pk,
        after_data={
            "reason": reason,
            "invoice_id": payos_transaction.invoice_id,
            "received_amount": received_amount,
            "payos_reference": payos_reference or payos_transaction.payos_reference,
        },
    )
    return payos_transaction


@transaction.atomic
def apply_verified_payment(*, order_code, amount, reference=""):
    from .services import BillingService

    try:
        transaction_probe = PayosTransaction.objects.only("pk", "invoice_id").get(
            pk=order_code
        )
    except PayosTransaction.DoesNotExist:
        return "IGNORED"
    # Use the same lock order as counter cash payment: invoice, then checkout.
    Invoice.objects.select_for_update().get(pk=transaction_probe.invoice_id)
    payos_transaction = PayosTransaction.objects.select_for_update().select_related(
        "invoice__branch__organization", "initiated_by"
    ).get(pk=transaction_probe.pk)
    if payos_transaction.status == PayosTransaction.Status.SUCCEEDED:
        return "SUCCEEDED"
    if payos_transaction.status == PayosTransaction.Status.NEEDS_REVIEW:
        return "NEEDS_REVIEW"
    if payos_transaction.status == PayosTransaction.Status.CANCELLED:
        # Older clients marked an unknown checkout outcome as cancelled. A
        # signed success webhook is evidence worth manual reconciliation, not
        # something to silently discard or auto-post as a payment.
        _mark_for_review(payos_transaction, reason="PAYMENT_AFTER_CANCELLATION")
        return "NEEDS_REVIEW"
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
    transaction.on_commit(
        lambda: _cancel_remaining_checkouts_after_payment(
            invoice_id=payos_transaction.invoice_id,
        )
    )
    return "SUCCEEDED"


def _cancel_remaining_checkouts_after_payment(*, invoice_id):
    """Best-effort cancellation after a payment; webhooks remain idempotent."""
    try:
        with transaction.atomic():
            invoice = Invoice.objects.select_for_update().get(pk=invoice_id)
            if invoice.status != Invoice.Status.PAID:
                return
            cancel_pending_checkouts(
                invoice,
                cancellation_reason="Invoice paid through another payOS link",
            )
    except (PayosCancellationUnavailable, PayOSError, httpx.RequestError, ImproperlyConfigured):
        logger.warning(
            "Could not cancel remaining payOS links for paid invoice_id=%s",
            invoice_id,
        )


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
