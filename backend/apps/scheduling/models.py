from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeOperators
from django.db import models


ACTIVE_APPOINTMENT_STATUSES = [
    "HELD",
    "PENDING",
    "CONFIRMED",
    "CHECKED_IN",
    "IN_PROGRESS",
]

ALL_APPOINTMENT_STATUSES = ACTIVE_APPOINTMENT_STATUSES + [
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW",
    "EXPIRED",
]


class WorkShift(models.Model):
    id_work_shift = models.BigAutoField(primary_key=True)
    dentist = models.ForeignKey(
        "accounts.Dentist",
        db_column="id_dentist",
        on_delete=models.PROTECT,
        related_name="work_shifts",
    )
    branch = models.ForeignKey(
        "locations.Branch",
        db_column="id_branch",
        on_delete=models.PROTECT,
        related_name="work_shifts",
    )
    weekday = models.SmallIntegerField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "work_shifts"
        ordering = ["branch", "dentist", "weekday", "start_time"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(weekday__range=(1, 7)),
                name="ck_work_shifts_weekday",
            ),
            models.CheckConstraint(
                condition=models.Q(start_time__lt=models.F("end_time")),
                name="ck_work_shifts_time_order",
            ),
            models.CheckConstraint(
                condition=models.Q(valid_to__isnull=True)
                | models.Q(valid_to__gte=models.F("valid_from")),
                name="ck_work_shifts_date_range",
            ),
        ]

    def __str__(self):
        return f"{self.dentist} - {self.branch} - thứ {self.weekday}"


class TimeOff(models.Model):
    id_time_off = models.BigAutoField(primary_key=True)
    dentist = models.ForeignKey(
        "accounts.Dentist",
        db_column="id_dentist",
        on_delete=models.PROTECT,
        related_name="time_offs",
    )
    branch = models.ForeignKey(
        "locations.Branch",
        db_column="id_branch",
        on_delete=models.PROTECT,
        related_name="time_offs",
        null=True,
        blank=True,
    )
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    reason = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "time_offs"
        ordering = ["-starts_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(starts_at__lt=models.F("ends_at")),
                name="ck_time_offs_time_order",
            ),
        ]

    def __str__(self):
        scope = self.branch.name if self.branch_id else "Toàn chuỗi"
        return f"{self.dentist} - {scope} - {self.starts_at}"


class Appointment(models.Model):
    class Status(models.TextChoices):
        HELD = "HELD", "Giữ chỗ"
        PENDING = "PENDING", "Chờ xác nhận"
        CONFIRMED = "CONFIRMED", "Đã xác nhận"
        CHECKED_IN = "CHECKED_IN", "Đã check-in"
        IN_PROGRESS = "IN_PROGRESS", "Đang khám"
        COMPLETED = "COMPLETED", "Hoàn thành"
        CANCELLED = "CANCELLED", "Đã hủy"
        NO_SHOW = "NO_SHOW", "Không đến"
        EXPIRED = "EXPIRED", "Hết thời gian giữ chỗ"

    id_appointment = models.BigAutoField(primary_key=True)
    public_code = models.CharField(max_length=30, unique=True)
    patient_profile = models.ForeignKey(
        "accounts.PatientProfile",
        db_column="id_patient_profile",
        on_delete=models.PROTECT,
        related_name="appointments",
    )
    branch = models.ForeignKey(
        "locations.Branch",
        db_column="id_branch",
        on_delete=models.PROTECT,
        related_name="appointments",
    )
    branch_service = models.ForeignKey(
        "catalog.BranchService",
        db_column="id_branch_service",
        on_delete=models.PROTECT,
        related_name="appointments",
    )
    dentist = models.ForeignKey(
        "accounts.Dentist",
        db_column="id_dentist",
        on_delete=models.PROTECT,
        related_name="appointments",
    )
    chair = models.ForeignKey(
        "locations.Chair",
        db_column="id_chair",
        on_delete=models.PROTECT,
        related_name="appointments",
    )
    service_name_snapshot = models.CharField(max_length=200)
    service_price_snapshot = models.DecimalField(max_digits=14, decimal_places=2)
    contact_name_snapshot = models.CharField(max_length=200, null=True, blank=True)
    contact_phone_snapshot = models.CharField(max_length=20, null=True, blank=True)
    contact_email_snapshot = models.EmailField(null=True, blank=True)
    patient_note = models.TextField(blank=True)
    duration_minutes = models.IntegerField()
    buffer_minutes = models.IntegerField(default=0)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    occupied_until = models.DateTimeField()
    occupied_range = models.GeneratedField(
        expression=models.Func(
            models.F("starts_at"),
            models.F("occupied_until"),
            models.Value("[)"),
            function="TSTZRANGE",
        ),
        output_field=DateTimeRangeField(),
        db_persist=True,
    )
    status = models.CharField(max_length=20, choices=Status.choices)
    held_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    no_show_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        db_column="id_cancelled_by",
        on_delete=models.PROTECT,
        related_name="cancelled_appointments",
        null=True,
        blank=True,
    )
    cancel_reason = models.TextField(null=True, blank=True)
    rescheduled_from = models.OneToOneField(
        "self",
        db_column="id_rescheduled_from",
        on_delete=models.PROTECT,
        related_name="rescheduled_to",
        null=True,
        blank=True,
    )
    reschedule_idempotency_key = models.CharField(
        max_length=64,
        unique=True,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "appointments"
        ordering = ["-starts_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=ALL_APPOINTMENT_STATUSES),
                name="ck_appointments_status",
            ),
            models.CheckConstraint(
                condition=models.Q(starts_at__lt=models.F("ends_at")),
                name="ck_appointments_time_order",
            ),
            models.CheckConstraint(
                condition=models.Q(ends_at__lte=models.F("occupied_until")),
                name="ck_appointments_occupied_until",
            ),
            models.CheckConstraint(
                condition=models.Q(duration_minutes__gt=0),
                name="ck_appointments_duration_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(buffer_minutes__gte=0),
                name="ck_appointments_buffer_nonnegative",
            ),
            models.CheckConstraint(
                condition=(
                    ~models.Q(status="HELD")
                    | (
                        models.Q(held_at__isnull=False)
                        & models.Q(expires_at__isnull=False)
                        & models.Q(expires_at__gt=models.F("held_at"))
                    )
                ),
                name="ck_appointments_held_fields",
            ),
            models.CheckConstraint(
                condition=(
                    ~models.Q(status="CANCELLED")
                    | (
                        models.Q(cancelled_at__isnull=False)
                        & models.Q(cancelled_by__isnull=False)
                        & models.Q(cancel_reason__isnull=False)
                        & ~models.Q(cancel_reason="")
                    )
                ),
                name="ck_appointments_cancelled_fields",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="NO_SHOW")
                | models.Q(no_show_at__isnull=False),
                name="ck_appointments_no_show_at",
            ),
            ExclusionConstraint(
                name="excl_appointments_dentist_time",
                expressions=[
                    ("dentist", RangeOperators.EQUAL),
                    ("occupied_range", RangeOperators.OVERLAPS),
                ],
                condition=models.Q(status__in=ACTIVE_APPOINTMENT_STATUSES),
            ),
            ExclusionConstraint(
                name="excl_appointments_chair_time",
                expressions=[
                    ("chair", RangeOperators.EQUAL),
                    ("occupied_range", RangeOperators.OVERLAPS),
                ],
                condition=models.Q(status__in=ACTIVE_APPOINTMENT_STATUSES),
            ),
        ]
        indexes = [
            models.Index(
                fields=["patient_profile", "-starts_at"],
                name="idx_appt_patient_start",
            ),
            models.Index(
                fields=["branch", "status", "starts_at"],
                name="idx_appt_branch_status_start",
            ),
            models.Index(
                fields=["dentist", "status", "starts_at"],
                name="idx_appt_dentist_status_start",
            ),
            models.Index(
                fields=["status", "expires_at"],
                condition=models.Q(status="HELD"),
                name="idx_appt_held_expiry",
            ),
        ]

    def __str__(self):
        return f"{self.public_code} - {self.patient_profile}"


class AppointmentStatusHistory(models.Model):
    class ActorType(models.TextChoices):
        PATIENT = "PATIENT", "Bệnh nhân"
        BRANCH_ADMIN = "BRANCH_ADMIN", "Quản lý chi nhánh"
        ORGANIZATION_ADMIN = "ORGANIZATION_ADMIN", "Quản lý toàn chuỗi"
        DENTIST = "DENTIST", "Nha sĩ"
        SYSTEM = "SYSTEM", "Hệ thống"

    id_appointment_status_history = models.BigAutoField(primary_key=True)
    appointment = models.ForeignKey(
        Appointment,
        db_column="id_appointment",
        on_delete=models.PROTECT,
        related_name="status_histories",
    )
    from_status = models.CharField(
        max_length=20,
        choices=Appointment.Status.choices,
        null=True,
        blank=True,
    )
    to_status = models.CharField(max_length=20, choices=Appointment.Status.choices)
    actor_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        db_column="id_actor_user",
        on_delete=models.PROTECT,
        related_name="appointment_status_changes",
        null=True,
        blank=True,
    )
    actor_type = models.CharField(max_length=30, choices=ActorType.choices)
    reason = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "appointment_status_histories"
        ordering = ["appointment", "created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(from_status__isnull=True)
                | models.Q(from_status__in=ALL_APPOINTMENT_STATUSES),
                name="ck_appt_history_from_status",
            ),
            models.CheckConstraint(
                condition=models.Q(to_status__in=ALL_APPOINTMENT_STATUSES),
                name="ck_appt_history_to_status",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    actor_type__in=[
                        "PATIENT",
                        "BRANCH_ADMIN",
                        "ORGANIZATION_ADMIN",
                        "DENTIST",
                        "SYSTEM",
                    ]
                ),
                name="ck_appt_history_actor_type",
            ),
        ]

    def __str__(self):
        return f"{self.appointment.public_code}: {self.from_status} → {self.to_status}"

