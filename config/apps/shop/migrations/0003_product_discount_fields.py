from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shop", "0002_catalog_integrity"),
        ("shop", "0002_rename_shop_catego_is_acti_idx_shop_catego_is_acti_b15761_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="compare_at_price",
            field=models.PositiveBigIntegerField(
                blank=True,
                help_text="اگر محصول تخفیف دارد، قیمت قبل از تخفیف را وارد کنید.",
                null=True,
                validators=[],
                verbose_name="قیمت قبل از تخفیف",
            ),
        ),
        migrations.AddField(
            model_name="productvariant",
            name="compare_at_price",
            field=models.PositiveBigIntegerField(
                blank=True,
                help_text="در صورت تخفیف این ترکیب، قیمت قبل از تخفیف را وارد کنید.",
                null=True,
                validators=[],
                verbose_name="قیمت قبل از تخفیف",
            ),
        ),
    ]
