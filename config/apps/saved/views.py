from django.conf import settings
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db.models import Case, IntegerField, Prefetch, When
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from apps.shop.models import Product, ProductImage, ProductVariant

from .models import FavoriteProduct


def _back(request, fallback="users:saved"):
    return redirect(request.POST.get("next") or request.META.get("HTTP_REFERER") or fallback)


@require_POST
def toggle_favorite(request, product_id):
    if not request.user.is_authenticated:
        if request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return JsonResponse({
                "ok": False,
                "login_required": True,
                "login_url": settings.LOGIN_URL,
            }, status=401)
        # The login page is /login/ (settings.LOGIN_URL). The hardcoded
        # /account/login/ that used to sit here was never a route, so an
        # anonymous tap on a heart landed on a 404 instead of the sign-in page.
        return redirect(settings.LOGIN_URL)

    product = get_object_or_404(Product, pk=product_id, is_active=True)
    favorite, created = FavoriteProduct.objects.get_or_create(user=request.user, product=product)
    if not created:
        favorite.delete()
        is_favorite = False
        messages.success(request, "محصول از علاقه‌مندی‌ها حذف شد.")
    else:
        is_favorite = True
        messages.success(request, "محصول به علاقه‌مندی‌ها اضافه شد.")

    if request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return JsonResponse({
            "ok": True,
            "is_favorite": is_favorite,
            "product_id": product.id,
        })

    return _back(request)


@login_required
def saved_page(request):
    """
    Favorites is intentionally kept to a small, predictable query budget:

      1. favorites/products/categories
      2. first two product images
      3. active variants used for card price/variant state
      4. COUNT(*) for the pager

    The previous implementation put three correlated subqueries into the
    product SELECT for every favorite (price, compare price, has variants)
    and then loaded the entire favorites list into memory.
    """
    favorite_products_qs = (
        Product.objects.filter(
            favorited_by__user_id=request.user.id,
            is_active=True,
            category__is_active=True,
        )
        .select_related("category")
        .prefetch_related(
            Prefetch(
                "images",
                queryset=ProductImage.objects.annotate(
                    type_priority=Case(
                        When(
                            image_type=ProductImage.ImageType.PRIMARY,
                            then=0,
                        ),
                        default=1,
                        output_field=IntegerField(),
                    )
                )
                .only(
                    "id",
                    "product_id",
                    "image",
                    "alt_text",
                    "image_type",
                    "sort_order",
                )
                .order_by("type_priority", "sort_order", "id")[:2],
                to_attr="card_images",
            ),
            Prefetch(
                "variants",
                queryset=ProductVariant.objects.filter(is_active=True)
                .only(
                    "id",
                    "product_id",
                    "price",
                    "compare_at_price",
                )
                .order_by("price", "id"),
                to_attr="active_variants",
            ),
        )
        .order_by("-favorited_by__created_at")
    )

    paginator = Paginator(favorite_products_qs, 24)
    page_obj = paginator.get_page(request.GET.get("page"))

    favorite_products = list(page_obj.object_list)
    for product in favorite_products:
        # All rows came through the user's favorite relation, so this avoids
        # another EXISTS query per product.
        product.is_favorite = True
        product.has_variants = bool(product.active_variants)

    return render(
        request,
        "users/account/saved.html",
        {
            "favorite_products": favorite_products,
            "favorite_count": paginator.count,
            "page_obj": page_obj,
        },
    )

