from datetime import date
from types import SimpleNamespace

from django.contrib import admin
from django.db import DatabaseError, IntegrityError, connection, transaction
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditEvent
from apps.locations.models import Province, Ward

from .admin import PatientProfileAdmin
from .models import PatientProfile, User


class PatientProfileAPITests(APITestCase):
    def setUp(self):
        self.province = Province.objects.create(
            code="79",
            name="Hồ Chí Minh",
            full_name="Thành phố Hồ Chí Minh",
        )
        self.ward = Ward.objects.create(
            code="26734",
            province=self.province,
            name="Bến Nghé",
            full_name="Phường Bến Nghé",
        )
        self.user = User.objects.create_user(
            email="patient@example.com",
            password="StrongPassword!2026",
            full_name="Nguyễn Văn A",
        )
        self.profile = PatientProfile.objects.create(user=self.user)
        self.url = reverse("patients:me")

    def test_get_profile_requires_authentication(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_returns_only_authenticated_users_profile(self):
        other_user = User.objects.create_user(
            email="other@example.com",
            password="StrongPassword!2026",
            full_name="Người khác",
        )
        other_user.phone = "0999999999"
        other_user.save(update_fields=["phone"])
        PatientProfile.objects.create(user=other_user)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["data"]["email"], self.user.email)
        self.assertEqual(response.data["data"]["full_name"], self.user.full_name)
        self.assertIsNone(response.data["data"]["phone"])
        self.assertNotIn("id_patient_profile", response.data["data"])
        self.assertTrue(
            AuditEvent.objects.filter(
                actor_user=self.user,
                action="PATIENT_PROFILE_VIEWED",
                resource_id=str(self.profile.pk),
            ).exists()
        )

    def test_patch_updates_own_personal_information(self):
        self.client.force_authenticate(self.user)

        response = self.client.patch(
            self.url,
            {
                "full_name": "Nguyễn Văn Bình",
                "date_of_birth": "1998-05-20",
                "gender": "MALE",
                "phone": "0901234567",
                "province_code": self.province.code,
                "ward_code": self.ward.code,
                "address_line": "12 Nguyễn Huệ",
            },
            format="json",
        )

        self.user.refresh_from_db()
        self.profile.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.user.full_name, "Nguyễn Văn Bình")
        self.assertEqual(self.profile.date_of_birth, date(1998, 5, 20))
        self.assertEqual(self.user.phone, "0901234567")
        self.assertEqual(self.profile.province, self.province)
        self.assertEqual(self.profile.ward, self.ward)
        event = AuditEvent.objects.get(action="PATIENT_PROFILE_UPDATED")
        self.assertIsNone(event.before_data["phone"])
        self.assertEqual(event.after_data["phone"], "0901234567")
        self.assertEqual(event.before_data["full_name"], "Nguyễn Văn A")
        self.assertEqual(event.after_data["full_name"], "Nguyễn Văn Bình")

    def test_patch_cannot_change_email(self):
        self.client.force_authenticate(self.user)

        response = self.client.patch(
            self.url,
            {
                "email": "changed@example.com",
                "phone": "0900000000",
            },
            format="json",
        )

        self.user.refresh_from_db()
        self.profile.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.user.email, "patient@example.com")
        self.assertEqual(self.user.phone, "0900000000")

    def test_patch_rejects_invalid_phone(self):
        self.client.force_authenticate(self.user)

        response = self.client.patch(
            self.url,
            {"phone": "abc"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.phone, "")

    def test_patch_rejects_ward_from_another_province(self):
        other_province = Province.objects.create(
            code="01",
            name="Hà Nội",
            full_name="Thành phố Hà Nội",
        )
        other_ward = Ward.objects.create(
            code="00001",
            province=other_province,
            name="Ba Đình",
            full_name="Phường Ba Đình",
        )
        self.client.force_authenticate(self.user)

        response = self.client.patch(
            self.url,
            {
                "province_code": self.province.code,
                "ward_code": other_ward.code,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ward_code", response.data)

    def test_patch_rejects_future_date_of_birth(self):
        self.client.force_authenticate(self.user)

        response = self.client.patch(
            self.url,
            {"date_of_birth": "2999-01-01"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("date_of_birth", response.data)

    def test_profile_cannot_be_created_or_listed_through_api(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_admin_cannot_create_reassign_or_delete_patient_profile(self):
        admin_user = User.objects.create_superuser(
            email="root-profile@example.com",
            password="StrongPassword!2026",
            full_name="Quản trị hệ thống",
        )
        request = SimpleNamespace(user=admin_user)
        model_admin = PatientProfileAdmin(PatientProfile, admin.site)

        self.assertFalse(model_admin.has_add_permission(request))
        self.assertFalse(model_admin.has_change_permission(request))
        self.assertFalse(model_admin.has_delete_permission(request))

    def test_database_prevents_reassigning_profile_to_another_user(self):
        other_user = User.objects.create_user(
            email="immutable-owner@example.com",
            password="StrongPassword!2026",
            full_name="Người dùng khác",
        )

        with self.assertRaises(DatabaseError), transaction.atomic():
            PatientProfile.objects.filter(pk=self.profile.pk).update(user=other_user)

    def test_database_rejects_ward_from_another_province(self):
        other_province = Province.objects.create(
            code="48",
            name="Đà Nẵng",
            full_name="Thành phố Đà Nẵng",
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            PatientProfile.objects.filter(pk=self.profile.pk).update(
                province=other_province,
                ward=self.ward,
            )
            with connection.cursor() as cursor:
                cursor.execute(
                    "SET CONSTRAINTS fk_patient_profiles_ward_province IMMEDIATE"
                )
