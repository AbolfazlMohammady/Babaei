from __future__ import annotations

from django.db import IntegrityError, transaction

from .models import Cart, CartItem


CART_SESSION_KEY = "babaei_cart_session"
CART_COUNT_SESSION_KEY = "babaei_cart_item_count"
CART_PRODUCTS_SESSION_KEY = "babaei_cart_products"


def _ensure_session_key(request) -> str:
    if not request.session.session_key:
        request.session.save()
    return request.session.session_key


def get_active_cart(request) -> Cart:
    cached_cart = getattr(request, "_babaei_active_cart", None)
    if cached_cart is not None:
        return cached_cart
    if request.user.is_authenticated:
        cart, _ = Cart.objects.get_or_create(user=request.user, status=Cart.Status.ACTIVE)
    else:
        session_key = _ensure_session_key(request)
        request.session[CART_SESSION_KEY] = session_key
        cart, _ = Cart.objects.get_or_create(session_key=session_key, user=None, status=Cart.Status.ACTIVE)
    request._babaei_active_cart = cart
    return cart


def _product_cart_cache(request) -> dict:
    value = request.session.get(CART_PRODUCTS_SESSION_KEY, {})
    return value if isinstance(value, dict) else {}


def cache_cart_items(request, items) -> None:
    cache = {}
    for item in items:
        product_key = str(item.product_id)
        product_cache = cache.setdefault(product_key, {})
        product_cache[str(item.variant_id) if item.variant_id else "base"] = item.quantity
    request.session[CART_PRODUCTS_SESSION_KEY] = cache
    request._babaei_cart_products = cache


def invalidate_product_cart_cache(request) -> None:
    request.session.pop(CART_PRODUCTS_SESSION_KEY, None)
    request._babaei_cart_products = {}


def get_product_cart_variants(request, product_id: int):
    cached = getattr(request, "_babaei_cart_products", None)
    if cached is None:
        cached = _product_cart_cache(request)
        request._babaei_cart_products = cached

    product_data = cached.get(str(product_id))
    if product_data is not None:
        return {None if key == "base" else int(key): int(value) for key, value in product_data.items()}

    # Backward-compatible lazy warm-up for sessions created before this cache existed.
    if request.user.is_authenticated:
        rows = CartItem.objects.filter(
            cart__user=request.user,
            cart__status=Cart.Status.ACTIVE,
            product_id=product_id,
        ).values_list("variant_id", "quantity")
    else:
        session_key = request.session.get(CART_SESSION_KEY) or request.session.session_key
        if not session_key:
            return {}
        rows = CartItem.objects.filter(
            cart__session_key=session_key,
            cart__user__isnull=True,
            cart__status=Cart.Status.ACTIVE,
            product_id=product_id,
        ).values_list("variant_id", "quantity")
    result = dict(rows)
    product_cache = {"base" if variant_id is None else str(variant_id): quantity for variant_id, quantity in result.items()}
    cached[str(product_id)] = product_cache
    request.session[CART_PRODUCTS_SESSION_KEY] = cached
    return result


def merge_guest_cart(request, user) -> None:
    session_key = request.session.get(CART_SESSION_KEY) or request.session.session_key
    if not session_key:
        return
    guest = Cart.objects.filter(session_key=session_key, user__isnull=True, status=Cart.Status.ACTIVE).first()
    if not guest:
        return
    with transaction.atomic():
        user_cart, _ = Cart.objects.get_or_create(user=user, status=Cart.Status.ACTIVE)
        for guest_item in guest.items.select_related("product", "variant").select_for_update():
            item, created = CartItem.objects.get_or_create(
                cart=user_cart,
                product=guest_item.product,
                variant=guest_item.variant,
                defaults={"quantity": guest_item.quantity},
            )
            if not created:
                item.quantity += guest_item.quantity
                if item.variant_id:
                    item.quantity = min(item.quantity, item.variant.stock_quantity)
                item.save(update_fields=["quantity", "updated_at"])
        guest.status = Cart.Status.CONVERTED
        guest.save(update_fields=["status", "updated_at"])
    request.session.pop(CART_SESSION_KEY, None)
    invalidate_product_cart_cache(request)


def add_to_cart(request, *, product, variant=None, quantity=1) -> CartItem:
    quantity = int(quantity)
    if quantity < 1:
        raise ValueError("تعداد باید حداقل ۱ باشد.")
    with transaction.atomic():
        cart = get_active_cart(request)
        if variant is not None:
            if variant.product_id != product.id:
                raise ValueError("ترکیب انتخاب‌شده متعلق به این محصول نیست.")
            variant = type(variant).objects.select_for_update().get(pk=variant.pk)
            if not variant.is_active or not product.is_active or not product.category.is_active:
                raise ValueError("این محصول دیگر قابل خرید نیست.")
            if variant.stock_quantity < quantity:
                raise ValueError("تعداد انتخاب‌شده بیشتر از موجودی است.")
        elif product.variants.filter(is_active=True).exists():
            raise ValueError("لطفاً رنگ و سایز محصول را انتخاب کنید.")
        item, created = CartItem.objects.select_for_update().get_or_create(
            cart=cart,
            product=product,
            variant=variant,
            defaults={"quantity": quantity},
        )
        if not created:
            new_quantity = item.quantity + quantity
            if variant is not None and new_quantity > variant.stock_quantity:
                raise ValueError("تعداد انتخاب‌شده بیشتر از موجودی است.")
            item.quantity = new_quantity
            item.save(update_fields=["quantity", "updated_at"])
        return item


def update_cart_item(request, item_id: int, quantity: int) -> CartItem:
    quantity = int(quantity)
    if quantity < 1:
        raise ValueError("تعداد باید حداقل ۱ باشد.")
    with transaction.atomic():
        cart = get_active_cart(request)
        item = CartItem.objects.select_for_update().select_related("variant").get(cart=cart, pk=item_id)
        if item.variant_id:
            variant = type(item.variant).objects.select_for_update().get(pk=item.variant_id)
            if quantity > variant.stock_quantity:
                raise ValueError("تعداد انتخاب‌شده بیشتر از موجودی است.")
        item.quantity = quantity
        item.save(update_fields=["quantity", "updated_at"])
        return item


def remove_cart_item(request, item_id: int) -> None:
    cart = get_active_cart(request)
    CartItem.objects.filter(cart=cart, pk=item_id).delete()


def clear_cart(request) -> None:
    cart = get_active_cart(request)
    cart.items.all().delete()
