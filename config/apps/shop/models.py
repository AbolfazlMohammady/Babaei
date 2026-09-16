from __future__ import annotations

import uuid
from pathlib import Path

from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.db.models import Q
from django.urls import reverse
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _


HEX_COLOR_VALIDATOR = RegexValidator(
    regex=r"^#[0-9A-Fa-f]{6}$",
    message=_("کد رنگ باید به صورت #RRGGBB باشد."),
)


def product_image_path(instance, filename):
    extension = Path(filename).suffix.lower() or ".webp"
    return f"shop/products/{instance.product.uuid}/{uuid.uuid4().hex}{extension}"


def category_image_path(instance, filename):
    extension = Path(filename).suffix.lower() or ".webp"
    return f"shop/categories/{instance.uuid}/{uuid.uuid4().hex}{extension}"


class Category(models.Model):
    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    name = models.CharField(_("نام"), max_length=120)
    slug = models.SlugField(_("اسلاگ"), max_length=150, unique=True, allow_unicode=True)
    description = models.TextField(_("توضیحات"), blank=True)
    image = models.ImageField(_("تصویر"), upload_to=category_image_path, blank=True, null=True)
    is_active = models.BooleanField(_("فعال"), default=True, db_index=True)
    sort_order = models.PositiveIntegerField(_("ترتیب"), default=0)
    seo_title = models.CharField(_("عنوان سئو"), max_length=70, blank=True)
    seo_description = models.CharField(_("توضیحات سئو"), max_length=160, blank=True)
    created_at = models.DateTimeField(_("زمان ایجاد"), auto_now_add=True)
    updated_at = models.DateTimeField(_("آخرین بروزرسانی"), auto_now=True)

    class Meta:
        ordering = ("sort_order", "name")
        indexes = [models.Index(fields=("is_active", "sort_order"))]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name, allow_unicode=True)
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse("shop:category", kwargs={"slug": self.slug})

    def __str__(self):
        return self.name


class Product(models.Model):
    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products", verbose_name=_("دسته‌بندی"))
    name = models.CharField(_("نام"), max_length=200)
    slug = models.SlugField(_("اسلاگ"), max_length=230, unique=True, allow_unicode=True)
    short_description = models.TextField(_("توضیحات کوتاه"), blank=True)
    description = models.TextField(_("توضیحات کامل"), blank=True)
    base_price = models.PositiveBigIntegerField(_("قیمت پایه"), validators=[MinValueValidator(0)])
    is_active = models.BooleanField(_("فعال"), default=True, db_index=True)
    is_featured = models.BooleanField(_("ویژه"), default=False, db_index=True)
    seo_title = models.CharField(_("عنوان سئو"), max_length=70, blank=True)
    seo_description = models.CharField(_("توضیحات سئو"), max_length=160, blank=True)
    created_at = models.DateTimeField(_("زمان ایجاد"), auto_now_add=True)
    updated_at = models.DateTimeField(_("آخرین بروزرسانی"), auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("category", "is_active", "-created_at")),
            models.Index(fields=("is_active", "is_featured", "-created_at")),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name, allow_unicode=True)
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse("shop:product", kwargs={"slug": self.slug})

    @property
    def display_price(self):
        prefetched = getattr(self, "_prefetched_objects_cache", {}).get("active_variants")
        if prefetched:
            return min(variant.price for variant in prefetched)
        return self.base_price

    def __str__(self):
        return self.name


class ProductColor(models.Model):
    name = models.CharField(_("نام"), max_length=80)
    slug = models.SlugField(_("اسلاگ"), max_length=100, unique=True, allow_unicode=True)
    hex_code = models.CharField(_("کد رنگ"), max_length=7, validators=[HEX_COLOR_VALIDATOR])
    is_active = models.BooleanField(_("فعال"), default=True, db_index=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name


class ProductSize(models.Model):
    name = models.CharField(_("نام"), max_length=40)
    slug = models.SlugField(_("اسلاگ"), max_length=60, unique=True, allow_unicode=True)
    sort_order = models.PositiveSmallIntegerField(_("ترتیب"), default=0)
    is_active = models.BooleanField(_("فعال"), default=True, db_index=True)

    class Meta:
        ordering = ("sort_order", "name")

    def __str__(self):
        return self.name


class ProductVariant(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants", verbose_name=_("محصول"))
    color = models.ForeignKey(ProductColor, on_delete=models.PROTECT, related_name="variants", verbose_name=_("رنگ"))
    size = models.ForeignKey(ProductSize, on_delete=models.PROTECT, related_name="variants", verbose_name=_("سایز"))
    sku = models.CharField(_("SKU"), max_length=80, unique=True)
    price = models.PositiveBigIntegerField(_("قیمت"), validators=[MinValueValidator(0)])
    stock_quantity = models.PositiveIntegerField(_("موجودی"), default=0)
    is_active = models.BooleanField(_("فعال"), default=True, db_index=True)

    class Meta:
        ordering = ("color", "size")
        constraints = [
            models.UniqueConstraint(fields=("product", "color", "size"), name="unique_product_variant"),
        ]
        indexes = [models.Index(fields=("product", "is_active", "color", "size"))]

    @property
    def in_stock(self):
        return self.stock_quantity > 0

    def __str__(self):
        return f"{self.product} / {self.color} / {self.size}"


class ProductImage(models.Model):
    class ImageType(models.TextChoices):
        PRIMARY = "primary", _("اصلی")
        DETAIL = "detail", _("جزئیات")
        GALLERY = "gallery", _("گالری")

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="images", verbose_name=_("محصول"))
    image = models.ImageField(_("تصویر"), upload_to=product_image_path, max_length=500)
    alt_text = models.CharField(_("متن جایگزین"), max_length=180, blank=True)
    image_type = models.CharField(_("نوع تصویر"), max_length=20, choices=ImageType.choices, default=ImageType.GALLERY)
    sort_order = models.PositiveSmallIntegerField(_("ترتیب"), default=0)

    class Meta:
        ordering = ("sort_order", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("product",),
                condition=Q(image_type="primary"),
                name="unique_primary_image_per_product",
            ),
        ]
        indexes = [models.Index(fields=("product", "image_type", "sort_order"))]

    def __str__(self):
        return f"{self.product} - {self.image_type}"
