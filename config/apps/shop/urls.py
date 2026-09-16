from django.urls import path

from .views import CategoryDetailView, ProductDetailView, ShopIndexView


app_name = "shop"

urlpatterns = [
    path("", ShopIndexView.as_view(), name="index"),
    path("category/<slug:slug>/", CategoryDetailView.as_view(), name="category"),
    path("product/<slug:slug>/", ProductDetailView.as_view(), name="product"),
]
