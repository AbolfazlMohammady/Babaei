from django.contrib import admin

from .models import Cart, CartItem, Order, OrderItem


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    readonly_fields = ("added_at", "updated_at")


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "session_key", "status", "item_count", "updated_at")
    list_filter = ("status",)
    search_fields = ("user__phone", "user__first_name", "user__last_name", "session_key")
    readonly_fields = ("uuid", "created_at", "updated_at")
    inlines = (CartItemInline,)


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    can_delete = False
    readonly_fields = ("product", "variant", "product_name", "variant_sku", "color_name", "size_name", "unit_price", "compare_at_price", "quantity", "line_total")


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("number", "user", "status", "payment_status", "shipping_status", "total_amount", "created_at")
    list_filter = ("status", "payment_status", "shipping_status", "created_at")
    search_fields = ("number", "user__phone", "user__first_name", "user__last_name", "payment_reference")
    readonly_fields = ("uuid", "number", "created_at", "updated_at", "paid_at", "shipped_at", "delivered_at", "cancelled_at")
    inlines = (OrderItemInline,)
    list_select_related = ("user",)
