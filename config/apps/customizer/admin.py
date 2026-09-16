from django.contrib import admin

from .models import Artwork, ArtworkAreaPrice, DesignDraft, DesignLayer, DesignerView, PrintArea, PrintAreaView


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
    list_display = ("product", "name", "key", "angle", "sort_order", "is_active")
    list_filter = ("is_active", "product")
    search_fields = ("product__name", "name", "key")
    autocomplete_fields = ("product",)


@admin.register(PrintArea)
class PrintAreaAdmin(admin.ModelAdmin):
    list_display = ("product", "name", "key", "max_width_mm", "max_height_mm", "max_layers", "is_active")
    list_filter = ("is_active", "product")
    search_fields = ("product__name", "name", "key")
    autocomplete_fields = ("product",)
    inlines = (PrintAreaViewInline,)


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
