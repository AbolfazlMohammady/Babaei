from __future__ import annotations

import uuid
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator, MinValueValidator, MaxValueValidator
from django.db import models
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _


IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"]
MODEL_EXTENSIONS = ["glb", "gltf"]


def _asset_path(instance, filename):
    extension = Path(filename).suffix.lower() or ".png"
    return f"customizer/artworks/{instance.uuid}/{uuid.uuid4().hex}{extension}"


def _original_asset_path(instance, filename):
    extension = Path(filename).suffix.lower() or ".png"
    return f"customizer/originals/{instance.uuid}/{uuid.uuid4().hex}{extension}"


def _view_image_path(instance, filename):
    extension = Path(filename).suffix.lower() or ".webp"
    return f"customizer/views/{instance.product.uuid}/{instance.key}/{uuid.uuid4().hex}{extension}"


def _mask_image_path(instance, filename):
    extension = Path(filename).suffix.lower() or ".webp"
    return f"customizer/masks/{instance.product.uuid}/{instance.key}/{uuid.uuid4().hex}{extension}"


def _model_path(instance, filename):
    extension = Path(filename).suffix.lower() or ".glb"
    return f"customizer/models/{instance.product.uuid}/{uuid.uuid4().hex}{extension}"


def _validate_geometry(value):
    if not isinstance(value, list) or len(value) < 3:
        raise ValidationError(_("ناحیه چاپ باید حداقل ۳ نقطه داشته باشد."))
    for point in value:
        if not isinstance(point, dict):
            raise ValidationError(_("فرمت نقاط ناحیه چاپ نامعتبر است."))
        x, y = point.get("x"), point.get("y")
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)) or not (0 <= x <= 1 and 0 <= y <= 1):
            raise ValidationError(_("مختصات ناحیه چاپ باید بین ۰ و ۱ باشند."))


class Artwork(models.Model):
    class Source(models.TextChoices):
        LIBRARY = "library", _("کتابخانه")
        UPLOAD = "upload", _("آپلود مشتری")

    class ProcessingStatus(models.TextChoices):
        READY = "ready", _("آماده")
        PROCESSING = "processing", _("در حال پردازش")
        FAILED = "failed", _("ناموفق")

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    name = models.CharField(_("نام لیبل"), max_length=160)
    slug = models.SlugField(_("اسلاگ"), max_length=190, unique=True, allow_unicode=True)
    image = models.ImageField(_("لیبل آماده"), upload_to=_asset_path, validators=[FileExtensionValidator(IMAGE_EXTENSIONS)])
    original_image = models.ImageField(_("تصویر اصلی"), upload_to=_original_asset_path, blank=True, null=True, validators=[FileExtensionValidator(IMAGE_EXTENSIONS)])
    source = models.CharField(_("منبع"), max_length=20, choices=Source.choices, default=Source.LIBRARY)
    processing_status = models.CharField(_("وضعیت پردازش"), max_length=20, choices=ProcessingStatus.choices, default=ProcessingStatus.READY)
    background_removed = models.BooleanField(_("پس‌زمینه حذف شده"), default=True)
    base_price = models.PositiveBigIntegerField(_("قیمت پایه لیبل"), default=0, validators=[MinValueValidator(0)])
    min_width_px = models.PositiveIntegerField(_("حداقل عرض فایل"), default=500)
    is_active = models.BooleanField(_("فعال"), default=True, db_index=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name="customizer_artworks", verbose_name=_("مالک"))
    session_key = models.CharField(_("کلید نشست"), max_length=64, blank=True, db_index=True)
    created_at = models.DateTimeField(_("زمان ایجاد"), auto_now_add=True)
    updated_at = models.DateTimeField(_("آخرین بروزرسانی"), auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("is_active", "source", "-created_at"))]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name, allow_unicode=True) or self.uuid.hex
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class DesignerView(models.Model):
    product = models.ForeignKey("shop.Product", on_delete=models.CASCADE, related_name="designer_views", verbose_name=_("محصول"))
    key = models.SlugField(_("کلید نما"), max_length=60, allow_unicode=True)
    name = models.CharField(_("نام نما"), max_length=80)
    background_image = models.ImageField(_("تصویر لباس"), upload_to=_view_image_path)
    mask_image = models.ImageField(_("ماسک و سایه"), upload_to=_mask_image_path, blank=True, null=True)
    model_3d = models.FileField(_("مدل سه‌بعدی لباس (GLB/GLTF)"), upload_to=_model_path, blank=True, null=True, validators=[FileExtensionValidator(MODEL_EXTENSIONS)], help_text=_("مدل ترجیحاً GLB باشد و UV mapping مناسب برای چاپ داشته باشد."))
    model_3d_url = models.URLField(_("آدرس مدل سه‌بعدی"), blank=True, help_text=_("برای CDN یا مدل دمو؛ در صورت وجود فایل محلی، فایل اولویت دارد."))
    model_3d_scale = models.FloatField(_("مقیاس مدل سه‌بعدی"), default=1.0, validators=[MinValueValidator(0.01)])
    canvas_width = models.PositiveIntegerField(_("عرض مرجع"), default=1600)
    canvas_height = models.PositiveIntegerField(_("ارتفاع مرجع"), default=1600)
    angle = models.SmallIntegerField(_("زاویه"), default=0, validators=[MinValueValidator(-180), MaxValueValidator(180)])
    sort_order = models.PositiveSmallIntegerField(_("ترتیب"), default=0)
    is_active = models.BooleanField(_("فعال"), default=True, db_index=True)

    class Meta:
        ordering = ("sort_order", "id")
        constraints = [models.UniqueConstraint(fields=("product", "key"), name="unique_designer_view_per_product")]
        indexes = [models.Index(fields=("product", "is_active", "sort_order"))]

    def __str__(self):
        return f"{self.product} / {self.name}"


class PrintArea(models.Model):
    product = models.ForeignKey("shop.Product", on_delete=models.CASCADE, related_name="print_areas", verbose_name=_("محصول"))
    key = models.SlugField(_("کلید ناحیه"), max_length=70, allow_unicode=True)
    name = models.CharField(_("نام ناحیه"), max_length=100)
    max_width_mm = models.DecimalField(_("حداکثر عرض چاپ (mm)"), max_digits=7, decimal_places=2, default=100)
    max_height_mm = models.DecimalField(_("حداکثر ارتفاع چاپ (mm)"), max_digits=7, decimal_places=2, default=100)
    max_layers = models.PositiveSmallIntegerField(_("حداکثر تعداد لیبل"), default=3)
    sort_order = models.PositiveSmallIntegerField(_("ترتیب"), default=0)
    is_active = models.BooleanField(_("فعال"), default=True, db_index=True)

    class Meta:
        ordering = ("sort_order", "id")
        constraints = [models.UniqueConstraint(fields=("product", "key"), name="unique_print_area_per_product")]
        indexes = [models.Index(fields=("product", "is_active", "sort_order"))]

    def __str__(self):
        return f"{self.product} / {self.name}"


class PrintAreaView(models.Model):
    area = models.ForeignKey(PrintArea, on_delete=models.CASCADE, related_name="view_maps", verbose_name=_("ناحیه چاپ"))
    view = models.ForeignKey(DesignerView, on_delete=models.CASCADE, related_name="area_maps", verbose_name=_("نما"))
    geometry = models.JSONField(_("چندضلعی ناحیه"), validators=[_validate_geometry])

    class Meta:
        constraints = [models.UniqueConstraint(fields=("area", "view"), name="unique_print_area_view")]

    def clean(self):
        super().clean()
        if self.area_id and self.view_id and self.area.product_id != self.view.product_id:
            raise ValidationError(_("ناحیه چاپ و نما باید متعلق به یک محصول باشند."))
        _validate_geometry(self.geometry)

    def __str__(self):
        return f"{self.area} / {self.view.name}"


class ArtworkAreaPrice(models.Model):
    artwork = models.ForeignKey(Artwork, on_delete=models.CASCADE, related_name="area_prices", verbose_name=_("لیبل"))
    area = models.ForeignKey(PrintArea, on_delete=models.CASCADE, related_name="artwork_prices", verbose_name=_("ناحیه چاپ"))
    price = models.PositiveBigIntegerField(_("قیمت"), validators=[MinValueValidator(0)])

    class Meta:
        constraints = [models.UniqueConstraint(fields=("artwork", "area"), name="unique_artwork_area_price")]
        indexes = [models.Index(fields=("area", "artwork"))]

    def clean(self):
        super().clean()
        if self.artwork_id and self.area_id and self.artwork.source == Artwork.Source.LIBRARY and not self.artwork.is_active:
            raise ValidationError(_("لیبل انتخاب‌شده غیرفعال است."))

    def __str__(self):
        return f"{self.artwork} / {self.area}: {self.price}"


class DesignDraft(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", _("پیش‌نویس")
        CONFIRMED = "confirmed", _("تأییدشده")
        EXPIRED = "expired", _("منقضی")

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    product = models.ForeignKey("shop.Product", on_delete=models.PROTECT, related_name="design_drafts")
    variant = models.ForeignKey("shop.ProductVariant", on_delete=models.PROTECT, blank=True, null=True, related_name="design_drafts")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name="design_drafts")
    session_key = models.CharField(max_length=64, blank=True, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    total_price = models.PositiveBigIntegerField(default=0)
    payload = models.JSONField(default=dict, blank=True)
    preview_image = models.ImageField(upload_to="customizer/previews/%Y/%m/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)
        indexes = [models.Index(fields=("product", "status", "-updated_at"))]

    def __str__(self):
        return f"{self.product} / {self.uuid}"


class DesignLayer(models.Model):
    draft = models.ForeignKey(DesignDraft, on_delete=models.CASCADE, related_name="layers")
    artwork = models.ForeignKey(Artwork, on_delete=models.PROTECT, related_name="design_layers")
    area = models.ForeignKey(PrintArea, on_delete=models.PROTECT, related_name="design_layers")
    x = models.FloatField(_("مرکز X"), validators=[MinValueValidator(0), MaxValueValidator(1)])
    y = models.FloatField(_("مرکز Y"), validators=[MinValueValidator(0), MaxValueValidator(1)])
    width = models.FloatField(_("عرض"), validators=[MinValueValidator(0.01), MaxValueValidator(1)])
    height = models.FloatField(_("ارتفاع"), validators=[MinValueValidator(0.01), MaxValueValidator(1)])
    rotation = models.FloatField(_("چرخش"), default=0, validators=[MinValueValidator(-180), MaxValueValidator(180)])
    z_index = models.PositiveSmallIntegerField(_("ترتیب لایه"), default=0)

    class Meta:
        ordering = ("z_index", "id")
        indexes = [models.Index(fields=("draft", "area", "z_index"))]

    def clean(self):
        super().clean()
        if self.area_id and self.draft_id and self.area.product_id != self.draft.product_id:
            raise ValidationError(_("ناحیه چاپ باید متعلق به همان محصول باشد."))
        if self.artwork_id and not self.artwork.is_active:
            raise ValidationError(_("این لیبل دیگر فعال نیست."))

    def __str__(self):
        return f"{self.draft.uuid} / {self.artwork.name}"


from .ai_models import Product3DAsset, Product3DSource
