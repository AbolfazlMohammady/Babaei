from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [
        ("shop", "0001_initial"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="productimage",
            constraint=models.UniqueConstraint(
                fields=("product",),
                condition=Q(image_type="primary"),
                name="unique_primary_image_per_product",
            ),
        ),
        migrations.AlterIndexTogether(
            name="productvariant",
            index_together=set(),
        ),
    ]
