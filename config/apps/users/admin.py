from django.contrib import admin

from .models import Address, City, OTP, Province, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("phone", "first_name", "last_name", "role", "is_active", "date_joined")
    list_filter = ("role", "is_active", "is_staff", "gender")
    search_fields = ("phone", "email", "first_name", "last_name")
    readonly_fields = ("uuid", "date_joined", "last_login")
    list_per_page = 50
    ordering = ("-date_joined",)


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "city", "phone", "is_default")
    list_filter = ("is_default", "city__province")
    search_fields = ("title", "user__phone", "user__first_name", "user__last_name", "postal_code")
    list_select_related = ("user", "city", "city__province")
    list_per_page = 50


@admin.register(Province)
class ProvinceAdmin(admin.ModelAdmin):
    search_fields = ("name",)
    ordering = ("name",)


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ("name", "province")
    list_filter = ("province",)
    search_fields = ("name", "province__name")
    list_select_related = ("province",)
    ordering = ("province__name", "name")


@admin.register(OTP)
class OTPAdmin(admin.ModelAdmin):
    list_display = ("phone", "created_at", "expire_at", "is_used")
    list_filter = ("is_used",)
    search_fields = ("phone",)
    readonly_fields = ("created_at",)
    list_per_page = 50
    ordering = ("-created_at",)
