from django.conf import settings
from django.contrib.sitemaps.views import sitemap
from django.http import HttpResponse
from django.urls import path
from django.views.decorators.cache import cache_page
from django.views.decorators.http import require_GET

from .sitemaps import sitemaps
from .views import CategoryDetailView, ProductDetailView, ShopIndexView


app_name = "shop"


@require_GET
def robots_txt(request):
    content = "\n".join(
        [
            "User-agent: *",
            "Allow: /",
            "Disallow: /admin/",
            "Disallow: /api/",
            "Disallow: /login/",
            "Disallow: /register/",
            "Disallow: /logout/",
            "",
            f"Sitemap: {settings.SITE_URL}/sitemap.xml",
        ]
    )
    return HttpResponse(content, content_type="text/plain; charset=utf-8")


urlpatterns = [
    path("", ShopIndexView.as_view(), name="index"),
    path("category/<slug:slug>/", CategoryDetailView.as_view(), name="category"),
    path("product/<slug:slug>/", ProductDetailView.as_view(), name="product"),
]
