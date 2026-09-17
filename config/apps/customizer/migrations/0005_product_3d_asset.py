from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("customizer", "0004_remove_demo_3d_models"),
        ("shop", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Product3DAsset",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("queued", "در صف آماده‌سازی"), ("removing_background", "در حال حذف پس‌زمینه"), ("generating", "در حال ساخت مدل سه‌بعدی"), ("ready", "آماده"), ("failed", "ناموفق")], db_index=True, default="queued", max_length=32)),
                ("provider", models.CharField(choices=[("meshy", "Meshy"), ("manual", "دستی")], default="meshy", max_length=20)),
                ("task_id", models.CharField(blank=True, db_index=True, max_length=120)),
                ("model_3d", models.FileField(blank=True, null=True, upload_to="customizer/generated/%Y/%m/")),
                ("model_url", models.URLField(blank=True)),
                ("preview_image", models.ImageField(blank=True, null=True, upload_to="customizer/generated/previews/%Y/%m/")),
                ("analysis", models.JSONField(blank=True, default=dict)),
                ("error_message", models.TextField(blank=True)),
                ("source_signature", models.CharField(blank=True, db_index=True, max_length=64)),
                ("progress", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("product", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="three_d_asset", to="shop.product", verbose_name="محصول")),
            ],
            options={"ordering": ("-updated_at",)},
        ),
        migrations.CreateModel(
            name="Product3DSource",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("processed_image", models.ImageField(blank=True, null=True, upload_to="customizer/generated/cutouts/%Y/%m/")),
                ("background_removed", models.BooleanField(default=False)),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("asset", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sources", to="customizer.product3dasset")),
                ("product_image", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="three_d_sources", to="shop.productimage")),
            ],
            options={"ordering": ("sort_order", "id")},
        ),
        migrations.AddConstraint(
            model_name="product3dsource",
            constraint=models.UniqueConstraint(fields=("asset", "product_image"), name="unique_3d_source_per_asset_image"),
        ),
    ]
