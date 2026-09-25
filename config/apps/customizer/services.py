from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib import error as urlerror
from urllib import request as urlrequest

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.db import transaction

from .models import Artwork, ArtworkAreaPrice, DesignDraft, DesignLayer, PrintAreaView

EPSILON = 1e-7
MAX_ARTWORK_UPLOAD_BYTES = 8 * 1024 * 1024
CUSTOM_UPLOAD_PRICE = 100000
CUSTOMIZER_BASE_PRICE = 1000000


def _is_3d_forbidden_area(area):
    value = f"{area.key or ''} {area.name or ''}".lower()
    return any(token in value for token in ("sleeve", "آستین", "collar", "یقه", "inside", "داخل"))


@dataclass(frozen=True)
class Placement:
    """Placement normalized to the print-area bounding box."""
    x: float
    y: float
    width: float
    height: float
    rotation: float = 0.0


def _points(geometry):
    return [(float(p["x"]), float(p["y"])) for p in geometry]


def _cross(a, b, c):
    return (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1])


def _on_segment(a, b, c):
    return (
        min(a[0], c[0]) - EPSILON <= b[0] <= max(a[0], c[0]) + EPSILON
        and min(a[1], c[1]) - EPSILON <= b[1] <= max(a[1], c[1]) + EPSILON
        and abs(_cross(a, b, c)) <= EPSILON
    )


def point_in_polygon(point, polygon):
    if any(_on_segment(polygon[i - 1], point, polygon[i]) for i in range(len(polygon))):
        return True
    x, y = point
    inside = False
    for i, current in enumerate(polygon):
        previous = polygon[i - 1]
        if (previous[1] > y) != (current[1] > y):
            x_intersection = (current[0] - previous[0]) * (y - previous[1]) / (current[1] - previous[1]) + previous[0]
            if x < x_intersection:
                inside = not inside
    return inside


def _proper_segment_intersection(a, b, c, d):
    c1, c2 = _cross(a, b, c), _cross(a, b, d)
    c3, c4 = _cross(c, d, a), _cross(c, d, b)
    return ((c1 > EPSILON and c2 < -EPSILON) or (c1 < -EPSILON and c2 > EPSILON)) and ((c3 > EPSILON and c4 < -EPSILON) or (c3 < -EPSILON and c4 > EPSILON))


def rotated_rect_corners(placement: Placement):
    half_width, half_height = placement.width / 2, placement.height / 2
    radians = math.radians(placement.rotation)
    cos_value, sin_value = math.cos(radians), math.sin(radians)
    return [
        (
            placement.x + local_x * cos_value - local_y * sin_value,
            placement.y + local_x * sin_value + local_y * cos_value,
        )
        for local_x, local_y in ((-half_width, -half_height), (half_width, -half_height), (half_width, half_height), (-half_width, half_height))
    ]


def rect_inside_polygon(placement: Placement, polygon):
    corners = rotated_rect_corners(placement)
    if not all(point_in_polygon(corner, polygon) for corner in corners):
        return False
    for i, start in enumerate(corners):
        end = corners[(i + 1) % 4]
        for j, boundary_start in enumerate(polygon):
            boundary_end = polygon[(j + 1) % len(polygon)]
            if _proper_segment_intersection(start, end, boundary_start, boundary_end):
                return False
    return True


def oriented_rects_overlap(first: Placement, second: Placement):
    first_points = rotated_rect_corners(first)
    second_points = rotated_rect_corners(second)
    axes = []
    for points in (first_points, second_points):
        for i in range(2):
            edge = (points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])
            length = math.hypot(*edge) or 1.0
            axes.append((-edge[1] / length, edge[0] / length))
    for axis in axes:
        first_projection = [p[0] * axis[0] + p[1] * axis[1] for p in first_points]
        second_projection = [p[0] * axis[0] + p[1] * axis[1] for p in second_points]
        if max(first_projection) <= min(second_projection) + EPSILON or max(second_projection) <= min(first_projection) + EPSILON:
            return False
    return True


def _area_bounds(geometry):
    points = _points(geometry)
    xs, ys = zip(*points)
    return min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)


def _to_canvas_placement(placement: Placement, geometry):
    min_x, min_y, width, height = _area_bounds(geometry)
    return Placement(
        x=min_x + placement.x * width,
        y=min_y + placement.y * height,
        width=placement.width * width,
        height=placement.height * height,
        rotation=placement.rotation,
    )


def validate_placement(area, view_map, placement, existing):
    if not (0.0 <= placement.x <= 1.0 and 0.0 <= placement.y <= 1.0):
        raise ValidationError("لیبل باید داخل محدوده چاپ قرار بگیرد.")
    if not (0.01 <= placement.width <= 1.0 and 0.01 <= placement.height <= 1.0):
        raise ValidationError("ابعاد لیبل نامعتبر است.")
    if not -180.0 <= placement.rotation <= 180.0:
        raise ValidationError("زاویه لیبل نامعتبر است.")

    geometry = _points(view_map.geometry)
    canvas_placement = _to_canvas_placement(placement, view_map.geometry)
    if not rect_inside_polygon(canvas_placement, geometry):
        raise ValidationError(f"لیبل «{area.name}» نباید از محدوده چاپ خارج شود.")
    if any(oriented_rects_overlap(canvas_placement, other) for other in existing):
        raise ValidationError(f"لیبل‌های ناحیه «{area.name}» نباید روی هم قرار بگیرند.")


def _accessible_artwork_queryset(*, artwork_ids, request):
    queryset = Artwork.objects.filter(
        id__in=artwork_ids,
        is_active=True,
        processing_status=Artwork.ProcessingStatus.READY,
    )
    if request is None:
        return queryset.filter(source=Artwork.Source.LIBRARY)
    public = queryset.filter(source=Artwork.Source.LIBRARY)
    if request.user.is_authenticated:
        private = queryset.filter(source=Artwork.Source.UPLOAD, owner=request.user)
    else:
        private = queryset.filter(source=Artwork.Source.UPLOAD, session_key=request.session.session_key)
    return public | private


def validate_design_payload(product, payload, variant=None, request=None):
    if not isinstance(payload, dict):
        raise ValidationError("اطلاعات طراحی نامعتبر است.")

    raw_layers = payload.get("layers", [])
    if not isinstance(raw_layers, list) or len(raw_layers) > 30:
        raise ValidationError("تعداد یا ساختار لایه‌های طراحی نامعتبر است.")

    if variant is not None and (
        variant.product_id != product.id
        or not variant.is_active
        or variant.stock_quantity <= 0
    ):
        raise ValidationError("رنگ و سایز انتخاب‌شده موجود نیست.")
    if variant is None and product.variants.filter(is_active=True).exists():
        raise ValidationError("لطفاً رنگ و سایز لباس را انتخاب کنید.")

    areas = {area.id: area for area in product.print_areas.filter(is_active=True)}
    views = {view.id: view for view in product.designer_views.filter(is_active=True)}
    maps = {
        (item.area_id, item.view_id): item
        for item in PrintAreaView.objects.filter(
            area__product=product,
            area__is_active=True,
            view__is_active=True,
        ).select_related("area", "view")
    }

    artwork_ids = []
    for raw in raw_layers:
        if not isinstance(raw, dict):
            raise ValidationError("ساختار یکی از لایه‌ها نامعتبر است.")
        if str(raw.get("type", "artwork")) == "text":
            continue
        try:
            artwork_ids.append(int(raw["artwork_id"]))
        except (KeyError, TypeError, ValueError):
            raise ValidationError("یکی از لیبل‌های انتخاب‌شده معتبر نیست.")

    artworks = {
        a.id: a
        for a in _accessible_artwork_queryset(
            artwork_ids=artwork_ids,
            request=request,
        )
    }
    prices = {
        (row.artwork_id, row.area_id): row.price
        for row in ArtworkAreaPrice.objects.filter(
            artwork_id__in=artworks,
            area_id__in=areas,
        )
    }

    parsed = []
    for raw in raw_layers:
        layer_type = str(raw.get("type", "artwork")).lower()
        if layer_type not in {"artwork", "text"}:
            raise ValidationError("نوع لایه طراحی نامعتبر است.")

        try:
            area = areas[int(raw["area_id"])]
            side = str(raw.get("side", "front")).lower()
            if side not in {"front", "back"}:
                raise ValidationError("سمت لباس نامعتبر است.")

            placement = Placement(
                x=float(raw["x"]),
                y=float(raw["y"]),
                width=float(raw["width"]),
                height=float(raw["height"]),
                rotation=float(raw.get("rotation", 0)),
            )
        except (KeyError, TypeError, ValueError):
            raise ValidationError("یکی از ناحیه‌ها یا مختصات طراحی معتبر نیست.")

        if _is_3d_forbidden_area(area):
            raise ValidationError(f"ناحیه «{area.name}» برای چاپ روی لباس مجاز نیست.")
        if not math.isfinite(
            placement.x + placement.y + placement.width + placement.height + placement.rotation
        ):
            raise ValidationError("مختصات لایه نامعتبر است.")

        artwork = None
        text = ""
        text_style = {}

        if layer_type == "artwork":
            try:
                artwork = artworks[int(raw["artwork_id"])]
            except (KeyError, TypeError, ValueError):
                raise ValidationError("یکی از لیبل‌های انتخاب‌شده معتبر نیست.")
            if not artwork.is_active:
                raise ValidationError("این لیبل دیگر فعال نیست.")
        else:
            text = str(raw.get("text", "")).strip()[:120]
            if not text:
                raise ValidationError("متن طراحی نمی‌تواند خالی باشد.")
            raw_style = raw.get("text_style", {})
            text_style = raw_style if isinstance(raw_style, dict) else {}

        parsed.append({
            "area": area,
            "artwork": artwork,
            "side": side,
            "layer_type": layer_type,
            "text": text,
            "text_style": text_style,
            "placement": placement,
        })

    counts = {}
    for item in parsed:
        key = (item["side"], item["area"].id)
        counts[key] = counts.get(key, 0) + 1
    for (side, area_id), count in counts.items():
        if count > areas[area_id].max_layers:
            raise ValidationError(
                f"تعداد لایه‌های سمت «{side}» در ناحیه «{areas[area_id].name}» بیش از حد مجاز است."
            )

    for side in ("front", "back"):
        for area_id, area in areas.items():
            area_layers = [
                item for item in parsed
                if item["side"] == side and item["area"].id == area_id
            ]
            if not area_layers:
                continue

            # The garment's production maps are shared by front/back when the
            # same print area is mapped to both views. The side is persisted
            # separately so the order snapshot remains unambiguous.
            for view in views.values():
                view_map = maps.get((area_id, view.id))
                if not view_map:
                    continue
                existing = []
                for item in area_layers:
                    validate_placement(area, view_map, item["placement"], existing)
                    existing.append(
                        _to_canvas_placement(item["placement"], view_map.geometry)
                    )

    base_price = int(getattr(settings, "CUSTOMIZER_BASE_PRICE", CUSTOMIZER_BASE_PRICE))
    total = base_price

    normalized_layers = []
    for item in parsed:
        artwork = item["artwork"]
        price = (
            prices.get((artwork.id, item["area"].id), artwork.base_price or CUSTOM_UPLOAD_PRICE)
            if artwork is not None
            else 0
        )
        total += int(price)
        normalized_layers.append({
            "type": item["layer_type"],
            "artwork_id": artwork.id if artwork is not None else None,
            "artwork_code": artwork.code if artwork is not None else None,
            "artwork_name": artwork.name if artwork is not None else None,
            "price": int(price),
            "area_id": item["area"].id,
            "area_key": item["area"].key,
            "area_name": item["area"].name,
            "side": item["side"],
            "x": round(item["placement"].x, 6),
            "y": round(item["placement"].y, 6),
            "width": round(item["placement"].width, 6),
            "height": round(item["placement"].height, 6),
            "rotation": round(item["placement"].rotation, 4),
            "text": item["text"],
            "text_style": item["text_style"],
        })

    normalized = {
        "version": 2,
        "coordinate_space": "print_area_bbox",
        "base_price": base_price,
        "layers": normalized_layers,
    }
    return normalized, total, base_price


@transaction.atomic
def save_design_draft(*, request, product, payload, variant=None):
    if not request.session.session_key:
        request.session.create()
    normalized, total_price, base_price = validate_design_payload(
        product, payload, variant=variant, request=request
    )
    draft = DesignDraft.objects.create(
        product=product,
        variant=variant,
        user=request.user if request.user.is_authenticated else None,
        session_key=request.session.session_key,
        status=DesignDraft.Status.DRAFT,
        base_price_snapshot=base_price,
        shirt_spec={
            "unit": "cm", "body_width": 47, "body_height": 68,
            "shoulder_width": 36, "collar_width": 14, "collar_depth": 9,
            "sleeve_length": 21, "sleeve_width": 16, "sleeve_drop": 23,
            "underarm_width": 10, "print_zone": "torso_only", "front_and_back": True,
            "shirt_color": str(payload.get("shirt_color", "")).strip()[:40],
        },
        total_price=total_price,
        payload=normalized,
    )
    DesignLayer.objects.bulk_create([
        DesignLayer(
            draft=draft,
            layer_type=(
                DesignLayer.LayerType.TEXT
                if layer["type"] == "text"
                else DesignLayer.LayerType.ARTWORK
            ),
            artwork_id=layer["artwork_id"],
            area_id=layer["area_id"],
            side=layer["side"],
            text_content=layer["text"],
            text_style=layer["text_style"],
            x=layer["x"],
            y=layer["y"],
            width=layer["width"],
            height=layer["height"],
            rotation=layer["rotation"],
            z_index=index,
        )
        for index, layer in enumerate(normalized["layers"])
    ])
    return draft


def _multipart_payload(field_name, filename, content, content_type, fields):
    boundary = f"----Babaei{uuid.uuid4().hex}"
    chunks = []
    for name, value in fields.items():
        chunks.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    chunks.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field_name}\"; filename=\"{filename}\"\r\nContent-Type: {content_type}\r\n\r\n".encode())
    chunks.extend((content, f"\r\n--{boundary}--\r\n".encode()))
    return boundary, b"".join(chunks)


def remove_background(file_obj):
    api_key = getattr(settings, "REMOVE_BG_API_KEY", "")
    if not api_key:
        raise ValidationError("حذف خودکار پس‌زمینه هنوز روی سرور تنظیم نشده است.")
    file_obj.seek(0)
    content = file_obj.read(MAX_ARTWORK_UPLOAD_BYTES + 1)
    if len(content) > MAX_ARTWORK_UPLOAD_BYTES:
        raise ValidationError("حجم تصویر باید حداکثر ۸ مگابایت باشد.")
    boundary, body = _multipart_payload(
        "image_file", Path(file_obj.name).name, content,
        getattr(file_obj, "content_type", None) or "application/octet-stream",
        {"size": "full", "format": "png", "type": "graphic"},
    )
    req = urlrequest.Request(
        "https://api.remove.bg/v1.0/removebg", data=body,
        headers={"X-Api-Key": api_key, "Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=45) as response:
            if response.status != 200:
                raise ValidationError("سرویس حذف پس‌زمینه پاسخ معتبری نداد.")
            return response.read()
    except (urlerror.HTTPError, urlerror.URLError) as exc:
        raise ValidationError("حذف خودکار پس‌زمینه انجام نشد؛ لطفاً دوباره تلاش کنید.") from exc


def create_uploaded_artwork(*, request, uploaded_file, strip_background=False):
    if uploaded_file.size > MAX_ARTWORK_UPLOAD_BYTES:
        raise ValidationError("حجم تصویر باید حداکثر ۸ مگابایت باشد.")
    if not request.session.session_key:
        request.session.create()

    from PIL import Image, ImageFile, UnidentifiedImageError

    ImageFile.LOAD_TRUNCATED_IMAGES = False
    uploaded_file.seek(0)
    try:
        image = Image.open(uploaded_file)
        image.verify()
        uploaded_file.seek(0)
        image = Image.open(uploaded_file)
        width, height = image.size
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValidationError("فایل انتخاب‌شده یک تصویر معتبر نیست.")
    if width < 300 or height < 300:
        raise ValidationError("ابعاد تصویر باید حداقل ۳۰۰×۳۰۰ پیکسل باشد.")
    has_alpha = False
    if "A" in image.getbands():
        has_alpha = image.getchannel("A").getextrema()[0] < 255
    elif image.mode == "P" and "transparency" in image.info:
        has_alpha = image.convert("RGBA").getchannel("A").getextrema()[0] < 255

    artwork = Artwork(
        name=Path(uploaded_file.name).stem[:160], source=Artwork.Source.UPLOAD,
        processing_status=Artwork.ProcessingStatus.READY, background_removed=True,
        base_price=int(getattr(settings, "CUSTOMIZER_UPLOAD_PRICE", CUSTOM_UPLOAD_PRICE)),
        owner=request.user if request.user.is_authenticated else None,
        session_key=request.session.session_key,
    )
    artwork.slug = f"upload-{uuid.uuid4().hex}"
    artwork.original_image.save(uploaded_file.name, uploaded_file, save=False)
    if strip_background:
        processed = remove_background(uploaded_file)
        artwork.image.save(f"{artwork.uuid}.png", ContentFile(processed), save=False)
        artwork.background_removed = True
    else:
        uploaded_file.seek(0)
        artwork.image.save(uploaded_file.name, uploaded_file, save=False)
        artwork.background_removed = has_alpha
    artwork.save()
    return artwork
