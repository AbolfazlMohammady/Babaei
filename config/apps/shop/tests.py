from django.test import TestCase
from django.urls import reverse

from .models import Category, Product, ProductColor, ProductImage, ProductSize, ProductVariant


class ShopModelTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name="تیشرت", slug="tshirt")
        self.color = ProductColor.objects.create(name="مشکی", slug="black", hex_code="#000000")
        self.size = ProductSize.objects.create(name="L", slug="l")
        self.product = Product.objects.create(
            category=self.category,
            name="تیشرت کلاسیک مشکی",
            slug="classic-black-tshirt",
            base_price=450000,
            is_active=True,
        )

    def test_product_slug_and_variant_constraint(self):
        variant = ProductVariant.objects.create(
            product=self.product,
            color=self.color,
            size=self.size,
            sku="TS-BLK-L",
            price=450000,
            stock_quantity=5,
        )

        self.assertEqual(variant.product_id, self.product.id)
        self.assertEqual(self.product.slug, "classic-black-tshirt")

    def test_product_image_relation(self):
        image = ProductImage.objects.create(
            product=self.product,
            image="shop/products/test.webp",
            alt_text="تیشرت کلاسیک مشکی",
            image_type=ProductImage.ImageType.PRIMARY,
        )

        self.assertEqual(self.product.images.first(), image)


class ShopViewTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name="تیشرت", slug="tshirt")
        self.product = Product.objects.create(
            category=self.category,
            name="تیشرت کلاسیک",
            slug="classic-tshirt",
            base_price=450000,
            is_active=True,
        )

    def test_shop_page_returns_active_products(self):
        response = self.client.get(reverse("shop:index"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, self.product.name)

    def test_category_page_returns_active_products(self):
        response = self.client.get(
            reverse("shop:category", kwargs={"slug": self.category.slug})
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, self.product.name)

    def test_product_detail_page(self):
        response = self.client.get(
            reverse("shop:product-detail", kwargs={"slug": self.product.slug})
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, self.product.name)
