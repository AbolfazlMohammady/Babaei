from django.db.models import Prefetch
from django.views.generic import DetailView, ListView

from .models import Category, Product, ProductImage, ProductVariant


class ShopIndexView(ListView):
    template_name = "shop/index.html"
    context_object_name = "products"
    paginate_by = 24

    def get_queryset(self):
        image_qs = ProductImage.objects.filter(
            image_type=ProductImage.ImageType.PRIMARY
        ).only("id", "product_id", "image", "alt_text", "image_type")
        return (
            Product.objects.filter(is_active=True, category__is_active=True)
            .select_related("category")
            .prefetch_related(Prefetch("images", queryset=image_qs, to_attr="primary_images"))
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["categories"] = Category.objects.filter(is_active=True).only(
            "id", "name", "slug", "image", "description"
        )
        return context


class CategoryDetailView(ListView):
    template_name = "shop/category.html"
    context_object_name = "products"
    paginate_by = 24

    def get_queryset(self):
        image_qs = ProductImage.objects.filter(
            image_type=ProductImage.ImageType.PRIMARY
        ).only("id", "product_id", "image", "alt_text")
        return (
            Product.objects.filter(
                category__slug=self.kwargs["slug"],
                category__is_active=True,
                is_active=True,
            )
            .select_related("category")
            .prefetch_related(Prefetch("images", queryset=image_qs, to_attr="primary_images"))
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["category"] = Category.objects.get(slug=self.kwargs["slug"], is_active=True)
        return context


class ProductDetailView(DetailView):
    template_name = "shop/product_detail.html"
    context_object_name = "product"
    slug_field = "slug"
    slug_url_kwarg = "slug"

    def get_queryset(self):
        images = ProductImage.objects.only(
            "id", "product_id", "image", "alt_text", "image_type", "sort_order"
        )
        variants = ProductVariant.objects.filter(is_active=True).select_related("color", "size")
        return (
            Product.objects.filter(is_active=True, category__is_active=True)
            .select_related("category")
            .prefetch_related(
                Prefetch("images", queryset=images),
                Prefetch("variants", queryset=variants),
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
        return context
