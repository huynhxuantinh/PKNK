from datetime import timedelta

from celery import shared_task
from django.core.exceptions import ImproperlyConfigured
from django.utils import timezone

from .models import PayosTransaction
from .payos_service import apply_remote_status, get_payos_client


@shared_task
def reconcile_pending_payos_transactions():
    stale_before = timezone.now() - timedelta(minutes=5)
    pending = list(
        PayosTransaction.objects.filter(
            status=PayosTransaction.Status.PENDING,
            checkout_url__gt="",
            created_at__lte=stale_before,
        ).order_by("created_at")[:100]
    )
    if not pending:
        return 0
    try:
        client = get_payos_client()
    except ImproperlyConfigured:
        return 0
    processed = 0
    for item in pending:
        payment_link = client.payment_requests.get(item.order_code)
        apply_remote_status(item, payment_link)
        processed += 1
    return processed
