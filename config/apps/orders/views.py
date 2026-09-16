from __future__ import annotations

from django.contrib import messages
from django.db.models import Case, ExpressionWrapper, F, PositiveBigIntegerField, Sum, When
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from apps.shop.models import Product, ProductVariant

from .models import CartItem
from .services import add_to_cart, clear_cart, get_active_cart, remove_cart_item, update_cart_item


def _is_json_request(request):
    return request.headers.get("X-Requested-With") == "XMLHttpRequest" or "application/json" in request.headers.get("Accept", "")


def _cart_totals(cart):
    """Calculate badge count and subtotal in one SQL aggregation query."""
    unit_price = Case(
        When(variant__isnull=False, then=F("variant__price")),
        default=F("product__base_price"),
        output_field=PositiveBigIntegerField(),
    )
    line_total = ExpressionWrapper(
        F("quantity") * unit_price,
        output_field=PositiveBigIntegerField(),
    )
    totals = cart.items.aggregate(
        count=Sum("quantity", default=0),
        subtotal=Sum(line_total, default=0),
    )
    return {
        "count": totals["count"] or 0,
        "subtotal": totals["subtotal"] or 0,
    }


def cart_view(request):
    cart = get_active_cart(request)
    items = list(
        cart.items.select_related(
            "product__category",
            "variant__color",
            "variant__size",
        ).prefetch_related("product__images")
    )
    totals = _cart_totals(cart)
    return render(
        request,
        "orders/cart.html",
        {
            "cart": cart,
            "items": items,
            "item_count": totals["count"],
            "subtotal": totals["subtotal"],
        },
    )


@require_POST
def cart_add_view(request):
    product_id = request.POST.get("product_id")
    variant_id = request.POST.get("variant_id") or None
    quantity = request.POST.get("quantity", "1")

    product = get_object_or_404(
        Product.objects.select_related("category"),
        pk=product_id,
        is_active=True,
        category__is_active=True,
    )
    variant = None
    if variant_id:
        variant = get_object_or_404(
            ProductVariant,
            pk=variant_id,
            product=product,
            is_active=True,
        )

    try:
        add_to_cart(request, product=product, variant=variant, quantity=quantity)
    except (ValueError, TypeError):
        message = "اطلاعات انتخاب‌شده برای افزودن به سبد صحیح نیست."
        try:
            requested_quantity = int(quantity)
        except (TypeError, ValueError):
            requested_quantity = 0
        if variant is not None and requested_quantity > variant.stock_quantity:
            message = "تعداد انتخاب‌شده بیشتر از موجودی است."
        if _is_json_request(request):
            return JsonResponse({"ok": False, "message": message}, status=400)
        messages.error(request, message)
        return redirect(product.get_absolute_url())

    cart = get_active_cart(request)
    totals = _cart_totals(cart)
    if _is_json_request(request):
        return JsonResponse(
            {
                "ok": True,
                "count": totals["count"],
                "subtotal": totals["subtotal"],
                "message": "محصول به سبد خرید اضافه شد.",
            }
        )
    messages.success(request, "محصول به سبد خرید اضافه شد.")
    return redirect("orders:cart")


@require_POST
def cart_update_view(request, item_id):
    try:
        quantity = int(request.POST.get("quantity", "1"))
        item = update_cart_item(request, item_id, quantity)
        message = "سبد خرید بروزرسانی شد."
        status = 200
    except (ValueError, TypeError, CartItem.DoesNotExist):
        message = "تعداد انتخاب‌شده بیشتر از موجودی است یا معتبر نیست."
        status = 400
        item = None

    if _is_json_request(request):
        cart = get_active_cart(request)
        totals = _cart_totals(cart)
        payload = {
            "ok": status == 200,
            "message": message,
            "count": totals["count"],
            "subtotal": totals["subtotal"],
        }
        if item is not None:
            payload["item_id"] = item.id
            payload["quantity"] = item.quantity
            payload["line_total"] = item.line_total
            payload["stock"] = item.variant.stock_quantity if item.variant_id else None
        return JsonResponse(payload, status=status)

    if status == 200:
        messages.success(request, message)
    else:
        messages.error(request, message)
    return redirect("orders:cart")


@require_POST
def cart_remove_view(request, item_id):
    remove_cart_item(request, item_id)
    if _is_json_request(request):
        cart = get_active_cart(request)
        totals = _cart_totals(cart)
        return JsonResponse({"ok": True, **totals})
    messages.success(request, "محصول از سبد خرید حذف شد.")
    return redirect("orders:cart")


@require_POST
def cart_clear_view(request):
    clear_cart(request)
    if _is_json_request(request):
        return JsonResponse({"ok": True, "count": 0, "subtotal": 0})
    messages.success(request, "سبد خرید خالی شد.")
    return redirect("orders:cart")
