from django.contrib import admin

from .models import FavoriteProduct, SavedProduct


@admin.register(FavoriteProduct)
class FavoriteProductAdmin(admin.ModelAdmin):
    list_display = ("user", "product", "created_at")
    search_fields = ("user__phone", "user__first_name", "user__last_name", "product__name")
    list_select_related = ("user", "product")
    ordering = ("-created_at",)
    list_per_page = 50


@admin.register(SavedProduct)
class SavedProductAdmin(admin.ModelAdmin):
    list_display = ("user", "product", "created_at")
    search_fields = ("user__phone", "user__first_name", "user__last_name", "product__name")
    list_select_related = ("user", "product")
    ordering = ("-created_at",)
    list_per_page = 50
