from django.urls import path

from .views import CategoryDetailView, ProductDetailView, ShopView


app_name = "shop"

urlpatterns = [
    path("shop/", ShopView.as_view(), name="index"),
    path("shop/category/<slug:slug>/", CategoryDetailView.as_view(), name="category"),
    path("product/<slug:slug>/", ProductDetailView.as_view(), name="product-detail"),
]
