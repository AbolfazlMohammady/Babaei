from __future__ import annotations

import json

from django.conf import settings
from django.db.models import Case, IntegerField, OuterRef, Prefetch, Subquery, When
from django.http import HttpResponsePermanentRedirect
from django.shortcuts import get_object_or_404
from django.utils.safestring import mark_safe
from django.views.generic import DetailView, ListView

from apps.orders.services import get_active_cart

from .models import Category, Product, ProductImage, ProductVariant


def absolute_url(request, path):
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return f"{settings.SITE_URL}{path}"


def schema_json(data):
    return mark_safe(json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c"))


def toman_to_irr(value):
    return value * 10


def price_annotations():
    variants = ProductVariant.objects.filter(product_id=OuterRef("pk"), is_active=True).order_by("price", "id")
    return (
        Subquery(variants.values("price")[:1], output_field=IntegerField()),
        Subquery(variants.values("compare_at_price")[:1], output_field=IntegerField()),
    )


class ShopIndexView(ListView):
    template_name = "shop/index.html"
    context_object_name = "products"

    def get_queryset(self):
        primary_images = ProductImage.objects.filter(image_type=ProductImage.ImageType.PRIMARY).only(
            "id", "product_id", "image", "alt_text"
        )
        variant_price, variant_compare_price = price_annotations()
        return (
            Product.objects.filter(is_active=True, category__is_active=True)
            .select_related("category")
            .annotate(listed_price=variant_price, listed_compare_price=variant_compare_price)
            .prefetch_related(Prefetch("images", queryset=primary_images, to_attr="primary_images"))
            .order_by("-is_featured", "-created_at")[:24]
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["categories"] = Category.objects.filter(is_active=True).only("id", "name", "slug", "image")
        context["canonical_url"] = absolute_url(self.request, self.request.path)
        context["og_title"] = "فروشگاه لباس و تی‌شرت | BABAEI"
        context["og_description"] = "خرید تی‌شرت و لباس از BABAEI؛ انتخاب مدل، رنگ و سایز و آماده برای شخصی‌سازی."
        context["og_image_url"] = absolute_url(self.request, "/static/images/home/Tshirt.png")
        context["website_schema"] = schema_json(
            {
                "@context": "https://schema.org",
                "@type": "WebSite",
                "name": "BABAEI",
                "url": settings.SITE_URL,
                "inLanguage": "fa-IR",
            }
        )
        return context


class CategoryDetailView(ListView):
    template_name = "shop/category.html"
    context_object_name = "products"
    paginate_by = 24

    def get_queryset(self):
        self.category = get_object_or_404(
            Category.objects.only("id", "name", "slug", "description", "seo_title", "seo_description", "image"),
            slug=self.kwargs["slug"],
            is_active=True,
        )
        primary_images = ProductImage.objects.filter(image_type=ProductImage.ImageType.PRIMARY).only(
            "id", "product_id", "image", "alt_text"
        )
        variant_price, variant_compare_price = price_annotations()
        return (
            Product.objects.filter(category_id=self.category.id, is_active=True)
            .select_related("category")
            .annotate(listed_price=variant_price, listed_compare_price=variant_compare_price)
            .prefetch_related(Prefetch("images", queryset=primary_images, to_attr="primary_images"))
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["category"] = self.category
        context["canonical_url"] = absolute_url(self.request, self.request.path)
        context["og_title"] = self.category.seo_title or self.category.name
        context["og_description"] = self.category.seo_description or self.category.description or self.category.name
        context["og_image_url"] = absolute_url(self.request, self.category.image.url) if self.category.image else None
        context["category_schema"] = schema_json(
            {
                "@context": "https://schema.org",
                "@type": "CollectionPage",
                "name": self.category.name,
                "url": context["canonical_url"],
                "description": self.category.seo_description or self.category.description,
                "inLanguage": "fa-IR",
            }
        )
        return context

    def get(self, request, *args, **kwargs):
        if request.GET.get("page") == "1":
            return HttpResponsePermanentRedirect(request.path)
        return super().get(request, *args, **kwargs)


class ProductDetailView(DetailView):
    template_name = "shop/product_detail.html"
    context_object_name = "product"
    slug_field = "slug"
    slug_url_kwarg = "slug"

    def get_queryset(self):
        images = (
            ProductImage.objects.only("id", "product_id", "image", "alt_text", "image_type", "sort_order")
            .annotate(
                type_priority=Case(
                    When(image_type=ProductImage.ImageType.PRIMARY, then=0),
                    When(image_type=ProductImage.ImageType.DETAIL, then=1),
                    default=2,
                    output_field=IntegerField(),
                )
            )
            .order_by("type_priority", "sort_order", "id")
        )
        variants = (
            ProductVariant.objects.filter(is_active=True)
            .select_related("color", "size")
            .only(
                "id", "product_id", "color_id", "size_id", "sku", "price", "compare_at_price", "stock_quantity",
                "color__id", "color__name", "color__slug", "color__hex_code",
                "size__id", "size__name", "size__slug", "size__sort_order",
            )
            .order_by("color__name", "size__sort_order", "size__name")
        )
        return (
            Product.objects.filter(is_active=True, category__is_active=True)
            .select_related("category")
            .prefetch_related(
                Prefetch("images", queryset=images, to_attr="gallery_images"),
                Prefetch("variants", queryset=variants, to_attr="active_variants"),
            )
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        canonical_url = absolute_url(self.request, self.request.path)
        breadcrumbs = [
            {"name": "فروشگاه", "url": absolute_url(self.request, "/shop/")},
            {"name": self.object.category.name, "url": absolute_url(self.request, self.object.category.get_absolute_url())},
            {"name": self.object.name, "url": canonical_url},
        ]
        context["breadcrumbs"] = breadcrumbs
        context["canonical_url"] = canonical_url
        context["og_title"] = self.object.seo_title or self.object.name
        context["og_description"] = self.object.seo_description or self.object.short_description or self.object.name
        first_image = next((image for image in self.object.gallery_images if image.image), None)
        context["og_image_url"] = absolute_url(self.request, first_image.image.url) if first_image else None

        offers = self.object.active_variants
        prices = [variant.price for variant in offers]
        colors = []
        sizes = []
        seen_colors = set()
        seen_sizes = set()
        for variant in offers:
            if variant.color_id not in seen_colors:
                colors.append(variant.color)
                seen_colors.add(variant.color_id)
            if variant.size_id not in seen_sizes:
                sizes.append(variant.size)
                seen_sizes.add(variant.size_id)

        context["colors"] = colors
        context["sizes"] = sizes
        context["total_stock"] = sum(variant.stock_quantity for variant in offers)

        cart = get_active_cart(self.request)
        cart_items = cart.items.filter(product_id=self.object.id).only("variant_id", "quantity")
        context["cart_variant_data"] = schema_json(
            {
                str(item.variant_id) if item.variant_id else "base": item.quantity
                for item in cart_items
            }
        )

        context["variant_data"] = schema_json(
            [
                {
                    "id": variant.id,
                    "color_id": variant.color_id,
                    "color": variant.color.name,
                    "color_hex": variant.color.hex_code,
                    "size_id": variant.size_id,
                    "size": variant.size.name,
                    "price": variant.price,
                    "compare_at_price": variant.compare_at_price,
                    "stock": variant.stock_quantity,
                    "sku": variant.sku,
                }
                for variant in offers
            ]
        )

        if offers:
            offer_data = {
                "@type": "AggregateOffer",
                "priceCurrency": "IRR",
                "lowPrice": toman_to_irr(min(prices)),
                "highPrice": toman_to_irr(max(prices)),
                "offerCount": len(offers),
                "availability": "https://schema.org/InStock" if any(v.in_stock for v in offers) else "https://schema.org/OutOfStock",
            }
        else:
            offer_data = {
                "@type": "Offer",
                "priceCurrency": "IRR",
                "price": toman_to_irr(self.object.base_price),
                "availability": "https://schema.org/InStock",
                "url": canonical_url,
            }

        context["product_schema"] = schema_json(
            {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": self.object.name,
                "description": self.object.seo_description or self.object.short_description or self.object.description,
                "url": canonical_url,
                "image": [absolute_url(self.request, image.image.url) for image in self.object.gallery_images if image.image],
                "brand": {"@type": "Brand", "name": "BABAEI"},
                "category": self.object.category.name,
                "offers": offer_data,
                "inLanguage": "fa-IR",
            }
        )
        context["breadcrumb_schema"] = schema_json(
            {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": position, "name": item["name"], "item": item["url"]}
                    for position, item in enumerate(breadcrumbs, start=1)
                ],
            }
        )
        return context
