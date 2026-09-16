from django.db import IntegrityError
from django.test import TestCase
from django.urls import reverse

from .models import Category, Product, ProductColor, ProductSize, ProductVariant


class ShopModelTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name="تیشرت", slug="تیشرت")
        self.product = Product.objects.create(
            category=self.category,
            name="تیشرت مشکی",
            slug="black-tshirt",
            base_price=490000,
            is_active=True,
        )
        self.color = ProductColor.objects.create(name="مشکی", slug="black", hex_code="#000000")
        self.size = ProductSize.objects.create(name="L", slug="l")

    def test_variant_reports_stock(self):
        variant = ProductVariant.objects.create(
            product=self.product,
            color=self.color,
            size=self.size,
            sku="BT-BLK-L",
            price=490000,
            stock_quantity=3,
        )
        self.assertTrue(variant.in_stock)

    def test_variant_combination_is_unique_per_product(self):
        ProductVariant.objects.create(
            product=self.product,
            color=self.color,
            size=self.size,
            sku="BT-BLK-L",
            price=490000,
        )

        with self.assertRaises(IntegrityError):
            ProductVariant.objects.create(
                product=self.product,
                color=self.color,
                size=self.size,
                sku="BT-BLK-L-2",
                price=490000,
            )

    def test_display_price_uses_base_price(self):
        self.assertEqual(self.product.display_price, 490000)


class ShopViewTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name="تیشرت", slug="تیشرت")
        self.product = Product.objects.create(
            category=self.category,
            name="تیشرت مشکی",
            slug="black-tshirt",
            base_price=490000,
            is_active=True,
        )

    def test_shop_home_is_reachable(self):
        response = self.client.get(reverse("shop:index"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, self.product.name)

    def test_category_is_reachable(self):
        response = self.client.get(
            reverse("shop:category", kwargs={"slug": self.category.slug})
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, self.product.name)

    def test_product_detail_is_reachable(self):
        response = self.client.get(
            reverse("shop:product", kwargs={"slug": self.product.slug})
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, self.product.name)
        self.assertContains(response, "شخصی‌سازی این تی‌شرت")

    def test_inactive_product_is_hidden_from_shop(self):
        self.product.is_active = False
        self.product.save(update_fields=["is_active"])

        response = self.client.get(reverse("shop:index"))

        self.assertNotContains(response, self.product.name)

    def test_inactive_category_is_not_public(self):
        self.category.is_active = False
        self.category.save(update_fields=["is_active"])

        response = self.client.get(
            reverse("shop:category", kwargs={"slug": self.category.slug})
        )

        self.assertEqual(response.status_code, 404)
