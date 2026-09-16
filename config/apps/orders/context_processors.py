from .services import CART_SESSION_KEY, get_active_cart


def cart_context(request):
    count = 0
    if request.user.is_authenticated:
        cart = get_active_cart(request)
        count = sum(item.quantity for item in cart.items.all())
    elif request.session.get(CART_SESSION_KEY) or request.session.session_key:
        cart = get_active_cart(request)
        count = sum(item.quantity for item in cart.items.all())

    return {
        "cart_item_count": count,
        "cart_url": "/cart/",
    }
