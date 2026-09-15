from django.db import models

class RoleUser(models.TextChoices):
    ADMIN= 'admin', 'مدیر' 
    AUTHOR= 'author','نویسنده' 
    BLOG_MANAGER = 'Blog_manager', 'مدیر بلاگ' 


class RoleUserGender(models.TextChoices):
    MALE = 'male', 'اقا'
    FEMALE = 'female', 'خانم'
