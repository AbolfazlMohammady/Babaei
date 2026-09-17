from django.db.models import Sum

from .models import Cart
from .services import CART_COUNT_SESSION_KEY, CART_SESSION_KEY


def cart_context(request):
    """Expose the cart badge without querying the cart on every page."""
    count = getattr(request, "_babaei_cart_item_count", None)

    if count is None:
        cached_count = request.session.get(CART_COUNT_SESSION_KEY)
        if cached_count is not None:
            count = cached_count
        else:
            count = 0
            if request.user.is_authenticated:
                count = (
                    Cart.objects.filter(user=request.user, status=Cart.Status.ACTIVE)
                    .aggregate(total=Sum("items__quantity", default=0))
                    .get("total")
                    or 0
                )
            else:
                session_key = request.session.get(CART_SESSION_KEY) or request.session.session_key
                if session_key:
                    count = (
                        Cart.objects.filter(
                            session_key=session_key,
                            user__isnull=True,
                            status=Cart.Status.ACTIVE,
                        )
                        .aggregate(total=Sum("items__quantity", default=0))
                        .get("total")
                        or 0
                    )
            request.session[CART_COUNT_SESSION_KEY] = count

    request._babaei_cart_item_count = int(count)
    return {
        "cart_item_count": int(count),
        "cart_url": "/cart/",
    }
