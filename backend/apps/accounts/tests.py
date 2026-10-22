import hashlib
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

from django.core import mail
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditEvent

from .models import ConsentRecord, EmailVerificationToken, PatientProfile, User


class UserModelTests(TestCase):
    def test_manager_normalizes_email_to_lowercase(self):
        user = User.objects.create_user(
            email="Patient@Example.COM",
            password="safe-test-password",
            full_name="Bệnh nhân thử nghiệm",
        )

        self.assertEqual(user.email, "patient@example.com")

    def test_email_is_case_insensitively_unique(self):
        User.objects.create_user(
            email="patient@example.com",
            password="safe-test-password",
            full_name="Bệnh nhân thứ nhất",
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create(
                email="PATIENT@example.com",
                password="unusable-for-this-test",
                full_name="Bệnh nhân thứ hai",
            )


class AuthenticationAPITests(APITestCase):
    registration_data = {
        "email": "Patient@Example.COM",
        "full_name": "Bệnh nhân thử nghiệm",
        "phone": "0901234567",
        "password": "StrongPassword!2026",
        "password_confirm": "StrongPassword!2026",
        "consent_to_data_processing": True,
    }

    def setUp(self):
        cache.clear()

    def register(self, **overrides):
        data = {**self.registration_data, **overrides}
        return self.client.post(reverse("accounts:register"), data, format="json")

    def verification_token_from_latest_email(self):
        verification_url = mail.outbox[-1].body.splitlines()[-1]
        return parse_qs(urlparse(verification_url).query)["token"][0]

    def test_register_creates_patient_consent_and_tokens(self):
        response = self.register()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="patient@example.com")
        self.assertTrue(user.check_password(self.registration_data["password"]))
        self.assertEqual(PatientProfile.objects.get(user=user).phone, "0901234567")
        self.assertTrue(
            ConsentRecord.objects.filter(user=user, is_granted=True).exists()
        )
        self.assertIn("access", response.data["data"]["tokens"])
        self.assertIn("refresh", response.data["data"]["tokens"])

    def test_register_sends_verification_link_without_storing_raw_token(self):
        self.register()

        raw_token = self.verification_token_from_latest_email()
        token_record = EmailVerificationToken.objects.get()

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/verify-email?token=", mail.outbox[0].body)
        self.assertNotEqual(token_record.token_digest, raw_token)
        self.assertEqual(
            token_record.token_digest,
            hashlib.sha256(raw_token.encode()).hexdigest(),
        )

    def test_valid_token_verifies_email_and_cannot_be_reused(self):
        self.register()
        raw_token = self.verification_token_from_latest_email()

        first_response = self.client.post(
            reverse("accounts:email-verification-confirm"),
            {"token": raw_token},
            format="json",
        )
        second_response = self.client.post(
            reverse("accounts:email-verification-confirm"),
            {"token": raw_token},
            format="json",
        )

        user = User.objects.get(email="patient@example.com")
        token_record = EmailVerificationToken.objects.get()
        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(user.email_verified_at)
        self.assertIsNotNone(token_record.used_at)
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_expired_verification_token_is_rejected(self):
        self.register()
        raw_token = self.verification_token_from_latest_email()
        EmailVerificationToken.objects.update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )

        response = self.client.post(
            reverse("accounts:email-verification-confirm"),
            {"token": raw_token},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIsNone(User.objects.get().email_verified_at)

    def test_resend_verification_invalidates_previous_token(self):
        register_response = self.register()
        first_raw_token = self.verification_token_from_latest_email()
        access = register_response.data["data"]["tokens"]["access"]
        mail.outbox.clear()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        response = self.client.post(
            reverse("accounts:email-verification-resend"),
            format="json",
        )
        second_raw_token = self.verification_token_from_latest_email()

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertNotEqual(first_raw_token, second_raw_token)
        self.assertIsNotNone(
            EmailVerificationToken.objects.get(
                token_digest=hashlib.sha256(first_raw_token.encode()).hexdigest()
            ).used_at
        )

    def test_register_requires_data_processing_consent(self):
        response = self.register(consent_to_data_processing=False)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.exists())

    def test_register_rejects_duplicate_email_case_insensitively(self):
        self.register()

        response = self.register(email="PATIENT@example.com")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(User.objects.count(), 1)

    def test_register_rejects_weak_password(self):
        response = self.register(password="123", password_confirm="123")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.exists())

    def test_login_returns_tokens_and_user(self):
        self.register()

        response = self.client.post(
            reverse("accounts:login"),
            {"email": "PATIENT@EXAMPLE.COM", "password": "StrongPassword!2026"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["user"]["email"], "patient@example.com")
        self.assertIn("access", response.data["data"]["tokens"])
        self.assertTrue(
            AuditEvent.objects.filter(
                actor_user__email="patient@example.com",
                action="LOGIN_SUCCEEDED",
            ).exists()
        )

    def test_login_uses_generic_error_for_invalid_credentials(self):
        response = self.client.post(
            reverse("accounts:login"),
            {"email": "missing@example.com", "password": "wrong-password"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn("email", str(response.data).lower())
        event = AuditEvent.objects.get(action="LOGIN_FAILED")
        self.assertIsNone(event.actor_user_id)
        self.assertNotIn("missing@example.com", str(event.after_data))

    def test_me_requires_access_token_and_returns_account(self):
        register_response = self.register()
        access = register_response.data["data"]["tokens"]["access"]

        unauthorized = self.client.get(reverse("accounts:me"))
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        authorized = self.client.get(reverse("accounts:me"))

        self.assertEqual(unauthorized.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(authorized.status_code, status.HTTP_200_OK)
        self.assertEqual(
            authorized.data["data"]["email"],
            self.registration_data["email"].lower(),
        )
        self.assertNotIn("patient_profile_id", authorized.data["data"])

    def test_refresh_then_logout_revokes_refresh_token(self):
        register_response = self.register()
        access = register_response.data["data"]["tokens"]["access"]
        refresh = register_response.data["data"]["tokens"]["refresh"]

        refresh_response = self.client.post(
            reverse("accounts:token-refresh"),
            {"refresh": refresh},
            format="json",
        )
        rotated_refresh = refresh_response.data["data"]["refresh"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        logout_response = self.client.post(
            reverse("accounts:logout"),
            {"refresh": rotated_refresh},
            format="json",
        )
        revoked_response = self.client.post(
            reverse("accounts:token-refresh"),
            {"refresh": rotated_refresh},
            format="json",
        )

        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)
        self.assertEqual(logout_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(revoked_response.status_code, status.HTTP_401_UNAUTHORIZED)
