from io import BytesIO
from datetime import timedelta
from decimal import Decimal
from urllib.parse import urlsplit

from django.db import DatabaseError, transaction
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import NoReverseMatch, reverse
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Dentist, PatientProfile, User
from apps.audit.models import AuditEvent
from apps.catalog.models import BranchService, DentistService, Service
from apps.locations.models import Branch, Chair, Province, Ward
from apps.organizations.models import Membership, Organization
from apps.scheduling.models import Appointment

from .models import (
    ClinicalAmendment,
    ClinicalAttachment,
    ClinicalEncounter,
    ClinicalPerformedService,
)


class ClinicalAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        province = Province.objects.create(code="79", name="HCM", full_name="HCM")
        ward = Ward.objects.create(code="00002", province=province, name="Ward 2", full_name="Ward 2")
        cls.organization = Organization.objects.create(name="Clinical Org", slug="clinical-org")
        cls.branch = Branch.objects.create(
            organization=cls.organization, code="CL1", name="Clinical Branch",
            province=province, ward=ward, address_line="Address", location="POINT(106.7 10.7)",
        )
        cls.dentist_user = cls.user("clinical-dentist@example.com", "Dentist Clinical")
        cls.dentist = Dentist.objects.create(user=cls.dentist_user, organization=cls.organization)
        Membership.objects.create(
            user=cls.dentist_user, organization=cls.organization, branch=cls.branch,
            role=Membership.Role.DENTIST,
        )
        cls.other_user = cls.user("clinical-other@example.com", "Other Dentist")
        cls.other_dentist = Dentist.objects.create(user=cls.other_user, organization=cls.organization)
        Membership.objects.create(
            user=cls.other_user, organization=cls.organization, branch=cls.branch,
            role=Membership.Role.DENTIST,
        )
        patient_user = cls.user("clinical-patient@example.com", "Clinical Patient")
        patient_user.phone = "0900000000"
        patient_user.save(update_fields=["phone"])
        cls.patient_user = patient_user
        cls.patient = PatientProfile.objects.create(user=patient_user)
        Membership.objects.create(
            user=patient_user, organization=cls.organization, role=Membership.Role.PATIENT
        )
        cls.service = Service.objects.create(
            organization=cls.organization, code="ROOT", name="Root canal",
            standard_duration_minutes=60, buffer_minutes=10,
            standard_price=Decimal("1200000"),
        )
        cls.branch_service = BranchService.objects.create(
            branch=cls.branch, service=cls.service, price=Decimal("1200000")
        )
        DentistService.objects.create(dentist=cls.dentist, service=cls.service)
        cls.chair = Chair.objects.create(
            branch=cls.branch, code="C1", name="Chair", resource_type=Chair.ResourceType.CHAIR
        )

    @classmethod
    def user(cls, email, name):
        return User.objects.create_user(
            email=email, password="StrongPassword!2026", full_name=name,
            email_verified_at=timezone.now(),
        )

    def setUp(self):
        self.client.force_authenticate(self.dentist_user)

    def appointment(self, code="APT-CLINICAL", dentist=None):
        starts = timezone.now() - timedelta(minutes=10)
        return Appointment.objects.create(
            public_code=code, patient_profile=self.patient, branch=self.branch,
            branch_service=self.branch_service, dentist=dentist or self.dentist,
            chair=self.chair, service_name_snapshot=self.service.name,
            service_price_snapshot=self.branch_service.price,
            duration_minutes=60, buffer_minutes=10, starts_at=starts,
            ends_at=starts + timedelta(minutes=60),
            occupied_until=starts + timedelta(minutes=70),
            status=Appointment.Status.IN_PROGRESS, confirmed_at=starts - timedelta(hours=1),
            checked_in_at=starts - timedelta(minutes=5), started_at=starts,
        )

    def create_encounter(self, appointment, diagnosis="Pulpitis"):
        response = self.client.post(
            reverse("dentist_api:appointment-clinical-encounter", kwargs={"public_code": appointment.public_code}),
            {"chief_complaint": "Pain", "medical_history": "None", "diagnosis_summary": diagnosis, "notes": ""},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return ClinicalEncounter.objects.get(appointment=appointment)

    def finalize(self, encounter):
        if not encounter.performed_services_confirmed:
            ClinicalEncounter.objects.filter(pk=encounter.pk).update(performed_services_confirmed=True)
            encounter.refresh_from_db()
        response = self.client.post(
            reverse("dentist_api:clinical-encounter-finalize", kwargs={"encounter_id": encounter.pk})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        encounter.refresh_from_db()
        return encounter

    def test_finalize_requires_performed_services_confirmation(self):
        encounter = self.create_encounter(self.appointment(code="APT-SERVICE-CONFIRMATION"))
        url = reverse("dentist_api:clinical-encounter-finalize", kwargs={"encounter_id": encounter.pk})

        missing_confirmation = self.client.post(url)
        self.assertEqual(missing_confirmation.status_code, status.HTTP_409_CONFLICT)

        confirmed = self.client.put(
            reverse("dentist_api:clinical-performed-services", kwargs={"encounter_id": encounter.pk}),
            {"confirmed": True, "items": []},
            format="json",
        )
        self.assertEqual(confirmed.status_code, status.HTTP_200_OK)
        finalized = self.client.post(url)
        self.assertEqual(finalized.status_code, status.HTTP_200_OK)

    @staticmethod
    def png_file(name="patient-name-xray.png"):
        output = BytesIO()
        Image.new("RGB", (2, 2), color="white").save(output, format="PNG")
        return SimpleUploadedFile(name, output.getvalue(), content_type="image/png")

    def test_create_update_finalize_and_read_audit(self):
        appointment = self.appointment()
        encounter = self.create_encounter(appointment)
        updated = self.client.patch(
            reverse("dentist_api:clinical-encounter-detail", kwargs={"encounter_id": encounter.pk}),
            {
                "notes": "Internal follow up",
                "aftercare_instructions": "Brush gently and avoid hot food.",
            },
            format="json",
        )
        encounter = self.finalize(encounter)
        viewed = self.client.get(
            reverse("dentist_api:clinical-encounter-detail", kwargs={"encounter_id": encounter.pk})
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(
            updated.data["data"]["aftercare_instructions"],
            "Brush gently and avoid hot food.",
        )
        self.assertEqual(encounter.status, ClinicalEncounter.Status.FINALIZED)
        self.assertEqual(viewed.status_code, status.HTTP_200_OK)
        self.assertTrue(AuditEvent.objects.filter(action="CLINICAL_ENCOUNTER_VIEWED").exists())

    def test_dentist_records_performed_services_with_branch_price_snapshot(self):
        appointment = self.appointment(code="APT-PERFORMED-SERVICE")
        encounter = self.create_encounter(appointment)
        response = self.client.put(
            reverse("dentist_api:clinical-performed-services", kwargs={"encounter_id": encounter.pk}),
            {
                "confirmed": True,
                "items": [
                    {
                        "branch_service_id": self.branch_service.pk,
                        "quantity": 2,
                        "tooth_reference": "16, 17",
                        "clinical_note": "Completed during this visit",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["data"]["confirmed"])
        self.assertEqual(len(response.data["data"]["items"]), 1)
        performed = ClinicalPerformedService.objects.get(encounter=encounter)
        self.assertEqual(performed.service_name_snapshot, self.service.name)
        self.assertEqual(performed.unit_price_snapshot, Decimal("1200000"))
        self.assertEqual(performed.quantity, 2)
        self.assertEqual(performed.tooth_reference, "16, 17")
        encounter.refresh_from_db()
        self.assertTrue(encounter.performed_services_confirmed)
        self.assertTrue(
            AuditEvent.objects.filter(
                action="CLINICAL_PERFORMED_SERVICES_REPLACED",
                resource_id=str(encounter.pk),
            ).exists()
        )

        self.branch_service.price = Decimal("999999")
        self.branch_service.save(update_fields=["price"])
        performed.refresh_from_db()
        self.assertEqual(performed.unit_price_snapshot, Decimal("1200000"))

    def test_performed_services_must_belong_to_active_branch_catalog_and_draft_encounter(self):
        appointment = self.appointment(code="APT-PERFORMED-VALIDATION")
        encounter = self.create_encounter(appointment)
        self.branch_service.is_active = False
        self.branch_service.save(update_fields=["is_active"])
        url = reverse("dentist_api:clinical-performed-services", kwargs={"encounter_id": encounter.pk})

        inactive = self.client.put(
            url,
            {"confirmed": True, "items": [{"branch_service_id": self.branch_service.pk}]},
            format="json",
        )
        self.assertEqual(inactive.status_code, status.HTTP_409_CONFLICT)

        self.branch_service.is_active = True
        self.branch_service.save(update_fields=["is_active"])
        self.finalize(encounter)
        finalized = self.client.put(url, {"confirmed": True, "items": []}, format="json")
        self.assertEqual(finalized.status_code, status.HTTP_409_CONFLICT)

    def test_dentist_can_only_record_services_assigned_to_them(self):
        unassigned_service = Service.objects.create(
            organization=self.organization,
            code="UNASSIGNED",
            name="Unassigned service",
            standard_duration_minutes=30,
            standard_price=Decimal("300000"),
        )
        unassigned_branch_service = BranchService.objects.create(
            branch=self.branch,
            service=unassigned_service,
            price=Decimal("300000"),
        )
        appointment = self.appointment(code="APT-UNASSIGNED-SERVICE")
        encounter = self.create_encounter(appointment)

        choices = self.client.get(
            reverse("dentist_api:assigned-branch-services", kwargs={"branch_id": self.branch.pk})
        )
        rejected = self.client.put(
            reverse("dentist_api:clinical-performed-services", kwargs={"encounter_id": encounter.pk}),
            {"confirmed": True, "items": [{"branch_service_id": unassigned_branch_service.pk}]},
            format="json",
        )

        self.assertEqual(choices.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id_branch_service"] for item in choices.data["data"]], [self.branch_service.pk])
        self.assertEqual(rejected.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("chưa được phân công", rejected.data["message"])

    def test_create_encounter_rejects_confirmed_appointment(self):
        appointment = self.appointment(code="APT-CONFIRMED")
        appointment.status = Appointment.Status.CONFIRMED
        appointment.checked_in_at = None
        appointment.started_at = None
        appointment.save(update_fields=["status", "checked_in_at", "started_at"])

        response = self.client.post(
            reverse(
                "dentist_api:appointment-clinical-encounter",
                kwargs={"public_code": appointment.public_code},
            ),
            {"diagnosis_summary": "Must not be created"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(ClinicalEncounter.objects.filter(appointment=appointment).exists())

    def test_other_dentist_cannot_access_encounter(self):
        appointment = self.appointment(dentist=self.other_dentist)
        encounter = ClinicalEncounter.objects.create(
            appointment=appointment, created_by=self.other_user, diagnosis_summary="Diagnosis"
        )
        response = self.client.get(
            reverse("dentist_api:clinical-encounter-detail", kwargs={"encounter_id": encounter.pk})
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_patient_cannot_access_dentist_clinical_api(self):
        self.client.force_authenticate(self.patient_user)

        response = self.client.get(
            reverse(
                "dentist_api:clinical-encounter-detail",
                kwargs={"encounter_id": 999999},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_draft_encounter_is_hidden_from_patient_detail_and_history(self):
        appointment = self.appointment(code="APT-DRAFT-HIDDEN")
        encounter = self.create_encounter(appointment)

        self.client.force_authenticate(self.patient_user)
        detail = self.client.get(
            reverse(
                "patients:clinical-encounter-detail",
                kwargs={"encounter_id": encounter.pk},
            )
        )
        history = self.client.get(reverse("patients:clinical-encounters"))

        self.assertEqual(encounter.status, ClinicalEncounter.Status.DRAFT)
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(history.status_code, status.HTTP_200_OK)
        self.assertEqual(history.data["data"], [])

    def test_finalized_encounter_is_immutable_in_database(self):
        encounter = self.create_encounter(self.appointment())
        self.finalize(encounter)
        with self.assertRaises(DatabaseError), transaction.atomic():
            ClinicalEncounter.objects.filter(pk=encounter.pk).update(notes="tampered")

    def test_dentist_uploads_and_downloads_private_clinical_attachment(self):
        appointment = self.appointment()
        encounter = self.create_encounter(appointment)
        upload = self.client.post(
            reverse(
                "dentist_api:clinical-attachments",
                kwargs={"encounter_id": encounter.pk},
            ),
            {
                "kind": ClinicalAttachment.Kind.XRAY,
                "description": "Before treatment",
                "file": self.png_file(),
            },
            format="multipart",
        )

        self.assertEqual(upload.status_code, status.HTTP_201_CREATED)
        attachment = ClinicalAttachment.objects.get()
        self.assertNotIn("patient-name", attachment.file.name)
        self.assertEqual(attachment.content_type, "image/png")
        self.assertEqual(len(attachment.sha256), 64)
        self.assertNotIn("file", upload.data["data"])
        self.assertNotIn("minio", upload.data["data"]["download_url"])

        encounter_detail = self.client.get(
            reverse(
                "dentist_api:clinical-encounter-detail",
                kwargs={"encounter_id": encounter.pk},
            )
        )
        self.assertIn(
            reverse(
                "dentist_api:clinical-attachment-download",
                kwargs={"attachment_id": attachment.pk},
            ),
            encounter_detail.data["data"]["attachments"][0]["download_url"],
        )

        # Simulate refreshing the examination page, which loads the encounter
        # through the appointment endpoint used by the FE.
        refreshed_encounter = self.client.get(
            reverse(
                "dentist_api:appointment-clinical-encounter",
                kwargs={"public_code": appointment.public_code},
            )
        )
        refreshed_attachment = refreshed_encounter.data["data"]["attachments"][0]
        self.assertEqual(refreshed_encounter.status_code, status.HTTP_200_OK)
        self.assertIn(
            reverse(
                "dentist_api:clinical-attachment-download",
                kwargs={"attachment_id": attachment.pk},
            ),
            refreshed_attachment["download_url"],
        )

        download = self.client.get(urlsplit(refreshed_attachment["download_url"]).path)
        downloaded = b"".join(download.streaming_content)
        self.assertEqual(download.status_code, status.HTTP_200_OK)
        self.assertTrue(downloaded.startswith(b"\x89PNG"))
        self.assertEqual(download["Cache-Control"], "private, no-store")
        self.assertTrue(AuditEvent.objects.filter(
            action="CLINICAL_ATTACHMENT_DOWNLOADED",
            resource_id=str(attachment.pk),
        ).exists())

    def test_attachment_rejects_spoofed_file_and_kind_mismatch(self):
        encounter = self.create_encounter(self.appointment())
        url = reverse(
            "dentist_api:clinical-attachments",
            kwargs={"encounter_id": encounter.pk},
        )
        spoofed = self.client.post(
            url,
            {
                "kind": ClinicalAttachment.Kind.XRAY,
                "file": SimpleUploadedFile(
                    "fake.png", b"not-an-image", content_type="image/png"
                ),
            },
            format="multipart",
        )
        mismatch = self.client.post(
            url,
            {
                "kind": ClinicalAttachment.Kind.DOCUMENT,
                "file": self.png_file("photo.png"),
            },
            format="multipart",
        )

        self.assertEqual(spoofed.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(mismatch.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ClinicalAttachment.objects.count(), 0)

    def test_patient_downloads_attachment_only_after_completed_visit(self):
        appointment = self.appointment()
        encounter = self.create_encounter(appointment)
        upload = self.client.post(
            reverse(
                "dentist_api:clinical-attachments",
                kwargs={"encounter_id": encounter.pk},
            ),
            {
                "kind": ClinicalAttachment.Kind.XRAY,
                "description": "X-ray result",
                "file": self.png_file(),
            },
            format="multipart",
        )
        attachment_id = upload.data["data"]["id_clinical_attachment"]
        self.finalize(encounter)

        patient_url = reverse(
            "patients:clinical-attachment-download",
            kwargs={"attachment_id": attachment_id},
        )
        self.client.force_authenticate(self.patient_user)
        hidden = self.client.get(patient_url)
        self.client.force_authenticate(self.dentist_user)
        completed = self.client.post(
            reverse(
                "dentist_api:appointment-complete",
                kwargs={"public_code": appointment.public_code},
            )
        )
        self.client.force_authenticate(self.patient_user)
        detail = self.client.get(
            reverse(
                "patients:clinical-encounter-detail",
                kwargs={"encounter_id": encounter.pk},
            )
        )
        download = self.client.get(patient_url)
        downloaded = b"".join(download.streaming_content)

        stranger = self.user("attachment-stranger@example.com", "Stranger")
        PatientProfile.objects.create(user=stranger)
        self.client.force_authenticate(stranger)
        forbidden = self.client.get(patient_url)

        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(completed.status_code, status.HTTP_200_OK)
        self.assertEqual(len(detail.data["data"]["attachments"]), 1)
        self.assertNotIn("file", detail.data["data"]["attachments"][0])
        self.assertEqual(download.status_code, status.HTTP_200_OK)
        self.assertTrue(downloaded.startswith(b"\x89PNG"))
        self.assertEqual(forbidden.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(AuditEvent.objects.filter(
            actor_user=self.patient_user,
            action="PATIENT_CLINICAL_ATTACHMENT_DOWNLOADED",
            resource_id=str(attachment_id),
        ).exists())

    def test_finalized_attachment_is_immutable(self):
        encounter = self.create_encounter(self.appointment())
        upload = self.client.post(
            reverse(
                "dentist_api:clinical-attachments",
                kwargs={"encounter_id": encounter.pk},
            ),
            {"kind": ClinicalAttachment.Kind.PHOTO, "file": self.png_file("photo.png")},
            format="multipart",
        )
        attachment = ClinicalAttachment.objects.get(
            pk=upload.data["data"]["id_clinical_attachment"]
        )
        self.finalize(encounter)

        api_delete = self.client.delete(
            reverse(
                "dentist_api:clinical-attachment-detail",
                kwargs={"attachment_id": attachment.pk},
            )
        )
        self.assertEqual(api_delete.status_code, status.HTTP_409_CONFLICT)
        with self.assertRaises(DatabaseError), transaction.atomic():
            ClinicalAttachment.objects.filter(pk=attachment.pk).update(
                description="tampered"
            )

    def test_amendment_is_append_only(self):
        draft = self.create_encounter(self.appointment(code="APT-AMENDMENT-DRAFT"))
        rejected = self.client.post(
            reverse("dentist_api:clinical-amendments", kwargs={"encounter_id": draft.pk}),
            {"content": "Correction", "reason": "Typo"},
            format="json",
        )
        self.assertEqual(rejected.status_code, status.HTTP_409_CONFLICT)

        encounter = self.finalize(self.create_encounter(self.appointment()))
        response = self.client.post(
            reverse("dentist_api:clinical-amendments", kwargs={"encounter_id": encounter.pk}),
            {"content": "Corrected detail", "reason": "Typing error"}, format="json",
        )
        amendment = ClinicalAmendment.objects.get()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        collection_url = reverse(
            "dentist_api:clinical-amendments",
            kwargs={"encounter_id": encounter.pk},
        )
        amendment_list = self.client.get(collection_url)
        self.assertEqual(amendment_list.status_code, status.HTTP_200_OK)
        self.assertEqual(amendment_list.data["data"][0]["author_name"], self.dentist_user.full_name)
        self.assertEqual(self.client.patch(collection_url, {"content": "Changed"}).status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(self.client.delete(collection_url).status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        with self.assertRaises(DatabaseError), transaction.atomic():
            ClinicalAmendment.objects.filter(pk=amendment.pk).update(content="tampered")

    def test_treatment_plan_derives_scope_and_recalculates_total(self):
        draft_encounter = self.create_encounter(self.appointment(code="APT-PLAN-DRAFT"))
        draft_plan = self.client.post(
            reverse("dentist_api:treatment-plans", kwargs={"encounter_id": draft_encounter.pk}),
            {"title": "Not allowed yet", "description": ""},
            format="json",
        )
        self.assertEqual(draft_plan.status_code, status.HTTP_409_CONFLICT)

        encounter = self.finalize(self.create_encounter(self.appointment(code="APT-PLAN")))
        plan_response = self.client.post(
            reverse("dentist_api:treatment-plans", kwargs={"encounter_id": encounter.pk}),
            {"title": "Root canal plan", "description": "Two visits"}, format="json",
        )
        self.assertEqual(plan_response.status_code, status.HTTP_201_CREATED)
        plan_id = plan_response.data["data"]["id_treatment_plan"]
        item_response = self.client.post(
            reverse("dentist_api:treatment-plan-items", kwargs={"plan_id": plan_id}),
            {"service_id": self.service.pk, "tooth_number": 11, "sequence": 1, "planned_price": "1200000.00", "status": "PLANNED", "note": ""},
            format="json",
        )
        item_id = item_response.data["data"]["id_treatment_plan_item"]
        updated_item = self.client.patch(
            reverse("dentist_api:treatment-plan-item-detail", kwargs={"item_id": item_id}),
            {"sequence": 2, "planned_price": "900000.00"},
            format="json",
        )
        updated_plan = self.client.patch(
            reverse("dentist_api:treatment-plan-detail", kwargs={"plan_id": plan_id}),
            {"title": "Updated plan", "description": "Three visits", "status": "ACTIVE"},
            format="json",
        )
        invalid_transition = self.client.patch(
            reverse("dentist_api:treatment-plan-detail", kwargs={"plan_id": plan_id}),
            {"status": "DRAFT"},
            format="json",
        )
        detail = self.client.get(reverse("dentist_api:treatment-plan-detail", kwargs={"plan_id": plan_id}))
        self.assertEqual(item_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(updated_item.status_code, status.HTTP_200_OK)
        self.assertEqual(updated_plan.status_code, status.HTTP_200_OK)
        self.assertEqual(invalid_transition.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(detail.data["data"]["title"], "Updated plan")
        self.assertEqual(detail.data["data"]["total_estimate"], "900000.00")
        self.assertEqual(detail.data["data"]["patient_profile_id"], self.patient.pk)
        self.client.force_authenticate(self.other_user)
        hidden_from_other_dentist = self.client.get(
            reverse("dentist_api:treatment-plan-detail", kwargs={"plan_id": plan_id})
        )
        self.assertEqual(hidden_from_other_dentist.status_code, status.HTTP_404_NOT_FOUND)

    def test_patient_only_reads_own_completed_record_and_access_is_audited(self):
        appointment = self.appointment()
        encounter = self.create_encounter(appointment)
        performed_services = self.client.put(
            reverse(
                "dentist_api:clinical-performed-services",
                kwargs={"encounter_id": encounter.pk},
            ),
            {
                "confirmed": True,
                "items": [{"branch_service_id": self.branch_service.pk, "quantity": 2}],
            },
            format="json",
        )
        self.client.patch(
            reverse(
                "dentist_api:clinical-encounter-detail",
                kwargs={"encounter_id": encounter.pk},
            ),
            {
                "notes": "Internal clinician note",
                "aftercare_instructions": "Rinse gently twice a day.",
            },
            format="json",
        )
        encounter = self.finalize(encounter)
        amendment_response = self.client.post(
            reverse("dentist_api:clinical-amendments", kwargs={"encounter_id": encounter.pk}),
            {"content": "Follow-up correction", "reason": "Clarified diagnosis"},
            format="json",
        )
        plan_response = self.client.post(
            reverse("dentist_api:treatment-plans", kwargs={"encounter_id": encounter.pk}),
            {"title": "Root canal plan", "description": "Two visits"}, format="json",
        )
        plan_id = plan_response.data["data"]["id_treatment_plan"]
        self.client.post(
            reverse("dentist_api:treatment-plan-items", kwargs={"plan_id": plan_id}),
            {
                "service_id": self.service.pk, "tooth_number": 11, "sequence": 1,
                "planned_price": "1200000.00", "status": "PLANNED", "note": "",
            },
            format="json",
        )
        self.client.patch(
            reverse("dentist_api:treatment-plan-detail", kwargs={"plan_id": plan_id}),
            {"status": "ACTIVE"}, format="json",
        )
        self.client.post(
            reverse("dentist_api:treatment-plans", kwargs={"encounter_id": encounter.pk}),
            {"title": "Internal draft", "description": "Not ready"}, format="json",
        )

        self.client.force_authenticate(self.patient_user)
        hidden_while_in_progress = self.client.get(
            reverse("patients:clinical-encounter-detail", kwargs={"encounter_id": encounter.pk})
        )
        self.client.force_authenticate(self.dentist_user)
        completed = self.client.post(
            reverse(
                "dentist_api:appointment-complete",
                kwargs={"public_code": appointment.public_code},
            )
        )
        self.client.force_authenticate(self.patient_user)
        response = self.client.get(
            reverse("patients:clinical-encounter-detail", kwargs={"encounter_id": encounter.pk})
        )
        history = self.client.get(reverse("patients:clinical-encounters"))
        stranger = self.user("clinical-stranger@example.com", "Stranger")
        PatientProfile.objects.create(user=stranger)
        self.client.force_authenticate(stranger)
        hidden_from_other_patient = self.client.get(
            reverse("patients:clinical-encounter-detail", kwargs={"encounter_id": encounter.pk})
        )

        self.assertEqual(hidden_while_in_progress.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(performed_services.status_code, status.HTTP_200_OK)
        self.assertEqual(completed.status_code, status.HTTP_200_OK)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(history.data["data"]), 1)
        self.assertEqual(hidden_from_other_patient.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["data"]["diagnosis_summary"], "Pulpitis")
        self.assertEqual(
            response.data["data"]["aftercare_instructions"],
            "Rinse gently twice a day.",
        )
        self.assertNotIn("notes", response.data["data"])
        self.assertEqual(response.data["data"]["appointment_status"], "COMPLETED")
        self.assertEqual(response.data["data"]["service_name"], self.service.name)
        self.assertEqual(len(response.data["data"]["performed_services"]), 1)
        self.assertEqual(
            response.data["data"]["performed_services"][0]["service_name_snapshot"],
            self.service.name,
        )
        self.assertEqual(response.data["data"]["performed_services"][0]["quantity"], 2)
        self.assertEqual(
            history.data["data"][0]["performed_services"][0]["service_name_snapshot"],
            self.service.name,
        )
        self.assertEqual(response.data["data"]["dentist_name"], self.dentist_user.full_name)
        self.assertEqual(response.data["data"]["branch_name"], self.branch.name)
        self.assertEqual(len(response.data["data"]["treatment_plans"]), 1)
        self.assertEqual(
            [plan["status"] for plan in response.data["data"]["treatment_plans"]],
            ["ACTIVE"],
        )
        self.assertEqual(
            response.data["data"]["amendments"][0]["content"],
            amendment_response.data["data"]["content"],
        )
        self.assertEqual(
            response.data["data"]["amendments"][0]["author_name"],
            self.dentist_user.full_name,
        )
        self.assertEqual(
            response.data["data"]["treatment_plans"][0]["items"][0]["service_name"],
            self.service.name,
        )
        self.assertTrue(
            AuditEvent.objects.filter(
                actor_user=self.patient_user,
                action="PATIENT_CLINICAL_ENCOUNTER_VIEWED",
                resource_id=str(encounter.pk),
            ).exists()
        )
        self.assertTrue(
            AuditEvent.objects.filter(
                actor_user=self.patient_user,
                action="PATIENT_CLINICAL_ENCOUNTER_LIST_VIEWED",
                resource_id=str(self.patient.pk),
            ).exists()
        )

    def test_complete_requires_finalized_encounter_but_not_prescription(self):
        appointment = self.appointment()
        complete_url = reverse("dentist_api:appointment-complete", kwargs={"public_code": appointment.public_code})
        missing = self.client.post(complete_url)
        encounter = self.create_encounter(appointment)
        unfinalized = self.client.post(complete_url)
        self.finalize(encounter)
        completed = self.client.post(complete_url)
        self.assertEqual(missing.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(unfinalized.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(completed.status_code, status.HTTP_200_OK)
        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.COMPLETED)

    def test_finalize_and_complete_is_atomic_when_completion_fails(self):
        appointment = self.appointment(code="APT-ATOMIC-FAIL")
        encounter = self.create_encounter(appointment, diagnosis="Initial diagnosis")
        response = self.client.post(
            reverse(
                "dentist_api:appointment-finalize-and-complete",
                kwargs={"public_code": appointment.public_code},
            ),
            {"diagnosis_summary": "Updated diagnosis", "notes": "Atomic update"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        encounter.refresh_from_db()
        appointment.refresh_from_db()
        self.assertEqual(encounter.status, ClinicalEncounter.Status.DRAFT)
        self.assertEqual(encounter.diagnosis_summary, "Initial diagnosis")
        self.assertEqual(encounter.notes, "")
        self.assertEqual(appointment.status, Appointment.Status.IN_PROGRESS)

    def test_removed_odontogram_and_prescription_routes_are_unavailable(self):
        for route_name, kwargs in (
            ("dentist_api:odontogram-list", {"encounter_id": 1}),
            ("dentist_api:odontogram-detail", {"item_id": 1}),
            ("dentist_api:prescription", {"encounter_id": 1}),
            ("dentist_api:prescription-detail", {"prescription_id": 1}),
            ("dentist_api:prescription-issue", {"prescription_id": 1}),
            ("dentist_api:prescription-void", {"prescription_id": 1}),
            ("dentist_api:prescription-items", {"prescription_id": 1}),
            ("dentist_api:prescription-item-detail", {"item_id": 1}),
        ):
            with self.subTest(route_name=route_name), self.assertRaises(NoReverseMatch):
                reverse(route_name, kwargs=kwargs)

    def test_finalize_and_complete_updates_and_completes_draft(self):
        appointment = self.appointment(code="APT-ATOMIC-SUCCESS")
        encounter = self.create_encounter(appointment, diagnosis="Initial diagnosis")
        ClinicalEncounter.objects.filter(pk=encounter.pk).update(performed_services_confirmed=True)

        response = self.client.post(
            reverse(
                "dentist_api:appointment-finalize-and-complete",
                kwargs={"public_code": appointment.public_code},
            ),
            {"diagnosis_summary": "Final diagnosis", "notes": "Completed safely"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        encounter.refresh_from_db()
        appointment.refresh_from_db()
        self.assertEqual(encounter.status, ClinicalEncounter.Status.FINALIZED)
        self.assertEqual(encounter.diagnosis_summary, "Final diagnosis")
        self.assertEqual(encounter.notes, "Completed safely")
        self.assertEqual(appointment.status, Appointment.Status.COMPLETED)

    def test_finalize_and_complete_recovers_finalized_encounter(self):
        appointment = self.appointment(code="APT-FINALIZED-RETRY")
        encounter = self.finalize(self.create_encounter(appointment))

        response = self.client.post(
            reverse(
                "dentist_api:appointment-finalize-and-complete",
                kwargs={"public_code": appointment.public_code},
            ),
            {"diagnosis_summary": "Must not overwrite finalized record"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        encounter.refresh_from_db()
        appointment.refresh_from_db()
        self.assertEqual(encounter.status, ClinicalEncounter.Status.FINALIZED)
        self.assertEqual(encounter.diagnosis_summary, "Pulpitis")
        self.assertEqual(appointment.status, Appointment.Status.COMPLETED)
