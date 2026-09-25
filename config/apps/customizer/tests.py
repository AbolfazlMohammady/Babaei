import base64
import json

import pytest
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.shop.models import Category, Product, ProductColor, ProductSize, ProductVariant

from .models import Artwork, ArtworkAreaPrice, DesignDraft, DesignerView, PrintArea, PrintAreaView
from .services import Placement, oriented_rects_overlap, point_in_polygon, validate_design_payload

PNG_1X1 = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")


@pytest.fixture
def product(db):
    category = Category.objects.create(name="تی‌شرت", slug="tshirt")
    return Product.objects.create(category=category, name="تی‌شرت مشکی", slug="black-tshirt", base_price=500000)


@pytest.fixture
def configured_designer(product):
    view = DesignerView.objects.create(
        product=product,
        key="front",
        name="روبه‌رو",
        background_image=SimpleUploadedFile("shirt.png", PNG_1X1, content_type="image/png"),
        canvas_width=1000,
        canvas_height=1000,
    )
    area = PrintArea.objects.create(product=product, key="left-chest", name="سینه چپ", max_layers=2)
    PrintAreaView.objects.create(
        area=area,
        view=view,
        geometry=[
            {"x": 0.30, "y": 0.25},
            {"x": 0.55, "y": 0.25},
            {"x": 0.55, "y": 0.50},
            {"x": 0.30, "y": 0.50},
        ],
    )
    artwork = Artwork.objects.create(
        name="اژدها",
        slug="dragon",
        image=SimpleUploadedFile("dragon.png", PNG_1X1, content_type="image/png"),
        base_price=100000,
    )
    ArtworkAreaPrice.objects.create(artwork=artwork, area=area, price=120000)
    return view, area, artwork


def test_geometry_and_rotated_collision():
    polygon = [(0, 0), (1, 0), (1, 1), (0, 1)]
    assert point_in_polygon((.5, .5), polygon)
    assert point_in_polygon((0, .5), polygon)
    assert not point_in_polygon((1.5, .5), polygon)
    assert oriented_rects_overlap(Placement(.5, .5, .2, .2), Placement(.6, .5, .2, .2))
    assert not oriented_rects_overlap(Placement(.2, .2, .1, .1), Placement(.8, .8, .1, .1))


def test_design_payload_calculates_area_specific_price(product, configured_designer):
    _, area, artwork = configured_designer
    payload = {"version": 1, "layers": [{"artwork_id": artwork.id, "area_id": area.id, "x": .5, "y": .5, "width": .3, "height": .3, "rotation": 0}]}
    normalized, total = validate_design_payload(product, payload)
    assert normalized["coordinate_space"] == "print_area_bbox"
    assert total == 620000


def test_design_payload_rejects_outside_and_overlap(product, configured_designer):
    _, area, artwork = configured_designer
    outside = {"version": 1, "layers": [{"artwork_id": artwork.id, "area_id": area.id, "x": .5, "y": .5, "width": 1.1, "height": .3, "rotation": 0}]}
    with pytest.raises(ValidationError):
        validate_design_payload(product, outside)

    overlap = {"version": 1, "layers": [
        {"artwork_id": artwork.id, "area_id": area.id, "x": .35, "y": .5, "width": .3, "height": .3, "rotation": 0},
        {"artwork_id": artwork.id, "area_id": area.id, "x": .45, "y": .5, "width": .3, "height": .3, "rotation": 0},
    ]}
    with pytest.raises(ValidationError):
        validate_design_payload(product, overlap)


def test_variant_must_be_in_stock_when_selected(product, configured_designer):
    _, area, artwork = configured_designer
    color = ProductColor.objects.create(name="مشکی", slug="black", hex_code="#000000")
    size = ProductSize.objects.create(name="L", slug="l")
    variant = ProductVariant.objects.create(product=product, color=color, size=size, sku="BLACK-L", price=550000, stock_quantity=0)
    payload = {"version": 1, "layers": [{"artwork_id": artwork.id, "area_id": area.id, "x": .5, "y": .5, "width": .3, "height": .3, "rotation": 0}]}
    with pytest.raises(ValidationError):
        validate_design_payload(product, payload, variant=variant)


def test_variant_is_required_if_product_has_variants(product, configured_designer):
    _, area, artwork = configured_designer
    color = ProductColor.objects.create(name="مشکی", slug="black", hex_code="#000000")
    size = ProductSize.objects.create(name="L", slug="l")
    ProductVariant.objects.create(product=product, color=color, size=size, sku="BLACK-L", price=550000, stock_quantity=5)
    payload = {"version": 1, "layers": [{"artwork_id": artwork.id, "area_id": area.id, "x": .5, "y": .5, "width": .3, "height": .3, "rotation": 0}]}
    with pytest.raises(ValidationError):
        validate_design_payload(product, payload)


def test_designer_page_and_save_endpoint(client, product, configured_designer):
    response = client.get(reverse("customizer:designer", kwargs={"product_ref": str(product.uuid)}))
    assert response.status_code == 200

    _, area, artwork = configured_designer
    payload = {"variant_id": None, "version": 1, "layers": [{"artwork_id": artwork.id, "area_id": area.id, "x": .5, "y": .5, "width": .3, "height": .3, "rotation": 0}]}
    save = client.post(reverse("customizer:save_design", kwargs={"slug": product.slug}), data=json.dumps(payload), content_type="application/json")
    assert save.status_code == 200
    assert DesignDraft.objects.filter(product=product).exists()
