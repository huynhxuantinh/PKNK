from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import (
    ConsentRecord,
    Dentist,
    EmailVerificationToken,
    PasswordResetToken,
    PatientProfile,
    User,
)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("email",)
    list_display = ("email", "full_name", "is_staff", "is_active")
    search_fields = ("email", "full_name")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Thông tin", {"fields": ("full_name", "email_verified_at")}),
        (
            "Phân quyền",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Thời gian", {"fields": ("last_login", "date_joined")}),
    )
    readonly_fields = ("date_joined", "last_login")
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "full_name",
                    "password1",
                    "password2",
                    "is_staff",
                    "is_active",
                ),
            },
        ),
    )


@admin.register(PatientProfile)
class PatientProfileAdmin(admin.ModelAdmin):
    list_display = ("id_patient_profile", "user", "phone", "gender")
    search_fields = ("user__email", "user__full_name", "phone")
    list_select_related = ("user", "province", "ward")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Dentist)
class DentistAdmin(admin.ModelAdmin):
    list_display = ("id_dentist", "user", "organization", "is_active")
    list_filter = ("organization", "is_active")
    search_fields = ("user__email", "user__full_name", "license_number")
    list_select_related = ("user", "organization")


@admin.register(ConsentRecord)
class ConsentRecordAdmin(admin.ModelAdmin):
    list_display = (
        "id_consent_record",
        "user",
        "purpose_code",
        "is_granted",
        "consented_at",
    )
    list_filter = ("purpose_code", "is_granted")
    search_fields = ("user__email", "policy_version", "purpose_code")
    readonly_fields = (
        "user",
        "policy_version",
        "purpose_code",
        "is_granted",
        "ip_address",
        "user_agent",
        "evidence",
        "consented_at",
        "withdrawn_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(EmailVerificationToken)
class EmailVerificationTokenAdmin(admin.ModelAdmin):
    list_display = ("id_email_verification_token", "user", "expires_at", "used_at")
    search_fields = ("user__email",)
    list_select_related = ("user",)
    readonly_fields = (
        "user",
        "token_digest",
        "expires_at",
        "used_at",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ("id_password_reset_token", "user", "expires_at", "used_at")
    search_fields = ("user__email",)
    list_select_related = ("user",)
    readonly_fields = (
        "user",
        "token_digest",
        "expires_at",
        "used_at",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
