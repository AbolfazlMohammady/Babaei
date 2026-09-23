from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Case, Exists, IntegerField, OuterRef, Prefetch, Subquery, F
from django.db.models import When
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from apps.shop.models import Product, ProductImage, ProductVariant

from .models import FavoriteProduct, SavedProduct


def _back(request, fallback="users:saved"):
    return redirect(request.POST.get("next") or request.META.get("HTTP_REFERER") or fallback)


@require_POST
def toggle_favorite(request, product_id):
    if not request.user.is_authenticated:
        if request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return JsonResponse({
                "ok": False,
                "login_required": True,
                "login_url": "/account/login/",
            }, status=401)
        return redirect("/account/login/")

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
    variant_price = Subquery(
        ProductVariant.objects.filter(
            product_id=OuterRef("pk"),
            is_active=True,
        ).order_by("price", "id").values("price")[:1],
        output_field=IntegerField(),
    )
    variant_compare_price = Subquery(
        ProductVariant.objects.filter(
            product_id=OuterRef("pk"),
            is_active=True,
        ).order_by("price", "id").values("compare_at_price")[:1],
        output_field=IntegerField(),
    )
    has_variants = Exists(
        ProductVariant.objects.filter(
            product_id=OuterRef("pk"),
            is_active=True,
        )
    )
    favorite_products = list(
        Product.objects.filter(
            favorited_by__user=request.user,
            is_active=True,
            category__is_active=True,
        )
        .select_related("category")
        .annotate(
            listed_price=variant_price,
            listed_compare_price=variant_compare_price,
            has_variants=has_variants,
            is_favorite=Exists(
                FavoriteProduct.objects.filter(
                    user_id=request.user.id,
                    product_id=OuterRef("pk"),
                )
            ),
        )
        .prefetch_related(
            Prefetch(
                "images",
                queryset=ProductImage.objects.annotate(
                    type_priority=Case(
                        When(image_type=ProductImage.ImageType.PRIMARY, then=0),
                        default=1,
                        output_field=IntegerField(),
                    )
                ).order_by("type_priority", "sort_order", "id")[:2],
                to_attr="card_images",
            )
        )
        .order_by("-favorited_by__created_at")
    )
    return render(request, "users/account/saved.html", {
        "favorite_products": favorite_products,
        "favorite_count": len(favorite_products),
    })
