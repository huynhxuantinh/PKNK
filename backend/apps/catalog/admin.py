from django.contrib import admin

from .models import BranchService, DentistService, Service


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "name",
        "organization",
        "standard_duration_minutes",
        "standard_price",
        "is_active",
    )
    list_filter = ("organization", "is_active")
    search_fields = ("code", "name")
    list_select_related = ("organization",)


@admin.register(BranchService)
class BranchServiceAdmin(admin.ModelAdmin):
    list_display = ("branch", "service", "price", "is_active")
    list_filter = ("branch", "is_active")
    search_fields = ("branch__name", "service__name", "service__code")
    list_select_related = ("branch", "service")


@admin.register(DentistService)
class DentistServiceAdmin(admin.ModelAdmin):
    list_display = ("dentist", "service")
    list_filter = ("service",)
    search_fields = ("dentist__user__full_name", "service__name")
    list_select_related = ("dentist__user", "service")
