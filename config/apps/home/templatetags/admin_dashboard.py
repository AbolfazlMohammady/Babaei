from django import template
from django.db.models import Sum
from django.utils import timezone

from apps.orders.models import Cart, Order
from apps.saved.models import FavoriteProduct, SavedProduct
from apps.shop.models import Category, Product
from apps.customizer.models import DesignDraft
from apps.users.models import User

register = template.Library()


@register.simple_tag
def get_admin_dashboard():
    today = timezone.localdate()
    orders = Order.objects.all()
    return {
        "products": Product.objects.filter(is_active=True).count(),
        "categories": Category.objects.filter(is_active=True).count(),
        "users": User.objects.filter(is_active=True).count(),
        "orders": orders.count(),
        "pending_orders": orders.filter(status=Order.Status.PENDING).count(),
        "processing_orders": orders.filter(status=Order.Status.PROCESSING).count(),
        "shipped_orders": orders.filter(status=Order.Status.SHIPPED).count(),
        "delivered_orders": orders.filter(status=Order.Status.DELIVERED).count(),
        "cancelled_orders": orders.filter(status=Order.Status.CANCELLED).count(),
        "today_orders": orders.filter(created_at__date=today).count(),
        "sales": orders.filter(payment_status=Order.PaymentStatus.PAID).aggregate(total=Sum("total_amount"))["total"] or 0,
        "active_carts": Cart.objects.filter(status=Cart.Status.ACTIVE).count(),
        "favorites": FavoriteProduct.objects.count(),
        "saved": SavedProduct.objects.count(),
        "drafts": DesignDraft.objects.count(),
        "recent_orders": list(
            orders.select_related("user").order_by("-created_at")[:6]
        ),
    }
