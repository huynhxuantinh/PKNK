from celery import shared_task

from .services import AppointmentService


@shared_task
def expire_held_appointments():
    return AppointmentService.expire_due_holds()

