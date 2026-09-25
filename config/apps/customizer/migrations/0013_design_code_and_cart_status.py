from django.db import migrations, models
import apps.customizer.models


class Migration(migrations.Migration):

    dependencies = [
        ("customizer", "0012_print_area_side"),
    ]

    operations = [
        migrations.AlterField(
            model_name="designdraft",
            name="design_code",
            field=models.CharField(
                db_index=True,
                default=apps.customizer.models._design_code,
                editable=False,
                max_length=32,
                unique=True,
                verbose_name="شناسه یکتای طراحی",
            ),
        ),
        migrations.AlterField(
            model_name="designdraft",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "پیش‌نویس"),
                    ("cart", "در سبد خرید"),
                    ("confirmed", "تأییدشده"),
                    ("expired", "منقضی"),
                ],
                db_index=True,
                default="draft",
                max_length=20,
            ),
        ),
    ]
