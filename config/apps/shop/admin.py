from django.contrib import admin

from .models import Category, Product, ProductColor, ProductImage, ProductSize, ProductVariant


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "sort_order", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("sort_order", "name")


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0
    fields = ("image", "alt_text", "image_type", "sort_order")


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 0
    fields = ("color", "size", "sku", "price", "stock_quantity", "is_active")


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "base_price", "is_active", "is_featured", "created_at")
    list_filter = ("is_active", "is_featured", "category")
    search_fields = ("name", "slug", "short_description", "description")
    prepopulated_fields = {"slug": ("name",)}
    list_select_related = ("category",)
    inlines = (ProductImageInline, ProductVariantInline)
    readonly_fields = ("uuid", "created_at", "updated_at")


@admin.register(ProductColor)
class ProductColorAdmin(admin.ModelAdmin):
    list_display = ("name", "hex_code", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(ProductSize)
class ProductSizeAdmin(admin.ModelAdmin):
    list_display = ("name", "sort_order", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("sort_order", "name")


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = ("product", "color", "size", "sku", "price", "stock_quantity", "is_active")
    list_filter = ("is_active", "color", "size")
    search_fields = ("product__name", "sku", "color__name", "size__name")
    list_select_related = ("product", "color", "size")


@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    list_display = ("product", "image_type", "sort_order", "alt_text")
    list_filter = ("image_type",)
    search_fields = ("product__name", "alt_text")
    list_select_related = ("product",)
