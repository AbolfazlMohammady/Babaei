from django.db.models import Sum

from .models import Cart
from .services import CART_SESSION_KEY


def cart_context(request):
    """Expose the cart badge without creating a cart on every page request."""
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

    return {
        "cart_item_count": count,
        "cart_url": "/cart/",
    }
