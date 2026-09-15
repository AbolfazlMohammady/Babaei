import uuid
from datetime import timedelta
from django.utils import timezone
from django.db import models, transaction
from django.utils.translation import gettext_lazy as _
from phonenumber_field.modelfields import PhoneNumberField
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.core.validators import RegexValidator

from apps.users.core.role.user_role import RoleUser, RoleUserGender
from apps.users.core.utils.utils import path_image_or_file_user_profile


class CustomUserManager(BaseUserManager):
    def create_user(self, phone, email=None, password=None,**extra_fields):
        if not phone:
            raise ValueError(
                "Phone must be provided."
            )

        email = self.normalize_email(email) if email else None
        user = self.model(phone=phone,email=email , **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user 

    def create_superuser(self, phone=None, email=None, password=None,**extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError(_('Superuser must have is_staff=True.'))
        if extra_fields.get('is_superuser') is not True:
            raise ValueError(_('Superuser must have is_superuser=True.'))
        if not phone:
            raise ValueError(
                "Phone must be provided."
            )

        email = self.normalize_email(email) if email else None
        user = self.model(phone=phone,email=email , **extra_fields)
        user.set_password(password)
        user.role = 'admin'
        user.save(using=self._db)
        return user 


class User(AbstractUser):
    username= None
    uuid = models.UUIDField(
        default=uuid.uuid4, 
        editable=False, 
        unique=True)
    
    phone = PhoneNumberField(_("شماره تلفن "),unique=True)
    email = models.EmailField(_('ایمیل'),unique=True, blank=True, null=True)
    first_name= models.CharField(_('نام'), max_length=100)
    last_name= models.CharField(_('نام خانوادگی'), max_length=100)
    birth_date = models.DateField(_('تاریخ تولد'),blank=True, null=True)
    national_code = models.CharField(_('کد ملی'),
                                    max_length=10,
                                    validators=[RegexValidator(r'^\d{10}$', _('کد ملی باید ۱۰ رقم باشد.'))], 
                                    blank=True, 
                                    null=True,
                                    unique=True)
    
    role = models.CharField((_('شخصیت')),
                            max_length=20,
                            choices=RoleUser.choices, 
                            default=RoleUser.AUTHOR)
    image= models.ImageField(_('تصویر'),
                            upload_to=path_image_or_file_user_profile, 
                            blank=True, null=True)
    gender = models.CharField(_('جنسیت'),
                            max_length=10,
                            choices=RoleUserGender.choices,
                            blank=True, 
                            null=True)
    

    objects = CustomUserManager()
    REQUIRED_FIELDS= []
    USERNAME_FIELD = 'phone'

    @property
    def age(self):
        if not self.birth_date:
            return None

        today = timezone.localdate()
        age = today.year - self.birth_date.year

        if (today.month , today.day) <(
            self.birth_date.month, 
            self.birth_date.day):
            age -= 1

        return age


    def __str__(self):
        return f'{self.email if not self.phone else str(self.phone)}'




class OTP(models.Model):
    code = models.CharField(max_length=6)
    phone = models.CharField(max_length=15)
    created_at = models.DateTimeField(auto_now_add=True)
    expire_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)


    def __str__(self):
        return f"{self.phone} ---> code: {self.code}"

    def is_valid(self):
        return self.expire_at > timezone.now() and not self.is_used

    def save(self, *args, **kwargs):
        if not self.expire_at:
            self.expire_at = timezone.now() + timedelta(minutes=2)

        
        super().save(*args, **kwargs)




