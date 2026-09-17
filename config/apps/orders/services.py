from __future__ import annotations

from django.db import IntegrityError, transaction
from django.utils.crypto import get_random_string

from .models import Cart, CartItem


CART_SESSION_KEY = "babaei_cart_session"
CART_COUNT_SESSION_KEY = "babaei_cart_item_count"


def _ensure_session_key(request) -> str:
    if not request.session.session_key:
        request.session.save()
    return request.session.session_key


def get_active_cart(request) -> Cart:
    """Return one active cart for the current authenticated user or browser session."""
    if request.user.is_authenticated:
        cart, _ = Cart.objects.get_or_create(user=request.user, status=Cart.Status.ACTIVE)
        return cart

    session_key = _ensure_session_key(request)
    request.session[CART_SESSION_KEY] = session_key
    cart, _ = Cart.objects.get_or_create(
        session_key=session_key,
        user=None,
        status=Cart.Status.ACTIVE,
    )
    return cart


def merge_guest_cart(request, user) -> None:
    """Merge the browser cart into the user's cart after OTP login."""
    session_key = request.session.get(CART_SESSION_KEY) or request.session.session_key
    if not session_key:
        return

    guest = Cart.objects.filter(
        session_key=session_key,
        user__isnull=True,
        status=Cart.Status.ACTIVE,
    ).prefetch_related("items").first()
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
