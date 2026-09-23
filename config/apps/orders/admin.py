from django.contrib import admin, messages
from django.db.models import Count
from django.utils import timezone
from django.utils.html import format_html

from .models import Cart, CartItem, Order, OrderItem


class OrdersAdminMixin:
    show_full_result_count = False
    list_per_page = 30


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    readonly_fields = ("added_at", "updated_at", "unit_price", "line_total")
    fields = ("product", "variant", "quantity", "unit_price", "line_total", "added_at", "updated_at")
    autocomplete_fields = ("product", "variant")


@admin.register(Cart)
class CartAdmin(OrdersAdminMixin, admin.ModelAdmin):
    list_display = ("id", "owner_display", "status_badge", "item_count_display", "updated_at")
    list_filter = ("status", "updated_at")
    search_fields = ("user__phone", "user__first_name", "user__last_name", "session_key", "uuid")
    list_select_related = ("user",)
    readonly_fields = ("uuid", "created_at", "updated_at", "item_count", "subtotal")
    inlines = (CartItemInline,)
    date_hierarchy = "updated_at"

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_item_count=Count("items"))

    @admin.display(description="مالک")
    def owner_display(self, obj):
        if obj.user_id:
            name = f"{obj.user.first_name} {obj.user.last_name}".strip()
            return format_html('<strong>{}</strong><small class="ba-subline">{}</small>', name or "مشتری", obj.user.phone)
        return format_html('<strong>مهمان</strong><small class="ba-subline">{}</small>', obj.session_key or "—")

    @admin.display(description="وضعیت")
    def status_badge(self, obj):
        css = {"active":"is-on","converted":"is-gold","abandoned":"is-danger"}.get(obj.status, "is-off")
        return format_html('<span class="ba-status {}">{}</span>', css, obj.get_status_display())

    @admin.display(description="آیتم", ordering="_item_count")
    def item_count_display(self, obj):
        return obj._item_count


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    can_delete = False
    readonly_fields = ("product", "variant", "product_name", "variant_sku", "color_name", "size_name", "unit_price", "compare_at_price", "quantity", "line_total")
    fields = ("product", "product_name", "variant_sku", "color_name", "size_name", "quantity", "unit_price", "line_total")


@admin.action(description="انتقال به در حال آماده‌سازی")
def mark_processing(modeladmin, request, queryset):
    queryset.update(status=Order.Status.PROCESSING)


@admin.action(description="علامت‌گذاری پرداخت‌شده")
def mark_paid(modeladmin, request, queryset):
    from .services import process_manual_payment

    succeeded = 0
    failed = 0
    for order in queryset:
        try:
            process_manual_payment(order=order, success=True)
        except ValueError as exc:
            failed += 1
            modeladmin.message_user(request, f"{order.number}: {exc}", level=messages.ERROR)
        else:
            succeeded += 1
    if succeeded:
        modeladmin.message_user(request, f"{succeeded} سفارش به‌عنوان پرداخت‌شده ثبت شد.")
    if failed:
        modeladmin.message_user(request, f"{failed} سفارش به دلیل موجودی یا وضعیت سفارش ثبت نشد.", level=messages.WARNING)


@admin.action(description="انتقال به ارسال‌شده")
def mark_shipped(modeladmin, request, queryset):
    queryset.update(status=Order.Status.SHIPPED, shipping_status=Order.ShippingStatus.SHIPPED, shipped_at=timezone.now())


@admin.action(description="انتقال به تحویل‌شده")
def mark_delivered(modeladmin, request, queryset):
    queryset.update(status=Order.Status.DELIVERED, shipping_status=Order.ShippingStatus.DELIVERED, delivered_at=timezone.now())


@admin.action(description="لغو سفارش‌های انتخاب‌شده")
def cancel_orders(modeladmin, request, queryset):
    queryset.update(status=Order.Status.CANCELLED, cancelled_at=timezone.now())


@admin.register(Order)
class OrderAdmin(OrdersAdminMixin, admin.ModelAdmin):
    list_display = ("number", "customer_display", "status_badge", "payment_badge", "shipping_badge", "total_display", "created_at")
    list_filter = ("status", "payment_status", "shipping_status", "created_at")
    search_fields = ("number", "user__phone", "user__first_name", "user__last_name", "payment_reference", "shipping_phone")
    readonly_fields = ("uuid", "number", "created_at", "updated_at", "paid_at", "shipped_at", "delivered_at", "cancelled_at", "total_display_readonly")
    inlines = (OrderItemInline,)
    list_select_related = ("user",)
    date_hierarchy = "created_at"
    actions = (mark_paid, mark_processing, mark_shipped, mark_delivered, cancel_orders)
    fieldsets = (
        ("سفارش", {"fields": ("number", "user", "status", "payment_status", "shipping_status")}),
        ("مبالغ", {"fields": ("subtotal", "discount_amount", "shipping_amount", "total_amount", "currency")}),
        ("گیرنده و ارسال", {"fields": ("shipping_title", "shipping_recipient", "shipping_phone", "shipping_province", "shipping_city", "shipping_postal_code", "shipping_address")}),
        ("پرداخت", {"fields": ("payment_reference", "paid_at")}),
        ("یادداشت‌ها", {"fields": ("customer_note", "admin_note")}),
        ("زمان‌بندی", {"fields": ("shipped_at", "delivered_at", "cancelled_at", "created_at", "updated_at"), "classes": ("collapse",)}),
        ("سیستم", {"fields": ("uuid",), "classes": ("collapse",)}),
    )

    @admin.display(description="مشتری")
    def customer_display(self, obj):
        name = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return format_html('<strong>{}</strong><small class="ba-subline">{}</small>', name or "مشتری", obj.user.phone)

    def _status(self, value, mapping):
        return format_html('<span class="ba-status {}">{}</span>', mapping.get(value, "is-off"), dict(mapping_display(value)).get(value, value))

    @admin.display(description="وضعیت")
    def status_badge(self, obj):
        css = {"pending":"is-warning","paid":"is-gold","processing":"is-blue","shipped":"is-blue","delivered":"is-on","cancelled":"is-danger","refunded":"is-danger"}
        return format_html('<span class="ba-status {}">{}</span>', css.get(obj.status, "is-off"), obj.get_status_display())

    @admin.display(description="پرداخت")
    def payment_badge(self, obj):
        css = {"unpaid":"is-warning","pending":"is-warning","paid":"is-on","failed":"is-danger","refunded":"is-danger"}
        return format_html('<span class="ba-status {}">{}</span>', css.get(obj.payment_status, "is-off"), obj.get_payment_status_display())

    @admin.display(description="ارسال")
    def shipping_badge(self, obj):
        css = {"pending":"is-warning","preparing":"is-blue","shipped":"is-blue","delivered":"is-on","returned":"is-danger"}
        return format_html('<span class="ba-status {}">{}</span>', css.get(obj.shipping_status, "is-off"), obj.get_shipping_status_display())

    @admin.display(description="مبلغ")
    def total_display(self, obj):
        return format_html('<strong class="ba-price">{}</strong> <small>تومان</small>', f"{obj.total_amount:,}")

    @admin.display(description="جمع نهایی")
    def total_display_readonly(self, obj):
        return self.total_display(obj)


def mapping_display(value):
    return []  # compatibility helper; not used for rendered badges
