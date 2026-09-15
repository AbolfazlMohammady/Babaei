import uuid
from datetime import timedelta

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from phonenumber_field.modelfields import PhoneNumberField


def user_profile_image_path(instance, filename):
    return f"users/{instance.uuid}/profile/{filename}"


class RoleUser(models.TextChoices):
    CUSTOMER = "customer", _("مشتری")
    ADMIN = "admin", _("مدیر")
    BLOG_MANAGER = "blog_manager", _("مدیر بلاگ")


class RoleUserGender(models.TextChoices):
    MALE = "male", _("آقا")
    FEMALE = "female", _("خانم")


class CustomUserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, phone, password=None, **extra_fields):
        if not phone:
            raise ValueError(_("شماره تلفن الزامی است."))

        user = self.model(phone=phone, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("role", RoleUser.ADMIN)

        if extra_fields.get("is_staff") is not True:
            raise ValueError(_("Superuser must have is_staff=True."))

        if extra_fields.get("is_superuser") is not True:
            raise ValueError(_("Superuser must have is_superuser=True."))

        return self.create_user(phone=phone, password=password, **extra_fields)


class User(AbstractUser):
    username = None

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    phone = PhoneNumberField(_("شماره تلفن"), unique=True)
    email = models.EmailField(_("ایمیل"), unique=True, blank=True, null=True)
    first_name = models.CharField(_("نام"), max_length=100, blank=True)
    last_name = models.CharField(_("نام خانوادگی"), max_length=100, blank=True)
    birth_date = models.DateField(_("تاریخ تولد"), blank=True, null=True)
    role = models.CharField(_("نقش"), max_length=20, choices=RoleUser.choices, default=RoleUser.CUSTOMER)
    image = models.ImageField(_("تصویر پروفایل"), upload_to=user_profile_image_path, blank=True, null=True)
    gender = models.CharField(_("جنسیت"), max_length=10, choices=RoleUserGender.choices, blank=True, null=True)

    objects = CustomUserManager()

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = []

    @property
    def age(self):
        if not self.birth_date:
            return None

        today = timezone.localdate()
        age = today.year - self.birth_date.year

        if (today.month, today.day) < (self.birth_date.month, self.birth_date.day):
            age -= 1

        return age

    def __str__(self):
        return str(self.phone)


class Province(models.Model):
    name = models.CharField(_("استان"), max_length=100, unique=True)

    def __str__(self):
        return self.name


class City(models.Model):
    province = models.ForeignKey(Province, on_delete=models.CASCADE, related_name="cities", verbose_name=_("استان"))
    name = models.CharField(_("شهر"), max_length=100)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["province", "name"], name="unique_city_per_province")
        ]

    def __str__(self):
        return self.name


class Address(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="addresses", verbose_name=_("کاربر"))
    title = models.CharField(_("عنوان"), max_length=100)
    phone = models.CharField(
        _("شماره موبایل"),
        max_length=11,
        validators=[RegexValidator(r"^09\d{9}$", _("شماره موبایل باید ۱۱ رقم و با 09 شروع شود."))],
    )
    description = models.TextField(_("آدرس"), blank=True)
    city = models.ForeignKey(City, on_delete=models.PROTECT, related_name="addresses", verbose_name=_("شهر"))
    postal_code = models.CharField(
        _("کد پستی"),
        max_length=10,
        validators=[RegexValidator(r"^\d{10}$", _("کد پستی باید دقیقاً ۱۰ رقم باشد."))],
    )

    def __str__(self):
        return self.title


class OTP(models.Model):
    code = models.CharField(_("کد"), max_length=6)
    phone = models.CharField(_("شماره تلفن"), max_length=15, db_index=True)
    created_at = models.DateTimeField(_("زمان ایجاد"), auto_now_add=True)
    expire_at = models.DateTimeField(_("زمان انقضا"))
    is_used = models.BooleanField(_("استفاده شده"), default=False)

    def save(self, *args, **kwargs):
        if not self.expire_at:
            self.expire_at = timezone.now() + timedelta(minutes=2)

        super().save(*args, **kwargs)

    def is_valid(self):
        return self.expire_at > timezone.now() and not self.is_used

    def __str__(self):
        return f"{self.phone} -> {self.code}"
