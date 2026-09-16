from django.db.models import IntegerField, OuterRef, Prefetch, Subquery
from django.views.generic import TemplateView

from apps.shop.models import Category, Product, ProductImage, ProductVariant


class HomeView(TemplateView):
    template_name = "home/index.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        primary_images = ProductImage.objects.filter(
            image_type=ProductImage.ImageType.PRIMARY,
        ).only(
            "id",
            "product_id",
            "image",
            "alt_text",
        )

        variant_price = Subquery(
            ProductVariant.objects.filter(
                product_id=OuterRef("pk"),
                is_active=True,
            )
            .order_by("price")
            .values("price")[:1],
            output_field=IntegerField(),
        )

        context["home_products"] = (
            Product.objects.filter(
                is_active=True,
                category__is_active=True,
            )
            .select_related("category")
            .annotate(listed_price=variant_price)
            .prefetch_related(
                Prefetch(
                    "images",
                    queryset=primary_images,
                    to_attr="primary_images",
                )
            )
            .order_by("-is_featured", "-created_at")[:4]
        )

        context["home_categories"] = (
            Category.objects.filter(is_active=True)
            .only("id", "name", "slug", "image")
            .order_by("sort_order", "name")[:4]
        )

        return context
