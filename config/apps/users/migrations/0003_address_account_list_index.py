from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0002_user_data_integrity"),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name="address",
            name="users_address_user_default_idx",
        ),
        migrations.AddIndex(
            model_name="address",
            index=models.Index(
                fields=("user", "-is_default", "-id"),
                name="users_address_account_list_idx",
            ),
        ),
    ]
