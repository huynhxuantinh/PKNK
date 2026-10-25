from django.urls import path

from .views import (
    DentistAppointmentDetailAPIView,
    DentistAppointmentStartAPIView,
    DentistPatientSummaryAPIView,
    DentistScheduleAPIView,
)
from apps.clinical.views import (
    AppointmentClinicalEncounterAPIView,
    ClinicalAttachmentDetailAPIView,
    ClinicalAttachmentDownloadAPIView,
    ClinicalAttachmentListCreateAPIView,
    ClinicalAmendmentListCreateAPIView,
    ClinicalEncounterDetailAPIView,
    ClinicalEncounterFinalizeAPIView,
    DentistAppointmentCompleteAPIView,
    DentistAppointmentFinalizeAndCompleteAPIView,
    OdontogramDetailAPIView,
    OdontogramListCreateAPIView,
    PrescriptionAPIView,
    PrescriptionDetailAPIView,
    PrescriptionIssueAPIView,
    PrescriptionItemDetailAPIView,
    PrescriptionItemListCreateAPIView,
    PrescriptionVoidAPIView,
    TreatmentPlanDetailAPIView,
    TreatmentPlanItemDetailAPIView,
    TreatmentPlanItemListCreateAPIView,
    TreatmentPlanListCreateAPIView,
)


app_name = "dentist_api"

urlpatterns = [
    path("me/schedule/", DentistScheduleAPIView.as_view(), name="schedule"),
    path(
        "me/appointments/<str:public_code>/",
        DentistAppointmentDetailAPIView.as_view(),
        name="appointment-detail",
    ),
    path(
        "me/appointments/<str:public_code>/start/",
        DentistAppointmentStartAPIView.as_view(),
        name="appointment-start",
    ),
    path(
        "me/appointments/<str:public_code>/complete/",
        DentistAppointmentCompleteAPIView.as_view(),
        name="appointment-complete",
    ),
    path(
        "me/appointments/<str:public_code>/finalize-and-complete/",
        DentistAppointmentFinalizeAndCompleteAPIView.as_view(),
        name="appointment-finalize-and-complete",
    ),
    path(
        "me/appointments/<str:public_code>/clinical-encounter/",
        AppointmentClinicalEncounterAPIView.as_view(),
        name="appointment-clinical-encounter",
    ),
    path("me/clinical-encounters/<int:encounter_id>/", ClinicalEncounterDetailAPIView.as_view(), name="clinical-encounter-detail"),
    path("me/clinical-encounters/<int:encounter_id>/finalize/", ClinicalEncounterFinalizeAPIView.as_view(), name="clinical-encounter-finalize"),
    path("me/clinical-encounters/<int:encounter_id>/amendments/", ClinicalAmendmentListCreateAPIView.as_view(), name="clinical-amendments"),
    path("me/clinical-encounters/<int:encounter_id>/odontogram/", OdontogramListCreateAPIView.as_view(), name="odontogram-list"),
    path("me/clinical-encounters/<int:encounter_id>/attachments/", ClinicalAttachmentListCreateAPIView.as_view(), name="clinical-attachments"),
    path("me/clinical-attachments/<int:attachment_id>/", ClinicalAttachmentDetailAPIView.as_view(), name="clinical-attachment-detail"),
    path("me/clinical-attachments/<int:attachment_id>/download/", ClinicalAttachmentDownloadAPIView.as_view(), name="clinical-attachment-download"),
    path("me/odontogram/<int:item_id>/", OdontogramDetailAPIView.as_view(), name="odontogram-detail"),
    path("me/clinical-encounters/<int:encounter_id>/prescription/", PrescriptionAPIView.as_view(), name="prescription"),
    path("me/prescriptions/<int:prescription_id>/", PrescriptionDetailAPIView.as_view(), name="prescription-detail"),
    path("me/prescriptions/<int:prescription_id>/issue/", PrescriptionIssueAPIView.as_view(), name="prescription-issue"),
    path("me/prescriptions/<int:prescription_id>/void/", PrescriptionVoidAPIView.as_view(), name="prescription-void"),
    path("me/prescriptions/<int:prescription_id>/items/", PrescriptionItemListCreateAPIView.as_view(), name="prescription-items"),
    path("me/prescription-items/<int:item_id>/", PrescriptionItemDetailAPIView.as_view(), name="prescription-item-detail"),
    path("me/clinical-encounters/<int:encounter_id>/treatment-plans/", TreatmentPlanListCreateAPIView.as_view(), name="treatment-plans"),
    path("me/treatment-plans/<int:plan_id>/", TreatmentPlanDetailAPIView.as_view(), name="treatment-plan-detail"),
    path("me/treatment-plans/<int:plan_id>/items/", TreatmentPlanItemListCreateAPIView.as_view(), name="treatment-plan-items"),
    path("me/treatment-plan-items/<int:item_id>/", TreatmentPlanItemDetailAPIView.as_view(), name="treatment-plan-item-detail"),
    path(
        "me/patients/<int:patient_profile_id>/summary/",
        DentistPatientSummaryAPIView.as_view(),
        name="patient-summary",
    ),
]
