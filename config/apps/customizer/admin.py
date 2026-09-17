from django.contrib import admin

from .models import Artwork, ArtworkAreaPrice, DesignDraft, DesignLayer, DesignerView, PrintArea, PrintAreaView, Product3DAsset, Product3DSource


class PrintAreaViewInline(admin.TabularInline):
    model = PrintAreaView
    extra = 0


class ArtworkAreaPriceInline(admin.TabularInline):
    model = ArtworkAreaPrice
    extra = 0
    autocomplete_fields = ("area",)


class DesignLayerInline(admin.TabularInline):
    model = DesignLayer
    extra = 0
    readonly_fields = ("artwork", "area", "x", "y", "width", "height", "rotation", "z_index")


@admin.register(Artwork)
class ArtworkAdmin(admin.ModelAdmin):
    list_display = ("name", "source", "base_price", "processing_status", "background_removed", "is_active", "created_at")
    list_filter = ("source", "processing_status", "background_removed", "is_active")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    inlines = (ArtworkAreaPriceInline,)


@admin.register(DesignerView)
class DesignerViewAdmin(admin.ModelAdmin):
    list_display = ("product", "name", "key", "has_3d_model", "angle", "sort_order", "is_active")
    list_filter = ("is_active", "product")
    search_fields = ("product__name", "name", "key")
    autocomplete_fields = ("product",)
    fieldsets = (
        (None, {"fields": ("product", "key", "name", "is_active", "sort_order", "angle")}),
        ("نمای دوبعدی", {"fields": ("background_image", "mask_image", "canvas_width", "canvas_height")}),
        ("مدل سه‌بعدی", {"fields": ("model_3d", "model_3d_url", "model_3d_scale")}),
    )

    @admin.display(boolean=True, description="مدل ۳D")
    def has_3d_model(self, obj):
        return bool(obj.model_3d or obj.model_3d_url)


@admin.register(PrintArea)
class PrintAreaAdmin(admin.ModelAdmin):
    list_display = ("product", "name", "key", "max_width_mm", "max_height_mm", "max_layers", "is_active")
    list_filter = ("is_active", "product")
    search_fields = ("product__name", "name", "key")
    autocomplete_fields = ("product",)
    inlines = (PrintAreaViewInline,)


@admin.register(Product3DAsset)
class Product3DAssetAdmin(admin.ModelAdmin):
    list_display = ("product", "status", "provider", "progress", "task_id", "updated_at")
    list_filter = ("status", "provider")
    search_fields = ("product__name", "task_id", "error_message")
    autocomplete_fields = ("product",)
    readonly_fields = ("status", "task_id", "progress", "analysis", "source_signature", "error_message", "created_at", "updated_at")
    fieldsets = (
        (None, {"fields": ("product", "provider", "status", "progress", "task_id")}),
        ("مدل نهایی", {"fields": ("model_3d", "model_url", "preview_image")}),
        ("تحلیل تصاویر", {"fields": ("analysis", "source_signature", "error_message")}),
        ("زمان‌ها", {"fields": ("created_at", "updated_at")}),
    )


@admin.register(Product3DSource)
class Product3DSourceAdmin(admin.ModelAdmin):
    list_display = ("asset", "product_image", "background_removed", "sort_order", "created_at")
    list_filter = ("background_removed",)
    autocomplete_fields = ("asset", "product_image")
    readonly_fields = ("created_at",)


@admin.register(DesignDraft)
class DesignDraftAdmin(admin.ModelAdmin):
    list_display = ("uuid", "product", "variant", "status", "total_price", "user", "updated_at")
    list_filter = ("status", "product")
    search_fields = ("uuid", "product__name", "session_key")
    autocomplete_fields = ("product", "variant", "user")
    readonly_fields = ("uuid", "payload", "total_price", "created_at", "updated_at")
    inlines = (DesignLayerInline,)


@admin.register(ArtworkAreaPrice)
class ArtworkAreaPriceAdmin(admin.ModelAdmin):
    list_display = ("artwork", "area", "price")
    search_fields = ("artwork__name", "area__name", "area__product__name")
    list_filter = ("area__product",)
    autocomplete_fields = ("artwork", "area")


@admin.register(DesignLayer)
class DesignLayerAdmin(admin.ModelAdmin):
    list_display = ("draft", "artwork", "area", "x", "y", "width", "height", "rotation", "z_index")
    search_fields = ("draft__uuid", "artwork__name", "area__name")
    autocomplete_fields = ("draft", "artwork", "area")
