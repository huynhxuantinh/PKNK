from django.contrib import admin

from .models import Membership, Organization, StaffInvitation


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "auto_confirm", "is_active")
    list_filter = ("auto_confirm", "is_active")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "organization", "branch", "role", "is_active")
    list_filter = ("organization", "branch", "role", "is_active")
    search_fields = ("user__email", "user__full_name")
    list_select_related = ("user", "organization", "branch")


@admin.register(StaffInvitation)
class StaffInvitationAdmin(admin.ModelAdmin):
    list_display = ("email", "organization", "branch", "role", "expires_at", "accepted_at", "revoked_at")
    list_filter = ("organization", "role")
    readonly_fields = [field.name for field in StaffInvitation._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
