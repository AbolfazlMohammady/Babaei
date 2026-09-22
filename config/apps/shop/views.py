from __future__ import annotations

import json

from django.conf import settings
from django.core.cache import cache
from django.db.models import Case, CharField, Count, Exists, F, IntegerField, Max, Min, OuterRef, Prefetch, Q, Subquery, Value, When
from django.db.models.functions import Concat
from django.http import HttpResponsePermanentRedirect
from django.shortcuts import get_object_or_404
from django.utils.safestring import mark_safe
from django.views.generic import DetailView, ListView

from .models import Category, Product, ProductImage, ProductVariant
from apps.saved.models import FavoriteProduct

AUTH_USER_SESSION_KEY = "_auth_user_id"
CATEGORY_NAV_CACHE_KEY = "babaei:shop:active-categories:v2"
CATEGORY_NAV_CACHE_TTL = 300


def get_active_categories():
    categories = cache.get(CATEGORY_NAV_CACHE_KEY)
    if categories is None:
        categories = list(
            Category.objects.filter(is_active=True)
            .annotate(product_count=Count("products", filter=Q(products__is_active=True)))
            .only("id", "name", "slug", "image")
            .order_by("sort_order", "name")
        )
        cache.set(CATEGORY_NAV_CACHE_KEY, categories, CATEGORY_NAV_CACHE_TTL)
    return categories


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
    max_variants = ProductVariant.objects.filter(product_id=OuterRef("pk"), is_active=True).order_by("-price", "id")
    return (
        Subquery(variants.values("price")[:1], output_field=IntegerField()),
        Subquery(variants.values("compare_at_price")[:1], output_field=IntegerField()),
        Subquery(max_variants.values("price")[:1], output_field=IntegerField()),
    )


def catalog_price_bounds(queryset):
    product_ids = queryset.values("pk")
    variant_prices = ProductVariant.objects.filter(
        product_id__in=product_ids,
        is_active=True,
    ).aggregate(
        min_price=Min("price"),
        max_price=Max("price"),
    )

    if variant_prices["min_price"] is not None:
        return variant_prices["min_price"], variant_prices["max_price"] or variant_prices["min_price"]

    base_prices = queryset.aggregate(
        min_price=Min("base_price"),
        max_price=Max("base_price"),
    )
    return base_prices["min_price"] or 0, base_prices["max_price"] or 0


def primary_image_annotations():
    images = ProductImage.objects.filter(product_id=OuterRef("pk"), image_type=ProductImage.ImageType.PRIMARY).order_by("sort_order", "id")
    image_path = Subquery(images.values("image")[:1], output_field=CharField(max_length=500))
    image_alt = Subquery(images.values("alt_text")[:1], output_field=CharField(max_length=180))
    return Concat(Value(settings.MEDIA_URL), image_path, output_field=CharField(max_length=520)), image_alt


def card_annotations(request):
    primary_image_url, primary_image_alt = primary_image_annotations()
    gallery_images = ProductImage.objects.filter(product_id=OuterRef("pk"))
    has_variants = ProductVariant.objects.filter(product_id=OuterRef("pk"), is_active=True)
    annotations = {
        "primary_image_url": primary_image_url,
        "primary_image_alt": primary_image_alt,
        "has_variants": Exists(has_variants),
    }
    if request.user.is_authenticated:
        annotations["is_favorite"] = Exists(
            FavoriteProduct.objects.filter(user_id=request.user.id, product_id=OuterRef("pk"))
        )
    else:
        annotations["is_favorite"] = Value(False)
    return annotations


class ShopIndexView(ListView):
    template_name = "shop/index.html"
    context_object_name = "products"
    paginate_by = 18

    def get_queryset(self):
        variant_price, variant_compare_price, variant_max_price = price_annotations()
        annotations = card_annotations(self.request)
        card_images = ProductImage.objects.annotate(
            type_priority=Case(
                When(image_type=ProductImage.ImageType.PRIMARY, then=0),
                default=1,
                output_field=IntegerField(),
            )
        ).order_by("type_priority", "sort_order", "id")[:2]

        queryset = Product.objects.filter(
            is_active=True,
            category__is_active=True,
        ).select_related("category").annotate(
            listed_price=variant_price,
            listed_compare_price=variant_compare_price,
            listed_max_price=variant_max_price,
            **annotations,
        ).prefetch_related(
            Prefetch("images", queryset=card_images, to_attr="card_images")
        )

        category = self.request.GET.get("category")
        if category:
            queryset = queryset.filter(category__slug=category)

        size = self.request.GET.get("size")
        variant_filters = {"variants__is_active": True}

        if size:
            variant_filters.update({
                "variants__size__is_active": True,
                "variants__size__slug": size,
            })

        min_price = self.request.GET.get("min_price")
        if min_price:
            try:
                variant_filters["variants__price__gte"] = int(min_price)
            except (TypeError, ValueError):
                pass

        max_price = self.request.GET.get("max_price")
        if max_price:
            try:
                variant_filters["variants__price__lte"] = int(max_price)
            except (TypeError, ValueError):
                pass

        if variant_filters:
            queryset = queryset.filter(**variant_filters).distinct()

        if self.request.GET.get("discount") == "1":
            queryset = queryset.filter(listed_compare_price__gt=F("listed_price"))

        sort = self.request.GET.get("sort", "featured")
        sort_map = {
            "featured": ("-is_featured", "-created_at"),
            "newest": ("-created_at",),
            "price_asc": ("listed_price", "id"),
            "price_desc": ("-listed_price", "id"),
        }
        return queryset.order_by(*sort_map.get(sort, sort_map["featured"]))

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        products = list(context["products"])
        context["products"] = products
        context["hero_product"] = products[0] if products else None
        context["categories"] = get_active_categories()
        context["filter_category"] = self.request.GET.get("category", "")
        # Which row of the shared filter rail is current: the filtered slug here,
        # self.category.slug on CategoryDetailView.
        context["current_category_slug"] = context["filter_category"]
        context["filter_sort"] = self.request.GET.get("sort", "featured")
        context["filter_min_price"] = self.request.GET.get("min_price", "")
        context["filter_max_price"] = self.request.GET.get("max_price", "")
        # The slider bounds follow the active category. They used to be computed
        # from every active product on the site, so filtering to a category still
        # showed a price range that category did not have.
        bounds_queryset = Product.objects.filter(is_active=True, category__is_active=True)
        if context["filter_category"]:
            bounds_queryset = bounds_queryset.filter(category__slug=context["filter_category"])
        context["price_min"], context["price_max"] = catalog_price_bounds(bounds_queryset)
        context["filter_size"] = self.request.GET.get("size", "")
        context["filter_discount"] = self.request.GET.get("discount") == "1"
        context["canonical_url"] = absolute_url(self.request, self.request.path)
        context["og_title"] = "فروشگاه لباس و تی‌شرت | BABAEI"
        context["og_description"] = "خرید تی‌شرت و لباس از BABAEI؛ انتخاب مدل، رنگ و سایز و آماده برای شخصی‌سازی."
        # Was /static/images/home/Tshirt.png: a 1.9 MB product shot at 0.75:1, so
        # link previews both pulled far too much data and cropped badly. Now a
        # purpose-built 1200x630 card (~80 KB).
        context["og_image_url"] = absolute_url(self.request, "/static/images/shop/shop-og.jpg")
        context["website_schema"] = schema_json({"@context": "https://schema.org", "@type": "WebSite", "name": "BABAEI", "url": settings.SITE_URL, "inLanguage": "fa-IR"})
        return context


class CategoryDetailView(ListView):
    template_name = "shop/category.html"
    context_object_name = "products"
    paginate_by = 18

    def get_queryset(self):
        self.category = get_object_or_404(Category.objects.only("id", "name", "slug", "description", "seo_title", "seo_description", "image"), slug=self.kwargs["slug"], is_active=True)
        variant_price, variant_compare_price, variant_max_price = price_annotations()
        annotations = card_annotations(self.request)
        card_images = ProductImage.objects.annotate(
            type_priority=Case(
                When(image_type=ProductImage.ImageType.PRIMARY, then=0),
                default=1,
                output_field=IntegerField(),
            )
        ).order_by("type_priority", "sort_order", "id")[:2]
        queryset = Product.objects.filter(category_id=self.category.id, is_active=True).select_related("category").annotate(listed_price=variant_price, listed_compare_price=variant_compare_price, listed_max_price=variant_max_price, **annotations).prefetch_related(Prefetch("images", queryset=card_images, to_attr="card_images"))

        size = self.request.GET.get("size")
        variant_filters = {"variants__is_active": True}

        if size:
            variant_filters.update({
                "variants__size__is_active": True,
                "variants__size__slug": size,
            })

        min_price = self.request.GET.get("min_price")
        if min_price:
            try:
                variant_filters["variants__price__gte"] = int(min_price)
            except (TypeError, ValueError):
                pass

        max_price = self.request.GET.get("max_price")
        if max_price:
            try:
                variant_filters["variants__price__lte"] = int(max_price)
            except (TypeError, ValueError):
                pass

        if variant_filters:
            queryset = queryset.filter(**variant_filters).distinct()

        if self.request.GET.get("discount") == "1":
            queryset = queryset.filter(listed_compare_price__gt=F("listed_price"))

        sort = self.request.GET.get("sort", "featured")
        sort_map = {
            "featured": ("-is_featured", "-created_at"),
            "newest": ("-created_at",),
            "price_asc": ("listed_price", "id"),
            "price_desc": ("-listed_price", "id"),
        }
        return queryset.order_by(*sort_map.get(sort, sort_map["featured"]))

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["category"] = self.category
        context["categories"] = get_active_categories()
        # The category is the page here, not a filter, so filter_category stays
        # empty and no "remove category" chip is offered for the page you are on.
        context["filter_category"] = ""
        context["current_category_slug"] = self.category.slug
        context["filter_sort"] = self.request.GET.get("sort", "featured")
        context["filter_size"] = self.request.GET.get("size", "")
        context["filter_discount"] = self.request.GET.get("discount") == "1"
        context["filter_min_price"] = self.request.GET.get("min_price", "")
        context["filter_max_price"] = self.request.GET.get("max_price", "")
        base_price_queryset = Product.objects.filter(category_id=self.category.id, is_active=True)
        context["price_min"], context["price_max"] = catalog_price_bounds(base_price_queryset)
        context["canonical_url"] = absolute_url(self.request, self.request.path)
        context["og_title"] = self.category.seo_title or self.category.name
        context["og_description"] = self.category.seo_description or self.category.description or self.category.name
        context["og_image_url"] = absolute_url(self.request, self.category.image.url) if self.category.image else None
        context["category_schema"] = schema_json({"@context": "https://schema.org", "@type": "CollectionPage", "name": self.category.name, "url": context["canonical_url"], "description": self.category.seo_description or self.category.description, "inLanguage": "fa-IR"})
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
        images = ProductImage.objects.only("id", "product_id", "image", "alt_text", "image_type", "sort_order").annotate(type_priority=Case(When(image_type=ProductImage.ImageType.PRIMARY, then=0), When(image_type=ProductImage.ImageType.DETAIL, then=1), default=2, output_field=IntegerField())).order_by("type_priority", "sort_order", "id")
        from apps.orders.models import Cart, CartItem
        user_id = self.request.session.get(AUTH_USER_SESSION_KEY)
        if user_id:
            cart_quantity = Subquery(CartItem.objects.filter(cart__user_id=user_id, cart__status=Cart.Status.ACTIVE, product_id=OuterRef("product_id"), variant_id=OuterRef("pk")).values("quantity")[:1], output_field=IntegerField())
        else:
            session_key = self.request.session.session_key
            cart_quantity = Subquery(CartItem.objects.filter(cart__session_key=session_key, cart__user__isnull=True, cart__status=Cart.Status.ACTIVE, product_id=OuterRef("product_id"), variant_id=OuterRef("pk")).values("quantity")[:1], output_field=IntegerField()) if session_key else Value(0, output_field=IntegerField())
        variants = ProductVariant.objects.filter(is_active=True).select_related("color", "size").only("id", "product_id", "color_id", "size_id", "sku", "price", "compare_at_price", "stock_quantity", "color__id", "color__name", "color__slug", "color__hex_code", "size__id", "size__name", "size__slug", "size__sort_order").annotate(cart_quantity=cart_quantity).order_by("color__name", "size__sort_order", "size__name")
        return Product.objects.filter(is_active=True, category__is_active=True).select_related("category").prefetch_related(Prefetch("images", queryset=images, to_attr="gallery_images"), Prefetch("variants", queryset=variants, to_attr="active_variants"))

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        canonical_url = absolute_url(self.request, self.request.path)
        breadcrumbs = [{"name": "فروشگاه", "url": absolute_url(self.request, "/shop/")}, {"name": self.object.category.name, "url": absolute_url(self.request, self.object.category.get_absolute_url())}, {"name": self.object.name, "url": canonical_url}]
        context["breadcrumbs"] = breadcrumbs
        context["canonical_url"] = canonical_url
        context["og_title"] = self.object.seo_title or self.object.name
        context["og_description"] = self.object.seo_description or self.object.short_description or self.object.name
        first_image = next((image for image in self.object.gallery_images if image.image), None)
        context["og_image_url"] = absolute_url(self.request, first_image.image.url) if first_image else None
        offers = self.object.active_variants
        prices = [variant.price for variant in offers]
        colors, sizes = [], []
        seen_colors, seen_sizes = set(), set()
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
        context["cart_variant_data"] = schema_json({str(variant.id): (variant.cart_quantity or 0) for variant in offers})
        context["variant_data"] = schema_json([{ "id": variant.id, "color_id": variant.color_id, "color": variant.color.name, "color_hex": variant.color.hex_code, "size_id": variant.size_id, "size": variant.size.name, "price": variant.price, "compare_at_price": variant.compare_at_price, "stock": variant.stock_quantity, "sku": variant.sku } for variant in offers])
        if offers:
            offer_data = {"@type": "AggregateOffer", "priceCurrency": "IRR", "lowPrice": toman_to_irr(min(prices)), "highPrice": toman_to_irr(max(prices)), "offerCount": len(offers), "availability": "https://schema.org/InStock" if any(v.in_stock for v in offers) else "https://schema.org/OutOfStock"}
        else:
            offer_data = {"@type": "Offer", "priceCurrency": "IRR", "price": toman_to_irr(self.object.base_price), "availability": "https://schema.org/InStock", "url": canonical_url}
        context["product_schema"] = schema_json({"@context": "https://schema.org", "@type": "Product", "name": self.object.name, "description": self.object.seo_description or self.object.short_description or self.object.description, "url": canonical_url, "image": [absolute_url(self.request, image.image.url) for image in self.object.gallery_images if image.image], "brand": {"@type": "Brand", "name": "BABAEI"}, "category": self.object.category.name, "offers": offer_data, "inLanguage": "fa-IR"})
        context["breadcrumb_schema"] = schema_json({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": position, "name": item["name"], "item": item["url"]} for position, item in enumerate(breadcrumbs, start=1)]})
        return context
