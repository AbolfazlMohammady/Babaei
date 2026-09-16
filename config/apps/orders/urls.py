from django.urls import path

from .views import cart_add_view, cart_clear_view, cart_remove_view, cart_update_view, cart_view


app_name = "orders"

urlpatterns = [
    path("cart/", cart_view, name="cart"),
    path("cart/add/", cart_add_view, name="cart_add"),
    path("cart/<int:item_id>/update/", cart_update_view, name="cart_update"),
    path("cart/<int:item_id>/remove/", cart_remove_view, name="cart_remove"),
    path("cart/clear/", cart_clear_view, name="cart_clear"),
]
