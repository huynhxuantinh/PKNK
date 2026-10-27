from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class Organization(models.Model):
    id_organization = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=100, unique=True)
    timezone = models.CharField(max_length=64, default="Asia/Ho_Chi_Minh")
    auto_confirm = models.BooleanField(default=True)
    slot_hold_minutes = models.SmallIntegerField(default=10)
    cancellation_cutoff_minutes = models.IntegerField(default=1440)
    no_show_grace_minutes = models.SmallIntegerField(default=15)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "organizations"
        ordering = ["name"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(slot_hold_minutes__range=(1, 60)),
                name="ck_org_slot_hold_minutes",
            ),
            models.CheckConstraint(
                condition=models.Q(cancellation_cutoff_minutes__gte=0),
                name="ck_org_cancellation_cutoff",
            ),
            models.CheckConstraint(
                condition=models.Q(no_show_grace_minutes__range=(0, 120)),
                name="ck_org_no_show_grace",
            ),
        ]

    def __str__(self):
        return self.name


class Membership(models.Model):
    class Role(models.TextChoices):
        PATIENT = "PATIENT", "Bệnh nhân"
        ORGANIZATION_ADMIN = "ORGANIZATION_ADMIN", "Quản lý toàn chuỗi"
        BRANCH_ADMIN = "BRANCH_ADMIN", "Quản lý chi nhánh"
        DENTIST = "DENTIST", "Nha sĩ"

    id_membership = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        db_column="id_user",
        on_delete=models.PROTECT,
        related_name="memberships",
    )
    organization = models.ForeignKey(
        Organization,
        db_column="id_organization",
        on_delete=models.PROTECT,
        related_name="memberships",
    )
    branch = models.ForeignKey(
        "locations.Branch",
        db_column="id_branch",
        on_delete=models.PROTECT,
        related_name="memberships",
        null=True,
        blank=True,
    )
    role = models.CharField(max_length=30, choices=Role.choices)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "memberships"
        ordering = ["organization", "role", "user"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(
                        role__in=["PATIENT", "ORGANIZATION_ADMIN"],
                        branch__isnull=True,
                    )
                    | models.Q(
                        role__in=["BRANCH_ADMIN", "DENTIST"],
                        branch__isnull=False,
                    )
                ),
                name="ck_memberships_role_scope",
            ),
            models.UniqueConstraint(
                fields=["user", "organization", "branch", "role"],
                nulls_distinct=False,
                name="uq_memberships_scope_role",
            ),
            models.UniqueConstraint(
                fields=["user"],
                condition=models.Q(role="BRANCH_ADMIN", is_active=True),
                name="uq_one_active_branch_admin_per_user",
            ),
            models.UniqueConstraint(
                fields=["branch"],
                condition=models.Q(role="BRANCH_ADMIN", is_active=True),
                name="uq_one_active_branch_admin_per_branch",
            ),
        ]

    def __str__(self):
        scope = self.branch.name if self.branch_id else self.organization.name
        return f"{self.user} - {self.get_role_display()} - {scope}"

    def clean(self):
        super().clean()
        if self.branch_id and self.branch.organization_id != self.organization_id:
            raise ValidationError(
                {"branch": "Chi nhánh phải thuộc cùng organization với membership."}
            )


class StaffInvitation(models.Model):
    class EmailDeliveryStatus(models.TextChoices):
        PENDING = "PENDING", "Đang gửi"
        SENT = "SENT", "Đã gửi"
        FAILED = "FAILED", "Gửi lỗi"

    id_staff_invitation = models.BigAutoField(primary_key=True)
    organization = models.ForeignKey(
        Organization, db_column="id_organization", on_delete=models.PROTECT,
        related_name="staff_invitations",
    )
    branch = models.ForeignKey(
        "locations.Branch", db_column="id_branch", on_delete=models.PROTECT,
        related_name="staff_invitations", null=True, blank=True,
    )
    email = models.EmailField()
    role = models.CharField(max_length=30, choices=Membership.Role.choices)
    token_digest = models.CharField(max_length=64, unique=True)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, db_column="id_invited_by", on_delete=models.PROTECT,
        related_name="staff_invitations_sent",
    )
    expires_at = models.DateTimeField()
    email_delivery_status = models.CharField(
        max_length=20,
        choices=EmailDeliveryStatus.choices,
        default=EmailDeliveryStatus.PENDING,
    )
    email_sent_at = models.DateTimeField(null=True, blank=True)
    email_failed_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "staff_invitations"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["email", "expires_at"], name="idx_staff_invite_email_exp"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(role__in=["ORGANIZATION_ADMIN", "BRANCH_ADMIN"]),
                name="ck_staff_invite_admin_role",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(role="ORGANIZATION_ADMIN", branch__isnull=True)
                    | models.Q(role="BRANCH_ADMIN", branch__isnull=False)
                ),
                name="ck_staff_invite_role_scope",
            ),
        ]

    def __str__(self):
        return f"{self.email} - {self.role} - {self.organization}"

