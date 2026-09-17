from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from apps.shop.models import Product, ProductImage

from .models import FavoriteProduct, SavedProduct


def _back(request, fallback="users:saved"):
    return redirect(request.POST.get("next") or request.META.get("HTTP_REFERER") or fallback)


@login_required
@require_POST
def toggle_favorite(request, product_id):
    product = get_object_or_404(Product, pk=product_id, is_active=True)
    favorite, created = FavoriteProduct.objects.get_or_create(user=request.user, product=product)
    if not created:
        favorite.delete()
        messages.success(request, "محصول از علاقه‌مندی‌ها حذف شد.")
    else:
        messages.success(request, "محصول به علاقه‌مندی‌ها اضافه شد.")
    return _back(request)


@login_required
@require_POST
def toggle_saved(request, product_id):
    product = get_object_or_404(Product, pk=product_id, is_active=True)
    saved, created = SavedProduct.objects.get_or_create(user=request.user, product=product)
    if not created:
        saved.delete()
        messages.success(request, "محصول از ذخیره‌شده‌ها حذف شد.")
    else:
        messages.success(request, "محصول ذخیره شد.")
    return _back(request)


@login_required
def saved_page(request):
    favorite_ids = set(FavoriteProduct.objects.filter(user=request.user).values_list("product_id", flat=True))
    saved_ids = set(SavedProduct.objects.filter(user=request.user).values_list("product_id", flat=True))
    favorite_products = list(
        Product.objects.filter(id__in=favorite_ids, is_active=True)
        .select_related("category")
        .prefetch_related("images")
    )
    saved_products = list(
        Product.objects.filter(id__in=saved_ids, is_active=True)
        .select_related("category")
        .prefetch_related("images")
    )
    return render(request, "users/account/saved.html", {
        "favorite_products": favorite_products,
        "saved_products": saved_products,
        "favorite_count": len(favorite_products),
        "saved_count": len(saved_products),
    })
