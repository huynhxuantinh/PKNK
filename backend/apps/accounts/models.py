from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email là bắt buộc.")
        email = self.normalize_email(email).strip().lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser phải có is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser phải có is_superuser=True.")
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    id_user = models.BigAutoField(primary_key=True)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=200)
    phone = models.CharField(max_length=16, blank=True, default="")
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    date_joined = models.DateTimeField(default=timezone.now, editable=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        db_table = "users"
        ordering = ["-date_joined"]
        constraints = [
            models.UniqueConstraint(Lower("email"), name="uq_users_email_ci"),
        ]

    def __str__(self):
        return self.email


class EmailVerificationToken(models.Model):
    id_email_verification_token = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        User,
        db_column="id_user",
        on_delete=models.CASCADE,
        related_name="email_verification_tokens",
    )
    token_digest = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "email_verification_tokens"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["user", "expires_at"],
                name="idx_email_verify_user_exp",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(used_at__isnull=True)
                | models.Q(used_at__gte=models.F("created_at")),
                name="ck_email_verify_used_after_created",
            ),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.expires_at.isoformat()}"


class PasswordResetToken(models.Model):
    id_password_reset_token = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        User,
        db_column="id_user",
        on_delete=models.CASCADE,
        related_name="password_reset_tokens",
    )
    token_digest = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "password_reset_tokens"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["user", "expires_at"],
                name="idx_password_reset_user_exp",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(used_at__isnull=True)
                | models.Q(used_at__gte=models.F("created_at")),
                name="ck_password_reset_used_after_created",
            ),
            models.UniqueConstraint(
                fields=["user"],
                condition=models.Q(used_at__isnull=True),
                name="uq_password_reset_one_unused",
            ),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.expires_at.isoformat()}"


class PatientProfile(models.Model):
    class Gender(models.TextChoices):
        MALE = "MALE", "Nam"
        FEMALE = "FEMALE", "Nữ"
        OTHER = "OTHER", "Khác"

    id_patient_profile = models.BigAutoField(primary_key=True)
    user = models.OneToOneField(
        User,
        db_column="id_user",
        on_delete=models.PROTECT,
        related_name="patient_profile",
    )
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(
        max_length=20,
        choices=Gender.choices,
        null=True,
        blank=True,
    )
    phone = models.CharField(max_length=20, null=True, blank=True)
    province = models.ForeignKey(
        "locations.Province",
        db_column="province_code",
        on_delete=models.PROTECT,
        related_name="patient_profiles",
        null=True,
        blank=True,
    )
    ward = models.ForeignKey(
        "locations.Ward",
        db_column="ward_code",
        on_delete=models.PROTECT,
        related_name="patient_profiles",
        null=True,
        blank=True,
    )
    address_line = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "patient_profiles"
        indexes = [
            models.Index(
                fields=["ward", "province"],
                name="idx_patient_ward_province",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(gender__isnull=True)
                | models.Q(gender__in=["MALE", "FEMALE", "OTHER"]),
                name="ck_patient_profiles_gender",
            ),
            models.CheckConstraint(
                condition=models.Q(ward__isnull=True)
                | models.Q(province__isnull=False),
                name="ck_patient_profiles_ward_requires_province",
            ),
        ]

    def __str__(self):
        return self.user.full_name


class ConsentRecord(models.Model):
    id_consent_record = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        User,
        db_column="id_user",
        on_delete=models.PROTECT,
        related_name="consent_records",
    )
    policy_version = models.CharField(max_length=50)
    purpose_code = models.CharField(max_length=100)
    is_granted = models.BooleanField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    evidence = models.JSONField(default=dict)
    consented_at = models.DateTimeField(default=timezone.now)
    withdrawn_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "consent_records"
        ordering = ["-consented_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(withdrawn_at__isnull=True)
                | models.Q(withdrawn_at__gte=models.F("consented_at")),
                name="ck_consent_withdrawn_after_granted",
            ),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.purpose_code}"


class Dentist(models.Model):
    id_dentist = models.BigAutoField(primary_key=True)
    user = models.OneToOneField(
        User,
        db_column="id_user",
        on_delete=models.PROTECT,
        related_name="dentist_profile",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        db_column="id_organization",
        on_delete=models.PROTECT,
        related_name="dentists",
    )
    license_number = models.CharField(max_length=100, null=True, blank=True)
    biography = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dentists"
        ordering = ["user__full_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "license_number"],
                condition=models.Q(license_number__isnull=False),
                name="uq_dentists_org_license",
            ),
        ]

    def __str__(self):
        return self.user.full_name

