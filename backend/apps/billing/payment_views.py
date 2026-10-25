from django.core.exceptions import ImproperlyConfigured
from payos import PayOSError, WebhookError
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .payos_service import apply_verified_payment, get_payos_client


class PayosWebhookAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            webhook_data = get_payos_client().webhooks.verify(request.body)
        except (WebhookError, PayOSError, ImproperlyConfigured, ValueError, TypeError):
            return Response(
                {"message": "Chữ ký webhook không hợp lệ."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        outcome = apply_verified_payment(
            order_code=webhook_data.order_code,
            amount=webhook_data.amount,
            reference=webhook_data.reference,
        )
        return Response({"message": "Webhook đã được tiếp nhận.", "result": outcome})
