from django.urls import path, re_path

from .views import CategoryDetailView, ProductDetailView, ShopIndexView


app_name = "shop"

urlpatterns = [
    path("", ShopIndexView.as_view(), name="index"),
    re_path(r"^category/(?P<slug>[^/]+)/$", CategoryDetailView.as_view(), name="category"),
    re_path(r"^product/(?P<slug>[^/]+)/$", ProductDetailView.as_view(), name="product"),
]
