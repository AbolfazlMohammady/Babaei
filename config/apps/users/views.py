from django.contrib import messages
from django.contrib.auth import get_user_model, login, logout
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from .models import Address, City, OTP

User = get_user_model()


def login_view(request):
    if request.user.is_authenticated:
        return redirect("users:profile")

    if request.method == "POST":
        phone = request.POST.get("phone", "").strip()

        if not phone:
            messages.error(request, "شماره موبایل را وارد کنید.")
            return render(request, "users/auth/login.html")

        otp = OTP.objects.create(
        phone=phone,
        code="123456"
        )

        request.session["otp_phone"] = phone
        request.session["otp_id"] = otp.id

        return redirect("users:verify_otp")

    return render(request, "users/auth/login.html")


def verify_otp_view(request):
    if request.user.is_authenticated:
        return redirect("users:profile")

    phone = request.session.get("otp_phone")
    otp_id = request.session.get("otp_id")

    if not phone or not otp_id:
        return redirect("users:login")

    if request.method == "POST":
        code = request.POST.get("code", "").strip()

        otp = get_object_or_404(OTP, id=otp_id, phone=phone)

        if not otp.is_valid():
            messages.error(request, "کد تأیید منقضی شده است.")
            return redirect("users:login")

        if otp.code != code:
            messages.error(request, "کد تأیید صحیح نیست.")
            return render(request, "users/auth/verify_otp.html", {"phone": phone})

        otp.is_used = True
        otp.save(update_fields=["is_used"])

        user, created = User.objects.get_or_create(
            phone=phone,
            defaults={
                "role": "customer",
            },
        )

        if not user.is_active:
            messages.error(request, "حساب کاربری شما غیرفعال است.")
            return redirect("users:login")

        login(request, user)

        request.session.pop("otp_phone", None)
        request.session.pop("otp_id", None)

        return redirect("users:profile")

    return render(request, "users/auth/verify_otp.html", {"phone": phone})


@login_required
def profile_view(request):
    return render(
        request,
        "users/account/profile.html",
        {"user": request.user},
    )


@login_required
@require_http_methods(["GET", "POST"])
def profile_update_view(request):
    if request.method == "POST":
        user = request.user

        user.first_name = request.POST.get("first_name", "").strip()
        user.last_name = request.POST.get("last_name", "").strip()
        user.email = request.POST.get("email", "").strip() or None
        user.gender = request.POST.get("gender") or None
        user.birth_date = request.POST.get("birth_date") or None

        if "image" in request.FILES:
            user.image = request.FILES["image"]

        user.save()

        messages.success(request, "اطلاعات حساب با موفقیت ذخیره شد.")
        return redirect("users:profile")

    return render(
        request,
        "users/account/profile.html",
        {"user": request.user},
    )


@login_required
def addresses_view(request):
    addresses = request.user.addresses.select_related(
        "city",
        "city__province",
    )

    return render(
        request,
        "users/account/addresses.html",
        {"addresses": addresses},
    )


@login_required
@require_http_methods(["GET", "POST"])
def address_create_view(request):
    if request.method == "POST":
        address = Address(
            user=request.user,
            title=request.POST.get("title", "").strip(),
            phone=request.POST.get("phone", "").strip(),
            description=request.POST.get("description", "").strip(),
            city_id=request.POST.get("city"),
            postal_code=request.POST.get("postal_code", "").strip(),
        )

        address.full_clean()
        address.save()

        messages.success(request, "آدرس با موفقیت اضافه شد.")
        return redirect("users:addresses")

    cities = City.objects.select_related("province").order_by(
        "province__name",
        "name",
    )

    return render(
        request,
        "users/account/address_form.html",
        {"cities": cities},
    )


@login_required
@require_http_methods(["GET", "POST"])
def address_update_view(request, pk):
    address = get_object_or_404(
        Address,
        pk=pk,
        user=request.user,
    )

    if request.method == "POST":
        address.title = request.POST.get("title", "").strip()
        address.phone = request.POST.get("phone", "").strip()
        address.description = request.POST.get("description", "").strip()
        address.city_id = request.POST.get("city")
        address.postal_code = request.POST.get("postal_code", "").strip()

        address.full_clean()
        address.save()

        messages.success(request, "آدرس با موفقیت ویرایش شد.")
        return redirect("users:addresses")

    cities = City.objects.select_related("province").order_by(
        "province__name",
        "name",
    )

    return render(
        request,
        "users/account/address_form.html",
        {
            "address": address,
            "cities": cities,
        },
    )


@login_required
@require_http_methods(["POST"])
def address_delete_view(request, pk):
    address = get_object_or_404(
        Address,
        pk=pk,
        user=request.user,
    )

    address.delete()

    messages.success(request, "آدرس حذف شد.")
    return redirect("users:addresses")


@login_required
@require_http_methods(["POST"])
def logout_view(request):
    logout(request)
    return redirect("users:login")