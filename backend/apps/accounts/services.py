import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from .models import (
    ConsentRecord,
    EmailVerificationToken,
    PasswordResetToken,
    PatientProfile,
    User,
)


class InvalidEmailVerificationToken(Exception):
    pass


class InvalidPasswordResetToken(Exception):
    pass


class InvalidCurrentPassword(Exception):
    pass


class PasswordChangeService:
    @staticmethod
    @transaction.atomic
    def change_password(*, user_id, current_password, new_password):
        user = User.objects.select_for_update().get(pk=user_id, is_active=True)
        if not user.check_password(current_password):
            raise InvalidCurrentPassword
        validate_password(new_password, user=user)
        user.set_password(new_password)
        user.save(update_fields=["password"])
        for outstanding_token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=outstanding_token)
        return user


class EmailVerificationService:
    @staticmethod
    def digest(raw_token):
        return hashlib.sha256(raw_token.encode()).hexdigest()

    @classmethod
    @transaction.atomic
    def issue_token(cls, user):
        if user.email_verified_at is not None:
            return None

        now = timezone.now()
        EmailVerificationToken.objects.filter(
            user=user,
            used_at__isnull=True,
        ).update(used_at=now)

        raw_token = secrets.token_urlsafe(32)
        EmailVerificationToken.objects.create(
            user=user,
            token_digest=cls.digest(raw_token),
            expires_at=now
            + timedelta(minutes=settings.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES),
        )
        return raw_token

    @classmethod
    @transaction.atomic
    def verify_token(cls, raw_token, new_password):
        now = timezone.now()
        token_record = (
            EmailVerificationToken.objects.select_for_update()
            .filter(
                token_digest=cls.digest(raw_token),
                used_at__isnull=True,
                expires_at__gt=now,
            )
            .first()
        )
        if token_record is None:
            raise InvalidEmailVerificationToken

        user = User.objects.select_for_update().get(pk=token_record.user_id)
        if user.email_verified_at is not None:
            raise InvalidEmailVerificationToken

        validate_password(new_password, user=user)
        user.set_password(new_password)
        user.email_verified_at = now
        user.save(update_fields=["password", "email_verified_at"])
        EmailVerificationToken.objects.filter(
            user=user,
            used_at__isnull=True,
        ).update(used_at=now)
        for outstanding_token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=outstanding_token)
        return user


class PasswordResetService:
    @staticmethod
    def digest(raw_token):
        return hashlib.sha256(raw_token.encode()).hexdigest()

    @classmethod
    @transaction.atomic
    def issue_token(cls, user):
        now = timezone.now()
        PasswordResetToken.objects.filter(
            user=user,
            used_at__isnull=True,
        ).update(used_at=now)

        raw_token = secrets.token_urlsafe(32)
        PasswordResetToken.objects.create(
            user=user,
            token_digest=cls.digest(raw_token),
            expires_at=now
            + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_TTL_MINUTES),
        )
        return raw_token

    @classmethod
    @transaction.atomic
    def reset_password(cls, *, raw_token, new_password):
        now = timezone.now()
        token_record = (
            PasswordResetToken.objects.select_for_update()
            .filter(
                token_digest=cls.digest(raw_token),
                used_at__isnull=True,
                expires_at__gt=now,
                user__is_active=True,
            )
            .first()
        )
        if token_record is None:
            raise InvalidPasswordResetToken

        user = User.objects.select_for_update().get(pk=token_record.user_id)
        validate_password(new_password, user=user)
        user.set_password(new_password)
        user.save(update_fields=["password"])

        PasswordResetToken.objects.filter(
            user=user,
            used_at__isnull=True,
        ).update(used_at=now)
        for outstanding_token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=outstanding_token)
        return user


class RegistrationService:
    @staticmethod
    @transaction.atomic
    def register_patient(
        *,
        email,
        full_name,
        phone,
        ip_address=None,
        user_agent=None,
    ):
        user = User.objects.create_user(
            email=email,
            full_name=full_name,
            phone=phone,
            password=None,
        )
        PatientProfile.objects.create(user=user)
        ConsentRecord.objects.create(
            user=user,
            policy_version=settings.PRIVACY_POLICY_VERSION,
            purpose_code="HEALTHCARE_SERVICE",
            is_granted=True,
            ip_address=ip_address,
            user_agent=user_agent,
            evidence={"source": "web_registration"},
        )
        return user

    @staticmethod
    @transaction.atomic
    def replace_unverified_patient_registration(
        *,
        email,
        full_name,
        phone,
        ip_address=None,
        user_agent=None,
    ):
        """Refresh a pending registration without creating usable credentials.

        Passwords are set only after the mailbox owner proves control of the
        email through the verification link. A later registration therefore
        cannot take over an account by changing its password.
        """
        user = (
            User.objects.select_for_update()
            .filter(
                email__iexact=email,
                is_active=True,
                email_verified_at__isnull=True,
                patient_profile__isnull=False,
            )
            .first()
        )
        if user is None:
            return None

        user.full_name = full_name
        user.phone = phone
        user.set_unusable_password()
        user.save(update_fields=["full_name", "phone", "password"])
        PatientProfile.objects.select_for_update().get(user=user)
        # Sessions created by a previous registrant must not survive a
        # credential replacement.
        for outstanding_token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=outstanding_token)
        ConsentRecord.objects.create(
            user=user,
            policy_version=settings.PRIVACY_POLICY_VERSION,
            purpose_code="HEALTHCARE_SERVICE",
            is_granted=True,
            ip_address=ip_address,
            user_agent=user_agent,
            evidence={"source": "web_registration_replacement"},
        )
        return user
