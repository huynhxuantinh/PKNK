from django.urls import path

from .patient_views import PatientProfileMeAPIView
from apps.clinical.patient_views import (
    PatientClinicalAttachmentDownloadAPIView,
    PatientClinicalEncounterDetailAPIView,
    PatientClinicalEncounterListAPIView,
)
from apps.billing.patient_views import PatientInvoiceDetailAPIView, PatientInvoiceListAPIView, PatientInvoicePayosAPIView
from apps.scheduling.patient_views import (
    PatientAppointmentCancelAPIView,
    PatientAppointmentDetailAPIView,
    PatientAppointmentListAPIView,
    PatientAppointmentRescheduleAPIView,
    PatientAppointmentRescheduleSlotsAPIView,
)


app_name = "patients"

urlpatterns = [
    path("me/", PatientProfileMeAPIView.as_view(), name="me"),
    path("me/clinical-encounters/", PatientClinicalEncounterListAPIView.as_view(), name="clinical-encounters"),
    path("me/clinical-encounters/<int:encounter_id>/", PatientClinicalEncounterDetailAPIView.as_view(), name="clinical-encounter-detail"),
    path("me/clinical-attachments/<int:attachment_id>/download/", PatientClinicalAttachmentDownloadAPIView.as_view(), name="clinical-attachment-download"),
    path("me/invoices/", PatientInvoiceListAPIView.as_view(), name="invoices"),
    path("me/invoices/<int:invoice_id>/", PatientInvoiceDetailAPIView.as_view(), name="invoice-detail"),
    path("me/invoices/<int:invoice_id>/payos/", PatientInvoicePayosAPIView.as_view(), name="invoice-payos"),
    path("me/appointments/", PatientAppointmentListAPIView.as_view(), name="appointments"),
    path("me/appointments/<str:public_code>/", PatientAppointmentDetailAPIView.as_view(), name="appointment-detail"),
    path("me/appointments/<str:public_code>/cancel/", PatientAppointmentCancelAPIView.as_view(), name="appointment-cancel"),
    path("me/appointments/<str:public_code>/reschedule/", PatientAppointmentRescheduleAPIView.as_view(), name="appointment-reschedule"),
    path("me/appointments/<str:public_code>/reschedule-slots/", PatientAppointmentRescheduleSlotsAPIView.as_view(), name="appointment-reschedule-slots"),
]
