from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin
from django.contrib.gis.forms.widgets import OSMWidget
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from .models import (
    AdministrativeUnit,
    Branch,
    BranchImage,
    BranchOpeningHour,
    Chair,
    Holiday,
    Province,
    Ward,
)


class BranchLocationWidget(OSMWidget):
    default_lon = 106.7009
    default_lat = 10.7769
    default_zoom = 13

    class Media:
        css = {"all": ("locations/admin/branch_location.css",)}
        js = ("locations/admin/branch_location.js",)

    def render(self, name, value, attrs=None, renderer=None):
        attrs = attrs or {}
        field_id = attrs.get("id", f"id_{name}")
        controls = format_html(
            '<div class="branch-location-picker" data-field-id="{}">'
            '<label for="{}_search">Tìm vị trí chi nhánh</label>'
            '<div class="branch-location-search-row">'
            '<input id="{}_search" type="search" placeholder="Nhập địa chỉ hoặc tên địa điểm..." autocomplete="off">'
            '<button type="button">Tìm kiếm</button>'
            '</div><div class="branch-location-status" aria-live="polite"></div>'
            '<div class="branch-location-results"></div>'
            '<p class="help">Chọn kết quả tìm kiếm, bấm lên bản đồ hoặc kéo ghim để điều chỉnh vị trí.</p>'
            '</div>',
            field_id,
            field_id,
            field_id,
        )
        map_html = super().render(name, value, attrs, renderer)
        return mark_safe(f"{controls}{map_html}")


@admin.register(AdministrativeUnit)
class AdministrativeUnitAdmin(admin.ModelAdmin):
    list_display = ("code", "full_name", "short_name")
    search_fields = ("full_name", "full_name_en", "short_name")


@admin.register(Province)
class ProvinceAdmin(GISModelAdmin):
    list_display = ("code", "full_name", "administrative_unit")
    search_fields = ("code", "name", "full_name")


@admin.register(Ward)
class WardAdmin(GISModelAdmin):
    list_display = ("code", "full_name", "province")
    list_filter = ("province",)
    search_fields = ("code", "name", "full_name")
    list_select_related = ("province", "administrative_unit")


class BranchOpeningHourInline(admin.TabularInline):
    model = BranchOpeningHour
    extra = 0


class BranchImageInline(admin.TabularInline):
    model = BranchImage
    extra = 0


@admin.register(Branch)
class BranchAdmin(GISModelAdmin):
    gis_widget = BranchLocationWidget
    gis_widget_kwargs = {"attrs": {"map_width": 900, "map_height": 480}}
    list_display = ("code", "name", "organization", "province", "is_active")
    list_filter = ("organization", "province", "is_active")
    search_fields = ("code", "name", "address_line")
    list_select_related = ("organization", "province", "ward")
    inlines = (BranchOpeningHourInline, BranchImageInline)


@admin.register(Holiday)
class HolidayAdmin(admin.ModelAdmin):
    list_display = ("name", "holiday_date", "organization", "branch", "is_closed")
    list_filter = ("organization", "branch", "is_closed")
    list_select_related = ("organization", "branch")


@admin.register(Chair)
class ChairAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "branch", "resource_type", "is_active")
    list_filter = ("branch", "resource_type", "is_active")
    search_fields = ("code", "name", "branch__name")
    list_select_related = ("branch",)
