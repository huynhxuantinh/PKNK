from django.contrib import admin

from .models import Appointment, AppointmentStatusHistory, TimeOff, WorkShift


@admin.register(WorkShift)
class WorkShiftAdmin(admin.ModelAdmin):
    list_display = (
        "dentist",
        "branch",
        "weekday",
        "start_time",
        "end_time",
        "valid_from",
        "valid_to",
        "is_active",
    )
    list_filter = ("branch", "weekday", "is_active")
    search_fields = ("dentist__user__full_name", "branch__name")
    list_select_related = ("dentist__user", "branch")


@admin.register(TimeOff)
class TimeOffAdmin(admin.ModelAdmin):
    list_display = ("dentist", "branch", "starts_at", "ends_at", "is_active")
    list_filter = ("branch", "is_active")
    search_fields = ("dentist__user__full_name", "reason")
    list_select_related = ("dentist__user", "branch")


class AppointmentStatusHistoryInline(admin.TabularInline):
    model = AppointmentStatusHistory
    extra = 0
    can_delete = False
    readonly_fields = (
        "from_status",
        "to_status",
        "actor_user",
        "actor_type",
        "reason",
        "created_at",
    )

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = (
        "public_code",
        "patient_profile",
        "branch",
        "dentist",
        "chair",
        "starts_at",
        "status",
    )
    list_filter = ("branch", "status", "dentist")
    search_fields = (
        "public_code",
        "patient_profile__user__full_name",
        "patient_profile__user__email",
    )
    list_select_related = (
        "patient_profile__user",
        "branch",
        "dentist__user",
        "chair",
    )
    readonly_fields = ("occupied_range", "created_at", "updated_at")
    inlines = (AppointmentStatusHistoryInline,)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(AppointmentStatusHistory)
class AppointmentStatusHistoryAdmin(admin.ModelAdmin):
    list_display = (
        "appointment",
        "from_status",
        "to_status",
        "actor_type",
        "actor_user",
        "created_at",
    )
    list_filter = ("to_status", "actor_type")
    search_fields = ("appointment__public_code", "actor_user__email")
    list_select_related = ("appointment", "actor_user")
    readonly_fields = (
        "appointment",
        "from_status",
        "to_status",
        "actor_user",
        "actor_type",
        "reason",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
