from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("customizer", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="artwork",
            name="code",
            field=models.CharField(
                db_index=True,
                default="",
                editable=False,
                max_length=40,
                unique=True,
                verbose_name="کد لیبل",
            ),
            preserve_default=False,
        ),
    ]
