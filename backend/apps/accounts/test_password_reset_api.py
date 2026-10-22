import hashlib
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

from django.core import mail
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import PasswordResetToken, User
from .serializers import token_pair_for_user


class PasswordResetAPITests(APITestCase):
    def setUp(self):
        cache.clear()
        self.old_password = "OldStrongPassword!2026"
        self.new_password = "NewStrongPassword!2026"
        self.user = User.objects.create_user(
            email="patient@example.com",
            password=self.old_password,
            full_name="Bệnh nhân thử nghiệm",
        )
        self.request_url = reverse("accounts:password-reset-request")
        self.confirm_url = reverse("accounts:password-reset-confirm")

    def request_reset(self, email="patient@example.com"):
        return self.client.post(self.request_url, {"email": email}, format="json")

    def raw_token_from_latest_email(self):
        reset_url = mail.outbox[-1].body.splitlines()[-1]
        return parse_qs(urlparse(reset_url).query)["token"][0]

    def confirm_reset(self, token, **overrides):
        data = {
            "token": token,
            "new_password": self.new_password,
            "new_password_confirm": self.new_password,
            **overrides,
        }
        return self.client.post(self.confirm_url, data, format="json")

    def test_request_sends_link_and_stores_only_token_digest(self):
        response = self.request_reset(email="Patient@Example.COM")

        raw_token = self.raw_token_from_latest_email()
        token_record = PasswordResetToken.objects.get()
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/reset-password?token=", mail.outbox[0].body)
        self.assertNotEqual(token_record.token_digest, raw_token)
        self.assertEqual(
            token_record.token_digest,
            hashlib.sha256(raw_token.encode()).hexdigest(),
        )

    def test_request_for_unknown_email_returns_same_response_without_email(self):
        existing_response = self.request_reset()
        existing_message = existing_response.data
        mail.outbox.clear()

        missing_response = self.request_reset("missing@example.com")

        self.assertEqual(missing_response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(missing_response.data, existing_message)
        self.assertEqual(len(mail.outbox), 0)

    def test_confirm_changes_password_and_token_cannot_be_reused(self):
        self.request_reset()
        raw_token = self.raw_token_from_latest_email()

        first_response = self.confirm_reset(raw_token)
        second_response = self.confirm_reset(raw_token)

        self.user.refresh_from_db()
        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertTrue(self.user.check_password(self.new_password))
        self.assertIsNotNone(PasswordResetToken.objects.get().used_at)
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_expired_token_is_rejected(self):
        self.request_reset()
        raw_token = self.raw_token_from_latest_email()
        PasswordResetToken.objects.update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )

        response = self.confirm_reset(raw_token)

        self.user.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(self.user.check_password(self.old_password))

    def test_weak_password_is_rejected_without_consuming_token(self):
        self.request_reset()
        raw_token = self.raw_token_from_latest_email()

        response = self.confirm_reset(
            raw_token,
            new_password="123",
            new_password_confirm="123",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", response.data)
        self.assertIsNone(PasswordResetToken.objects.get().used_at)

    def test_password_confirmation_must_match(self):
        self.request_reset()
        raw_token = self.raw_token_from_latest_email()

        response = self.confirm_reset(
            raw_token,
            new_password_confirm="DifferentStrongPassword!2026",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password_confirm", response.data)

    def test_new_request_invalidates_previous_token(self):
        self.request_reset()
        first_token = self.raw_token_from_latest_email()
        self.request_reset()
        second_token = self.raw_token_from_latest_email()

        first_response = self.confirm_reset(first_token)
        second_response = self.confirm_reset(second_token)

        self.assertEqual(first_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)

    def test_database_allows_only_one_unused_token_per_user(self):
        self.request_reset()

        with self.assertRaises(IntegrityError), transaction.atomic():
            PasswordResetToken.objects.create(
                user=self.user,
                token_digest="f" * 64,
                expires_at=timezone.now() + timedelta(minutes=60),
            )

    def test_password_reset_revokes_existing_jwt_tokens(self):
        tokens = token_pair_for_user(self.user)
        self.request_reset()
        raw_token = self.raw_token_from_latest_email()

        self.confirm_reset(raw_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        access_response = self.client.get(reverse("accounts:me"))
        self.client.credentials()
        refresh_response = self.client.post(
            reverse("accounts:token-refresh"),
            {"refresh": tokens["refresh"]},
            format="json",
        )

        self.assertEqual(access_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_inactive_account_does_not_receive_reset_email(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])

        response = self.request_reset()

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(len(mail.outbox), 0)
        self.assertFalse(PasswordResetToken.objects.exists())
