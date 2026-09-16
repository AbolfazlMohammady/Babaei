from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.sitemaps.views import sitemap
from django.http import HttpResponse
from django.urls import include, path
from apps.shop.sitemaps import sitemaps
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

def robots_txt(request):
    content = "\n".join(["User-agent: *","Allow: /","Disallow: /admin/","Disallow: /api/","Disallow: /login/","Disallow: /register/","Disallow: /logout/","",f"Sitemap: {settings.SITE_URL}/sitemap.xml"])
    return HttpResponse(content, content_type="text/plain; charset=utf-8")
urlpatterns = [path("sitemap.xml", sitemap, {"sitemaps": sitemaps}, name="sitemap"),path("robots.txt", robots_txt, name="robots"),path("api/schema/", SpectacularAPIView.as_view(), name="schema"),path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),path("admin/", admin.site.urls),path("shop/", include("apps.shop.urls")),path("", include("apps.orders.urls")),path("", include("apps.home.urls")),path("", include("apps.users.urls"))]
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns.append(path("__debug__/", include("debug_toolbar.urls")))
