from django.db import IntegrityError
from django.test import TestCase

from .models import Address, City, Province, User


class UserModelTests(TestCase):
    def test_manager_normalizes_iranian_phone_number(self):
        user = User.objects.create_user(phone="09121234567")
        self.assertEqual(str(user.phone), "+989121234567")

    def test_default_address_is_unique_per_user(self):
        user = User.objects.create_user(phone="09121234567")
        province = Province.objects.create(name="تهران")
        city = City.objects.create(province=province, name="تهران")

        Address.objects.create(
            user=user,
            title="خانه",
            phone="09121234567",
            description="تهران",
            city=city,
            postal_code="1234567890",
            is_default=True,
        )

        with self.assertRaises(IntegrityError):
            Address.objects.create(
                user=user,
                title="محل کار",
                phone="09121234567",
                description="تهران",
                city=city,
                postal_code="1234567891",
                is_default=True,
            )
