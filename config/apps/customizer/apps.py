from django.apps import AppConfig


class CustomizerConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.customizer"
    verbose_name = "طراح لباس"
