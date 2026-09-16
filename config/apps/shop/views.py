from django.db.models import Prefetch
from django.views.generic import DetailView, ListView

from .models import Category, Product, ProductImage


class ShopView(ListView):
    template_name = "shop/index.html"
    context_object_name = "products"
    paginate_by = 24

    def get_queryset(self):
        return (
            Product.objects.filter(is_active=True, category__is_active=True)
            .select_related("category")
            .prefetch_related(
                Prefetch(
                    "images",
                    queryset=ProductImage.objects.order_by("sort_order", "id"),
                    to_attr="ordered_images",
                )
            )
        )


class CategoryDetailView(ListView):
    template_name = "shop/category.html"
    context_object_name = "products"
    paginate_by = 24

    def get_queryset(self):
        return (
            Product.objects.filter(
                is_active=True,
                category__is_active=True,
                category__slug=self.kwargs["slug"],
            )
            .select_related("category")
            .prefetch_related(
                Prefetch(
                    "images",
                    queryset=ProductImage.objects.order_by("sort_order", "id"),
                    to_attr="ordered_images",
                )
            )
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["category"] = Category.objects.get(
            slug=self.kwargs["slug"],
            is_active=True,
        )
        return context


class ProductDetailView(DetailView):
    template_name = "shop/product_detail.html"
    context_object_name = "product"
    slug_url_kwarg = "slug"

    def get_queryset(self):
        return (
            Product.objects.filter(is_active=True, category__is_active=True)
            .select_related("category")
            .prefetch_related("variants__color", "variants__size", "images")
        )
