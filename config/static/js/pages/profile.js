document.addEventListener("DOMContentLoaded", () => {
    const input = document.querySelector("[data-jalali-picker]");
    const hidden = document.querySelector("[data-gregorian-input]");
    const picker = document.querySelector("[data-jalali-calendar]");

    if (!input || !hidden || !picker) return;

    const months = [
        "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
        "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"
    ];
    const persianDigits = (value) => String(value).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);

    // Jalaali <-> Gregorian conversion, kept local so the picker has no external dependency.
    const div = (a, b) => Math.floor(a / b);
    const mod = (a, b) => a - Math.floor(a / b) * b;

    const jalaliToGregorian = (jy, jm, jd) => {
        jy += 1595;
        let days = -355668 + (365 * jy) + div(jy / 33) * 8 + div(((jy % 33) + 3) / 4) + jd;
        if (jm < 7) days += (jm - 1) * 31;
        else days += ((jm - 1) * 30) + 6;
        let gy = 400 * div(days / 146097);
        days = mod(days, 146097);
        if (days > 36524) {
            gy += 100 * div(--days / 36524);
            days = mod(days, 36524);
            if (days >= 365) days++;
        }
        gy += 4 * div(days / 1461);
        days = mod(days, 1461);
        if (days > 365) {
            gy += div((days - 1) / 365);
            days = (days - 1) % 365;
        }
        const gd = days + 1;
        const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
        const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let gm = 0;
        let remaining = gd;
        while (gm < 12 && remaining > monthDays[gm]) {
            remaining -= monthDays[gm++];
        }
        return new Date(gy, gm, remaining);
    };

    const gregorianToJalali = (date) => {
        let gy = date.getFullYear() - 1600;
        let gm = date.getMonth();
        let gd = date.getDate() - 1;
        const gdm = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let days = 365 * gy + div((gy + 3) / 4) - div((gy + 99) / 100) + div((gy + 399) / 400);
        for (let i = 0; i < gm; i++) days += gdm[i];
        if (gm > 1 && ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0)) days++;
        days += gd;
        let jy = -1597 + 33 * div(days / 12053);
        days %= 12053;
        jy += 4 * div(days / 1461);
        days %= 1461;
        if (days > 365) {
            jy += div((days - 1) / 365);
            days = (days - 1) % 365;
        }
        const jm = days < 186 ? 1 + div(days / 31) : 7 + div((days - 186) / 30);
        const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
        return { year: jy, month: jm, day: jd };
    };

    const toIso = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    const fromIso = (value) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        const [y, m, d] = value.split("-").map(Number);
        return new Date(y, m - 1, d);
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayJ = gregorianToJalali(today);
    const minYear = 1200;
    const maxYear = todayJ.year;

    const initialDate = fromIso(hidden.value);
    let selected = initialDate ? gregorianToJalali(initialDate) : null;
    let view = selected || { year: Math.max(1370, maxYear - 30), month: 1, day: 1 };

    const daysInMonth = (year, month) => {
        if (month <= 6) return 31;
        if (month <= 11) return 30;
        // Last month is 29 days in ordinary years and 30 in leap years.
        const next = jalaliToGregorian(year + 1, 1, 1);
        const current = jalaliToGregorian(year, 1, 1);
        const yearLength = Math.round((next - current) / 86400000);
        return yearLength === 366 ? 30 : 29;
    };

    const format = (date) => date ? `${persianDigits(date.year)}/${persianDigits(String(date.month).padStart(2, "0"))}/${persianDigits(String(date.day).padStart(2, "0"))}` : "";

    const scrollColumn = (column, values, selectedValue, formatter, onChange) => {
        column.innerHTML = "";
        const spacer = document.createElement("div");
        spacer.className = "date-wheel__spacer";
        column.appendChild(spacer.cloneNode(true));
        values.forEach(value => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "date-wheel__item";
            if (value === selectedValue) item.classList.add("is-selected");
            item.textContent = formatter(value);
            item.dataset.value = value;
            item.addEventListener("click", () => onChange(value));
            column.appendChild(item);
        });
        column.appendChild(spacer.cloneNode(true));

        requestAnimationFrame(() => {
            const selectedEl = column.querySelector(".is-selected");
            if (selectedEl) column.scrollTop = selectedEl.offsetTop - column.clientHeight / 2 + selectedEl.offsetHeight / 2;
        });

        let timer;
        column.addEventListener("scroll", () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const center = column.getBoundingClientRect().top + column.clientHeight / 2;
                const items = [...column.querySelectorAll(".date-wheel__item")];
                let closest = null;
                let distance = Infinity;
                items.forEach(item => {
                    const rect = item.getBoundingClientRect();
                    const d = Math.abs(rect.top + rect.height / 2 - center);
                    if (d < distance) { distance = d; closest = item; }
                });
                if (closest) onChange(Number(closest.dataset.value), true);
            }, 90);
        }, { passive: true });
    };

    const render = () => {
        picker.innerHTML = `
            <div class="date-wheel__top">
                <div>
                    <span class="date-wheel__eyebrow">تاریخ تولد</span>
                    <strong>روز، ماه و سال تولد را انتخاب کنید</strong>
                </div>
                <button type="button" class="date-wheel__close" aria-label="بستن">×</button>
            </div>
            <div class="date-wheel__columns">
                <div class="date-wheel__column-wrap"><span>روز</span><div class="date-wheel__column" data-day></div></div>
                <div class="date-wheel__column-wrap"><span>ماه</span><div class="date-wheel__column" data-month></div></div>
                <div class="date-wheel__column-wrap"><span>سال</span><div class="date-wheel__column" data-year></div></div>
                <div class="date-wheel__selection" aria-hidden="true"></div>
            </div>
            <div class="date-wheel__bottom">
                <span data-preview>تاریخ انتخاب نشده</span>
                <div>
                    <button type="button" class="date-wheel__clear">پاک کردن</button>
                    <button type="button" class="date-wheel__confirm">تأیید تاریخ</button>
                </div>
            </div>
        `;

        const dayCol = picker.querySelector("[data-day]");
        const monthCol = picker.querySelector("[data-month]");
        const yearCol = picker.querySelector("[data-year]");
        const preview = picker.querySelector("[data-preview]");

        const updatePreview = () => preview.textContent = selected ? format(selected) : `${persianDigits(view.year)}/${persianDigits(view.month)}/${persianDigits(view.day)}`;
        const rebuildDay = (scroll = false) => {
            const maxDay = daysInMonth(view.year, view.month);
            if (view.day > maxDay) view.day = maxDay;
            scrollColumn(dayCol, Array.from({length: maxDay}, (_, i) => i + 1), view.day, persianDigits, value => {
                view.day = value;
                if (!scroll) selected = null;
                updatePreview();
            });
        };
        scrollColumn(yearCol, Array.from({length: maxYear - minYear + 1}, (_, i) => maxYear - i), view.year, persianDigits, value => {
            view.year = value;
            selected = null;
            rebuildDay(true);
            updatePreview();
        });
        scrollColumn(monthCol, Array.from({length: 12}, (_, i) => i + 1), view.month, value => months[value - 1], value => {
            view.month = value;
            selected = null;
            rebuildDay(true);
            updatePreview();
        });
        rebuildDay(true);
        updatePreview();

        picker.querySelector(".date-wheel__close").addEventListener("click", closePicker);
        picker.querySelector(".date-wheel__clear").addEventListener("click", () => {
            selected = null;
            hidden.value = "";
            input.value = "";
            closePicker();
        });
        picker.querySelector(".date-wheel__confirm").addEventListener("click", () => {
            const chosen = jalaliToGregorian(view.year, view.month, Math.min(view.day, daysInMonth(view.year, view.month)));
            if (chosen >= today) return;
            selected = { year: view.year, month: view.month, day: view.day };
            hidden.value = toIso(chosen);
            input.value = format(selected);
            closePicker();
        });
    };

    const closePicker = () => {
        picker.hidden = true;
        input.setAttribute("aria-expanded", "false");
    };
    const openPicker = () => {
        picker.hidden = false;
        input.setAttribute("aria-expanded", "true");
        render();
    };

    if (selected) input.value = format(selected);
    input.addEventListener("click", openPicker);
    input.addEventListener("focus", openPicker);
    input.addEventListener("keydown", e => e.preventDefault());
    input.addEventListener("paste", e => e.preventDefault());
    document.addEventListener("click", e => {
        if (!input.closest(".jalali-picker-field")?.contains(e.target)) closePicker();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closePicker(); });
});
