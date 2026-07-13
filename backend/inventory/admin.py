from django.contrib import admin

from .models import (
    AuditLog,
    Brand,
    Category,
    Location,
    Movement,
    MovementMotive,
    Product,
    SystemConfig,
    Unit,
)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "description", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "description")


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ("name", "abbreviation", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "abbreviation")


@admin.register(MovementMotive)
class MovementMotiveAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "description")


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ("name", "parent", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)
    autocomplete_fields = ("parent",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "description",
        "category",
        "brand",
        "location",
        "stock",
        "min_stock",
        "status",
    )
    list_filter = ("status", "category", "brand", "unit", "location")
    search_fields = ("code", "description", "observations")
    autocomplete_fields = ("category", "brand", "unit", "location")
    readonly_fields = ()


@admin.register(Movement)
class MovementAdmin(admin.ModelAdmin):
    list_display = ("product", "type", "quantity", "motive", "responsible", "datetime")
    list_filter = ("type", "datetime", "motive")
    search_fields = ("product__code", "product__description", "observations", "motive__name")
    autocomplete_fields = ("product", "responsible", "motive")
    readonly_fields = ("previous_stock", "result_stock", "datetime")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("action", "user", "timestamp")
    list_filter = ("action", "timestamp")
    search_fields = ("action", "details", "user__username")
    readonly_fields = ("user", "action", "details", "timestamp")


@admin.register(SystemConfig)
class SystemConfigAdmin(admin.ModelAdmin):
    list_display = ("institution_name", "code_prefix", "default_min_stock")
