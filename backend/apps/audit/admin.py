from django.contrib import admin

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "action",
        "resource_type",
        "resource_id",
        "actor_user",
        "organization",
        "branch",
    )
    list_filter = ("access_type", "action", "organization", "branch")
    search_fields = ("resource_type", "resource_id", "actor_user__email")
    readonly_fields = [field.name for field in AuditEvent._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
