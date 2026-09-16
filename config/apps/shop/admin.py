from django.contrib import admin

from .models import Category, Product, ProductColor, ProductImage, ProductSize, ProductVariant


class ShopAdminMixin:
    show_full_result_count = False


@admin.register(Category)
class CategoryAdmin(ShopAdminMixin, admin.ModelAdmin):
    list_display = ("name", "is_active", "sort_order", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("sort_order", "name")
    list_per_page = 50


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0
    fields = ("image", "alt_text", "image_type", "sort_order")


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 0
    fields = ("color", "size", "sku", "price", "stock_quantity", "is_active")
    autocomplete_fields = ("color", "size")


@admin.register(Product)
class ProductAdmin(ShopAdminMixin, admin.ModelAdmin):
    list_display = ("name", "category", "base_price", "is_active", "is_featured", "created_at")
    list_filter = ("is_active", "is_featured", "category")
    search_fields = ("name", "slug", "short_description", "description")
    prepopulated_fields = {"slug": ("name",)}
    list_select_related = ("category",)
    autocomplete_fields = ("category",)
    inlines = (ProductImageInline, ProductVariantInline)
    readonly_fields = ("uuid", "created_at", "updated_at")
    list_per_page = 50


@admin.register(ProductColor)
class ProductColorAdmin(ShopAdminMixin, admin.ModelAdmin):
    list_display = ("name", "hex_code", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    list_per_page = 50


@admin.register(ProductSize)
class ProductSizeAdmin(ShopAdminMixin, admin.ModelAdmin):
    list_display = ("name", "sort_order", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("sort_order", "name")
    list_per_page = 50


@admin.register(ProductVariant)
class ProductVariantAdmin(ShopAdminMixin, admin.ModelAdmin):
    list_display = ("product", "color", "size", "sku", "price", "stock_quantity", "is_active")
    list_filter = ("is_active", "color", "size")
    search_fields = ("product__name", "sku", "color__name", "size__name")
    list_select_related = ("product", "color", "size")
    autocomplete_fields = ("product", "color", "size")
    list_per_page = 50


@admin.register(ProductImage)
class ProductImageAdmin(ShopAdminMixin, admin.ModelAdmin):
    list_display = ("product", "image_type", "sort_order", "alt_text")
    list_filter = ("image_type",)
    search_fields = ("product__name", "alt_text")
    list_select_related = ("product",)
    autocomplete_fields = ("product",)
    list_per_page = 50
