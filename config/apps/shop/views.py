from __future__ import annotations

from django.db.models import Case, IntegerField, Prefetch, When
from django.shortcuts import get_object_or_404
from django.views.generic import DetailView, ListView

from .models import Category, Product, ProductImage, ProductVariant


class ShopIndexView(ListView):
    template_name = "shop/index.html"
    context_object_name = "products"

    def get_queryset(self):
        primary_images = ProductImage.objects.filter(
            image_type=ProductImage.ImageType.PRIMARY,
        ).only("id", "product_id", "image", "alt_text")

        return (
            Product.objects.filter(
                is_active=True,
                category__is_active=True,
            )
            .select_related("category")
            .prefetch_related(
                Prefetch(
                    "images",
                    queryset=primary_images,
                    to_attr="primary_images",
                )
            )[:24]
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["categories"] = Category.objects.filter(is_active=True).only(
            "id", "name", "slug", "image"
        )
        context["canonical_url"] = self.request.build_absolute_uri(self.request.path)
        return context


class CategoryDetailView(ListView):
    template_name = "shop/category.html"
    context_object_name = "products"
    paginate_by = 24

    def get_queryset(self):
        self.category = get_object_or_404(
            Category.objects.only(
                "id",
                "name",
                "slug",
                "description",
                "seo_title",
                "seo_description",
            ),
            slug=self.kwargs["slug"],
            is_active=True,
        )

        primary_images = ProductImage.objects.filter(
            image_type=ProductImage.ImageType.PRIMARY,
        ).only("id", "product_id", "image", "alt_text")

        return (
            Product.objects.filter(
                category_id=self.category.id,
                is_active=True,
            )
            .select_related("category")
            .prefetch_related(
                Prefetch(
                    "images",
                    queryset=primary_images,
                    to_attr="primary_images",
                )
            )
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["category"] = self.category
        context["canonical_url"] = self.request.build_absolute_uri(self.request.path)
        return context


class ProductDetailView(DetailView):
    template_name = "shop/product_detail.html"
    context_object_name = "product"
    slug_field = "slug"
    slug_url_kwarg = "slug"

    def get_queryset(self):
        images = (
            ProductImage.objects.only(
                "id",
                "product_id",
                "image",
                "alt_text",
                "image_type",
                "sort_order",
            )
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
                "id",
                "product_id",
                "color_id",
                "size_id",
                "sku",
                "price",
                "stock_quantity",
            )
        )

        return (
            Product.objects.filter(
                is_active=True,
                category__is_active=True,
            )
            .select_related("category")
            .prefetch_related(
                Prefetch("images", queryset=images, to_attr="gallery_images"),
                Prefetch("variants", queryset=variants, to_attr="active_variants"),
            )
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["breadcrumbs"] = [
            {"name": "فروشگاه", "url": "/shop/"},
            {
                "name": self.object.category.name,
                "url": f"/shop/category/{self.object.category.slug}/",
            },
            {"name": self.object.name, "url": self.request.path},
        ]
        context["canonical_url"] = self.request.build_absolute_uri(self.request.path)
        return context
