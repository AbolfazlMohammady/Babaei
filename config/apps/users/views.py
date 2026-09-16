import logging
import secrets
from datetime import date, timedelta

from django.contrib import messages
from django.contrib.auth import get_user_model, login, logout
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from .models import Address, City, OTP, Province

logger = logging.getLogger(__name__)
User = get_user_model()
AUTH_BACKEND = "apps.users.backends.BabaeiAxesBackend"
MIN_PROFILE_AGE = 13


def login_view(request):
    if request.user.is_authenticated:
        return redirect("users:profile")

    if request.method == "POST":
        phone = request.POST.get("phone", "").strip()
        if not phone:
            messages.error(request, "شماره موبایل را وارد کنید.")
            return render(request, "users/auth/login.html", {"phone": phone})

        otp = OTP(phone=phone, code=f"{secrets.randbelow(1_000_000):06d}")
        otp.save()
        request.session["otp_phone"] = phone
        request.session["otp_id"] = otp.id
        logger.info("OTP requested for phone %s", phone)
        logger.info("Development OTP: %s", otp.code)
        return redirect("users:verify_otp")

    return render(request, "users/auth/login.html")


def verify_otp_view(request):
    if request.user.is_authenticated:
        return redirect("users:profile")

    phone = request.session.get("otp_phone")
    otp_id = request.session.get("otp_id")
    if not phone or not otp_id:
        return redirect("users:login")

    otp = get_object_or_404(OTP, id=otp_id, phone=phone)
    if request.method == "POST":
        code = request.POST.get("code", "").strip()
        if not otp.is_valid():
            messages.error(request, "کد تأیید منقضی شده است.")
            return redirect("users:login")
        if otp.code != code:
            messages.error(request, "کد تأیید صحیح نیست.")
            return render(request, "users/auth/verify_otp.html", {"phone": phone})

        otp.is_used = True
        otp.save(update_fields=["is_used"])
        user, _ = User.objects.get_or_create(phone=phone, defaults={"role": "customer"})
        if not user.is_active:
            messages.error(request, "حساب کاربری شما غیرفعال است.")
            return redirect("users:login")

        login(request, user, backend=AUTH_BACKEND)
        request.session.pop("otp_phone", None)
        request.session.pop("otp_id", None)
        return redirect("users:profile")

    return render(request, "users/auth/verify_otp.html", {"phone": phone})


@login_required
def profile_view(request):
    return render(request, "users/account/profile.html", {"user": request.user})


@login_required
@require_http_methods(["GET", "POST"])
def profile_update_view(request):
    if request.method == "POST":
        user = request.user
        user.first_name = request.POST.get("first_name", "").strip()
        user.last_name = request.POST.get("last_name", "").strip()
        user.email = request.POST.get("email", "").strip() or None
        user.gender = request.POST.get("gender") or None

        birth_date = request.POST.get("birth_date", "").strip()
        if birth_date:
            try:
                parsed_birth_date = date.fromisoformat(birth_date)
            except ValueError:
                messages.error(request, "تاریخ تولد نامعتبر است.")
                return render(request, "users/account/profile.html", {"user": user})

            today = timezone.localdate()
            minimum_birth_date = date(today.year - MIN_PROFILE_AGE, today.month, today.day)
            if parsed_birth_date >= today:
                messages.error(request, "تاریخ تولد باید قبل از امروز باشد.")
                return render(request, "users/account/profile.html", {"user": user})
            if parsed_birth_date > minimum_birth_date:
                messages.error(request, f"برای ثبت تاریخ تولد، حداقل سن باید {MIN_PROFILE_AGE} سال باشد.")
                return render(request, "users/account/profile.html", {"user": user})
            user.birth_date = parsed_birth_date
        else:
            user.birth_date = None

        if "image" in request.FILES:
            user.image = request.FILES["image"]

        user.save()
        messages.success(request, "اطلاعات حساب با موفقیت ذخیره شد.")
        return redirect("users:profile")

    return render(request, "users/account/profile.html", {"user": request.user})


@login_required
def addresses_view(request):
    addresses = request.user.addresses.select_related("city", "city__province")
    return render(request, "users/account/addresses.html", {"addresses": addresses})


def _address_context(address=None, selected_province_id=None):
    provinces = Province.objects.order_by("name")
    cities = City.objects.select_related("province").order_by("province__name", "name")
    if selected_province_id is None and address and address.city_id:
        selected_province_id = address.city.province_id
    return {
        "address": address,
        "provinces": provinces,
        "cities": cities,
        "selected_province_id": int(selected_province_id) if selected_province_id else None,
    }


def _validate_city_province(city_id, province_id):
    if not province_id or not city_id:
        raise ValidationError("استان و شهر را انتخاب کنید.")
    city = City.objects.select_related("province").filter(pk=city_id, province_id=province_id).first()
    if not city:
        raise ValidationError("شهر انتخاب‌شده متعلق به استان انتخاب‌شده نیست.")
    return city


@login_required
@require_http_methods(["GET", "POST"])
def address_create_view(request):
    if request.method == "POST":
        address = Address(
            user=request.user,
            title=request.POST.get("title", "").strip(),
            phone=request.POST.get("phone", "").strip(),
            description=request.POST.get("description", "").strip(),
            postal_code=request.POST.get("postal_code", "").strip(),
        )
        province_id = request.POST.get("province")
        try:
            address.city = _validate_city_province(request.POST.get("city"), province_id)
            address.full_clean()
        except ValidationError as exc:
            messages.error(request, exc.messages[0] if exc.messages else "اطلاعات آدرس صحیح نیست.")
            return render(request, "users/account/address_form.html", _address_context(address, province_id))

        address.save()
        messages.success(request, "آدرس با موفقیت اضافه شد.")
        return redirect("users:addresses")

    return render(request, "users/account/address_form.html", _address_context())


@login_required
@require_http_methods(["GET", "POST"])
def address_update_view(request, pk):
    address = get_object_or_404(Address, pk=pk, user=request.user)
    if request.method == "POST":
        address.title = request.POST.get("title", "").strip()
        address.phone = request.POST.get("phone", "").strip()
        address.description = request.POST.get("description", "").strip()
        address.postal_code = request.POST.get("postal_code", "").strip()
        province_id = request.POST.get("province")
        try:
            address.city = _validate_city_province(request.POST.get("city"), province_id)
            address.full_clean()
        except ValidationError as exc:
            messages.error(request, exc.messages[0] if exc.messages else "اطلاعات آدرس صحیح نیست.")
            return render(request, "users/account/address_form.html", _address_context(address, province_id))

        address.save()
        messages.success(request, "آدرس با موفقیت ویرایش شد.")
        return redirect("users:addresses")

    return render(request, "users/account/address_form.html", _address_context(address))


@login_required
@require_http_methods(["POST"])
def address_delete_view(request, pk):
    address = get_object_or_404(Address, pk=pk, user=request.user)
    address.delete()
    messages.success(request, "آدرس حذف شد.")
    return redirect("users:addresses")


@login_required
@require_http_methods(["POST"])
def logout_view(request):
    logout(request)
    return redirect("users:login")
