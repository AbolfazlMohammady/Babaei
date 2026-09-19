from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django import forms
from django.core.validators import MaxValueValidator, MinValueValidator

from .models import Product, ProductVariant


def discounted_price(price: int, discount_percent: int) -> int:
    if not discount_percent:
        return int(price)
    return int(
        (Decimal(price) * (Decimal(100) - Decimal(discount_percent)) / Decimal(100))
        .quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    )


def discount_percent_from_prices(price: int, compare_at_price: int | None) -> int:
    if not compare_at_price or compare_at_price <= price:
        return 0
    return round((compare_at_price - price) * 100 / compare_at_price)


class ProductAdminForm(forms.ModelForm):
    discount_percent = forms.IntegerField(
        label="درصد تخفیف",
        required=False,
        initial=0,
        min_value=0,
        max_value=100,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        widget=forms.NumberInput(
            attrs={
                "min": 0,
                "max": 100,
                "step": 1,
                "inputmode": "numeric",
                "placeholder": "مثلاً 5",
            }
        ),
        help_text="مثلاً 5 یعنی ۵٪ از قیمت محصول کم می‌شود.",
    )

    class Meta:
        model = Product
        fields = (
            "name",
            "category",
            "slug",
            "short_description",
            "description",
            "base_price",
            "is_active",
            "is_featured",
            "seo_title",
            "seo_description",
        )
        labels = {
            "base_price": "قیمت محصول",
        }
        help_texts = {
            "base_price": "قیمت اصلی محصول را وارد کنید؛ درصد تخفیف جداگانه محاسبه می‌شود.",
        }
        widgets = {
            "base_price": forms.NumberInput(
                attrs={"min": 0, "step": 1, "inputmode": "numeric", "placeholder": "مثلاً 1390000"}
            ),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        instance = self.instance
        if instance and instance.pk:
            compare_price = instance.compare_at_price
            if compare_price and compare_price > instance.base_price:
                self.fields["base_price"].initial = compare_price
                self.fields["discount_percent"].initial = discount_percent_from_prices(
                    instance.base_price,
                    compare_price,
                )

    def save(self, commit=True):
        instance = super().save(commit=False)
        original_price = int(self.cleaned_data["base_price"] or 0)
        discount = int(self.cleaned_data.get("discount_percent") or 0)

        if discount:
            instance.base_price = discounted_price(original_price, discount)
            instance.compare_at_price = original_price
        else:
            instance.base_price = original_price
            instance.compare_at_price = None

        if commit:
            instance.save()
            self.save_m2m()
        return instance


class ProductVariantAdminForm(forms.ModelForm):
    discount_percent = forms.IntegerField(
        label="تخفیف ٪",
        required=False,
        initial=0,
        min_value=0,
        max_value=100,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        widget=forms.NumberInput(
            attrs={"min": 0, "max": 100, "step": 1, "inputmode": "numeric", "placeholder": "0"}
        ),
    )

    class Meta:
        model = ProductVariant
        fields = (
            "color",
            "size",
            "sku",
            "price",
            "stock_quantity",
            "is_active",
        )
        labels = {"price": "قیمت محصول"}
        widgets = {
            "price": forms.NumberInput(
                attrs={"min": 0, "step": 1, "inputmode": "numeric"}
            ),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        instance = self.instance
        if instance and instance.pk:
            compare_price = instance.compare_at_price
            if compare_price and compare_price > instance.price:
                self.fields["price"].initial = compare_price
                self.fields["discount_percent"].initial = discount_percent_from_prices(
                    instance.price,
                    compare_price,
                )

    def save(self, commit=True):
        instance = super().save(commit=False)
        original_price = int(self.cleaned_data["price"] or 0)
        discount = int(self.cleaned_data.get("discount_percent") or 0)

        if discount:
            instance.price = discounted_price(original_price, discount)
            instance.compare_at_price = original_price
        else:
            instance.price = original_price
            instance.compare_at_price = None

        if commit:
            instance.save()
            self.save_m2m()
        return instance
