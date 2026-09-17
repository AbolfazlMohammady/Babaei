from __future__ import annotations

import json

from django.conf import settings
from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.utils.safestring import mark_safe
from django.views import View

from apps.shop.models import Product, ProductVariant

from .models import Artwork, DesignerView as DesignerViewModel, PrintArea, PrintAreaView
from .services import create_uploaded_artwork, save_design_draft


def absolute_url(request, path):
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return f"{settings.SITE_URL}{path}"


def _schema(data):
    return mark_safe(json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c"))


def _file_url(request, field):
    """Return a media URL only when an ImageField actually has a file."""
    if not field or not getattr(field, "name", None):
        return None
    try:
        return absolute_url(request, field.url)
    except (ValueError, OSError):
        # A database record can outlive its physical media file. The designer
        # must remain usable instead of failing the whole product page.
        return None


class DesignerPageView(View):
    template_name = "customizer/designer.html"

    def get(self, request, slug):
        product = get_object_or_404(
            Product.objects.select_related("category"),
            slug=slug,
            is_active=True,
            category__is_active=True,
        )

        # Ignore incomplete designer views. ImageField.url raises ValueError
        # when the field has no file, which previously crashed the whole page.
        raw_views = list(
            DesignerViewModel.objects.filter(
                product=product,
                is_active=True,
            )
            .exclude(background_image="")
            .order_by("sort_order", "id")
        )
        views = [view for view in raw_views if _file_url(request, view.background_image)]

        areas = list(PrintArea.objects.filter(product=product, is_active=True).order_by("sort_order", "id"))
        area_maps = list(
            PrintAreaView.objects.filter(
                area__in=areas,
                view__in=views,
                area__is_active=True,
                view__is_active=True,
            ).select_related("area", "view")
        )

        view_data = []
        for view in views:
            background = _file_url(request, view.background_image)
            if not background:
                continue
            view_data.append(
                {
                    "id": view.id,
                    "key": view.key,
                    "name": view.name,
                    "angle": view.angle,
                    "background": background,
                    "mask": _file_url(request, view.mask_image),
                    "width": view.canvas_width,
                    "height": view.canvas_height,
                    "areas": [],
                }
            )

        view_lookup = {item["id"]: item for item in view_data}
        for area_map in area_maps:
            target_view = view_lookup.get(area_map.view_id)
            if not target_view:
                continue
            target_view["areas"].append(
                {
                    "id": area_map.area_id,
                    "key": area_map.area.key,
                    "name": area_map.area.name,
                    "geometry": area_map.geometry,
                    "max_layers": area_map.area.max_layers,
                    "max_width_mm": float(area_map.area.max_width_mm),
                    "max_height_mm": float(area_map.area.max_height_mm),
                }
            )

        artworks = list(
            Artwork.objects.filter(
                is_active=True,
                source=Artwork.Source.LIBRARY,
            )
            .exclude(image="")
            .only("id", "name", "image", "base_price")
            .order_by("name")
        )
        artwork_data = []
        for artwork in artworks:
            image = _file_url(request, artwork.image)
            if image:
                artwork_data.append(
                    {
                        "id": artwork.id,
                        "name": artwork.name,
                        "image": image,
                        "base_price": artwork.base_price,
                    }
                )

        price_rows = Artwork.objects.filter(
            is_active=True,
            source=Artwork.Source.LIBRARY,
            area_prices__area__product=product,
            area_prices__area__is_active=True,
        ).distinct().prefetch_related("area_prices__area")
        price_data = {}
        for artwork in price_rows:
            for price in artwork.area_prices.all():
                if price.area.product_id == product.id and price.area.is_active:
                    price_data[f"{artwork.id}:{price.area_id}"] = price.price

        variants = list(
            ProductVariant.objects.filter(product=product, is_active=True)
            .select_related("color", "size")
            .only("id", "price", "stock_quantity", "color__name", "size__name")
            .order_by("price", "id")
        )
        variant_data = [
            {
                "id": variant.id,
                "price": variant.price,
                "stock": variant.stock_quantity,
                "color": variant.color.name,
                "size": variant.size.name,
            }
            for variant in variants
        ]

        first_background = view_data[0]["background"] if view_data else None
        context = {
            "product": product,
            "designer_views": views,
            "designer_ready": bool(view_data and areas and area_maps),
            "designer_data": _schema(
                {
                    "base_price": product.base_price,
                    "views": view_data,
                    "artworks": artwork_data,
                    "prices": price_data,
                    "variants": variant_data,
                }
            ),
            "canonical_url": absolute_url(request, request.path),
            "og_title": f"طراحی {product.name} | BABAEI",
            "og_description": "لیبل‌ها را روی ناحیه‌های مجاز لباس قرار دهید، نماهای مختلف را ببینید و قیمت نهایی را لحظه‌ای محاسبه کنید.",
            "og_image_url": first_background,
            "designer_schema": _schema(
                {
                    "@context": "https://schema.org",
                    "@type": "WebPage",
                    "name": f"طراحی {product.name}",
                    "url": absolute_url(request, request.path),
                    "isPartOf": {"@type": "WebSite", "name": "BABAEI", "url": settings.SITE_URL},
                    "inLanguage": "fa-IR",
                }
            ),
        }
        return render(request, self.template_name, context)


class SaveDesignView(View):
    def post(self, request, slug):
        product = get_object_or_404(Product, slug=slug, is_active=True, category__is_active=True)
        try:
            if request.content_type.startswith("multipart/form-data"):
                raw_payload = request.POST.get("payload", "{}")
                payload = json.loads(raw_payload)
                preview = request.FILES.get("preview")
            else:
                payload = json.loads(request.body.decode("utf-8"))
                preview = None
            if not isinstance(payload, dict):
                raise ValidationError("اطلاعات طراحی نامعتبر است.")
            variant_id = payload.pop("variant_id", None)
            variant = None
            if variant_id:
                variant = get_object_or_404(ProductVariant, id=variant_id, product=product, is_active=True)
            draft = save_design_draft(request=request, product=product, payload=payload, variant=variant)
            if preview:
                draft.preview_image.save(f"{draft.uuid}.png", preview, save=True)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JsonResponse({"ok": False, "error": "اطلاعات طراحی نامعتبر است."}, status=400)
        except ValidationError as exc:
            message = exc.message if hasattr(exc, "message") else str(exc)
            return JsonResponse({"ok": False, "error": message}, status=422)
        return JsonResponse({"ok": True, "draft_id": str(draft.uuid), "total_price": draft.total_price})


class UploadArtworkView(View):
    def post(self, request, slug):
        get_object_or_404(Product, slug=slug, is_active=True, category__is_active=True)
        uploaded = request.FILES.get("image")
        if not uploaded:
            return JsonResponse({"ok": False, "error": "تصویری انتخاب نشده است."}, status=400)
        try:
            artwork = create_uploaded_artwork(request=request, uploaded_file=uploaded)
        except ValidationError as exc:
            message = exc.message if hasattr(exc, "message") else str(exc)
            return JsonResponse({"ok": False, "error": message}, status=422)
        image = _file_url(request, artwork.image)
        if not image:
            return JsonResponse({"ok": False, "error": "تصویر پردازش‌شده در دسترس نیست."}, status=500)
        return JsonResponse(
            {
                "ok": True,
                "artwork": {
                    "id": artwork.id,
                    "name": artwork.name,
                    "image": image,
                    "base_price": artwork.base_price,
                    "background_removed": artwork.background_removed,
                },
            }
        )
