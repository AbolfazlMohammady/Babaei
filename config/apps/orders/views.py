from __future__ import annotations

from django.contrib import messages
from django.db.models import Case, ExpressionWrapper, F, PositiveBigIntegerField, Sum, When
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from apps.shop.models import Product, ProductVariant

from .models import Cart, CartItem
from .services import CART_COUNT_SESSION_KEY, CART_SESSION_KEY, add_to_cart, clear_cart, get_active_cart, remove_cart_item, update_cart_item

AUTH_USER_SESSION_KEY = "_auth_user_id"


def _is_json_request(request):
    return request.headers.get("X-Requested-With") == "XMLHttpRequest" or "application/json" in request.headers.get("Accept", "")


def _remember_cart_count(request, count):
    count = int(count or 0)
    if request.session.get(CART_COUNT_SESSION_KEY) != count:
        request.session[CART_COUNT_SESSION_KEY] = count
    request._babaei_cart_item_count = count
    return count


def _cart_totals(cart, request=None):
    unit_price = Case(When(variant__isnull=False, then=F("variant__price")), default=F("product__base_price"), output_field=PositiveBigIntegerField())
    line_total = ExpressionWrapper(F("quantity") * unit_price, output_field=PositiveBigIntegerField())
    totals = cart.items.aggregate(count=Sum("quantity", default=0), subtotal=Sum(line_total, default=0))
    count = _remember_cart_count(request, totals["count"] or 0) if request is not None else totals["count"] or 0
    return {"count": count, "subtotal": totals["subtotal"] or 0}


def _cart_items_queryset(request):
    queryset = CartItem.objects.select_related("cart", "product__category", "variant__color", "variant__size").prefetch_related("product__images")
    user_id = request.session.get(AUTH_USER_SESSION_KEY)
    if user_id:
        return queryset.filter(cart__user_id=user_id, cart__status=Cart.Status.ACTIVE).order_by("added_at", "id")
    session_key = request.session.get(CART_SESSION_KEY) or request.session.session_key
    if not session_key:
        return queryset.none()
    return queryset.filter(cart__session_key=session_key, cart__user__isnull=True, cart__status=Cart.Status.ACTIVE).order_by("added_at", "id")


def cart_view(request):
    items = list(_cart_items_queryset(request))
    item_count = sum(item.quantity for item in items)
    subtotal = sum(item.line_total for item in items)
    _remember_cart_count(request, item_count)
    cart = items[0].cart if items else None
    return render(request, "orders/cart.html", {"cart": cart, "items": items, "item_count": item_count, "subtotal": subtotal})


@require_POST
def cart_add_view(request):
    product_id = request.POST.get("product_id")
    variant_id = request.POST.get("variant_id") or None
    quantity = request.POST.get("quantity", "1")
    product = get_object_or_404(Product.objects.select_related("category"), pk=product_id, is_active=True, category__is_active=True)
    variant = None
    if variant_id:
        variant = get_object_or_404(ProductVariant, pk=variant_id, product=product, is_active=True)
    try:
        item = add_to_cart(request, product=product, variant=variant, quantity=quantity)
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

    totals = _cart_totals(item.cart, request)
    if _is_json_request(request):
        return JsonResponse({"ok": True, **totals, "item_id": item.id, "variant_id": item.variant_id, "quantity": item.quantity, "message": "محصول به سبد خرید اضافه شد."})
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
        totals = _cart_totals(get_active_cart(request), request)
        payload = {"ok": status == 200, "message": message, **totals}
        if item is not None:
            payload.update({"item_id": item.id, "quantity": item.quantity, "line_total": item.line_total, "stock": item.variant.stock_quantity if item.variant_id else None})
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
        return JsonResponse({"ok": True, **_cart_totals(get_active_cart(request), request)})
    messages.success(request, "محصول از سبد خرید حذف شد.")
    return redirect("orders:cart")


@require_POST
def cart_clear_view(request):
    clear_cart(request)
    _remember_cart_count(request, 0)
    if _is_json_request(request):
        return JsonResponse({"ok": True, "count": 0, "subtotal": 0})
    messages.success(request, "سبد خرید خالی شد.")
    return redirect("orders:cart")
