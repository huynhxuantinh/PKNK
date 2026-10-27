from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.audit.models import AuditEvent

from .models import User


class PasswordChangeAPITests(APITestCase):
    def setUp(self):
        self.old_password = "OldStrongPassword!2026"
        self.new_password = "NewStrongPassword!2026"
        self.user = User.objects.create_user(
            email="change-password@example.com",
            password=self.old_password,
            full_name="Change Password",
        )
        self.url = reverse("accounts:password-change")

    def payload(self, **overrides):
        return {
            "current_password": self.old_password,
            "new_password": self.new_password,
            "new_password_confirm": self.new_password,
            **overrides,
        }

    def test_requires_authentication(self):
        response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_rejects_wrong_current_password_without_changing_it(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(
            self.url,
            self.payload(current_password="WrongPassword!2026"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("current_password", response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.old_password))

    def test_changes_password_revokes_refresh_tokens_and_writes_audit(self):
        refresh_token = RefreshToken.for_user(self.user)
        refresh = str(refresh_token)
        access = str(refresh_token.access_token)
        self.client.force_authenticate(self.user)

        response = self.client.post(self.url, self.payload(), format="json")
        revoked = self.client.post(
            reverse("accounts:token-refresh"),
            {"refresh": refresh},
            format="json",
        )
        old_access_client = APIClient()
        old_access_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        old_access = old_access_client.get(reverse("accounts:me"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.new_password))
        self.assertEqual(revoked.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(old_access.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertTrue(
            AuditEvent.objects.filter(
                actor_user=self.user,
                action="PASSWORD_CHANGED",
            ).exists()
        )

    def test_rejects_confirmation_mismatch(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(
            self.url,
            self.payload(new_password_confirm="DifferentStrongPassword!2026"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password_confirm", response.data)

    def test_rejects_weak_new_password(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(
            self.url,
            self.payload(new_password="123", new_password_confirm="123"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", response.data)
