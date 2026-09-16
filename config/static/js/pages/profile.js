document.addEventListener("DOMContentLoaded", () => {
    const input = document.querySelector("[data-jalali-picker]");
    const hidden = document.querySelector("[data-gregorian-input]");
    const picker = document.querySelector("[data-jalali-calendar]");
    if (!input || !hidden || !picker) return;

    const months = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
    const digits = value => String(value).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
    const div = value => Math.floor(value);
    const mod = (a, b) => a - Math.floor(a / b) * b;
    const MIN_AGE = 13;

    const jalaliToGregorian = (jy, jm, jd) => {
        jy += 1595;
        let days = -355668 + 365 * jy + div(jy / 33) * 8 + div(((jy % 33) + 3) / 4) + jd;
        days += jm < 7 ? (jm - 1) * 31 : (jm - 1) * 30 + 6;
        let gy = 400 * div(days / 146097);
        days = mod(days, 146097);
        if (days > 36524) {
            gy += 100 * div(days / 36524);
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
        const md = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let gm = 0;
        let remaining = gd;
        while (remaining > md[gm]) remaining -= md[gm++];
        return new Date(gy, gm, remaining);
    };

    // Force Latin numerals so Number("۱۴۰۵") never becomes NaN.
    const jalaliFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-latn", {
        year: "numeric", month: "numeric", day: "numeric"
    });

    const gregorianToJalali = date => {
        const parts = jalaliFormatter.formatToParts(date);
        return {
            year: Number(parts.find(p => p.type === "year")?.value),
            month: Number(parts.find(p => p.type === "month")?.value),
            day: Number(parts.find(p => p.type === "day")?.value)
        };
    };

    const isoToDate = value => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        const [y, m, d] = value.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
    };

    const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const format = d => d ? `${digits(d.year)}/${digits(String(d.month).padStart(2, "0"))}/${digits(String(d.day).padStart(2, "0"))}` : "";

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minimumBirthDate = new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());
    const todayJ = gregorianToJalali(today);
    const minAllowedJ = gregorianToJalali(minimumBirthDate);
    const minYear = 1200;
    const maxYear = minAllowedJ.year;

    const initial = isoToDate(hidden.value);
    let selected = initial ? gregorianToJalali(initial) : null;
    let view = selected || { year: maxYear, month: minAllowedJ.month, day: minAllowedJ.day };

    const daysInMonth = (year, month) => {
        if (month <= 6) return 31;
        if (month <= 11) return 30;
        const a = jalaliToGregorian(year, 1, 1);
        const b = jalaliToGregorian(year + 1, 1, 1);
        return Math.round((b - a) / 86400000) === 366 ? 30 : 29;
    };

    const isAllowedBirthDate = (year, month, day) => {
        const candidate = jalaliToGregorian(year, month, day);
        return candidate < today && candidate <= minimumBirthDate;
    };

    const close = () => { picker.hidden = true; input.setAttribute("aria-expanded", "false"); };
    const updatePreview = () => {
        const preview = picker.querySelector("[data-preview]");
        if (preview) preview.textContent = selected ? format(selected) : format(view);
    };

    const renderColumn = (column, values, current, formatter, onChange, disabled = () => false) => {
        column.innerHTML = "";
        const spacer = document.createElement("div");
        spacer.className = "date-wheel__spacer";
        column.appendChild(spacer);

        values.forEach(value => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "date-wheel__item";
            item.textContent = formatter(value);
            item.dataset.value = value;
            if (Number(value) === Number(current)) item.classList.add("is-selected");
            if (disabled(value)) {
                item.disabled = true;
                item.classList.add("is-disabled");
            } else {
                item.addEventListener("click", () => onChange(Number(value)));
            }
            column.appendChild(item);
        });

        column.appendChild(spacer.cloneNode(true));
        requestAnimationFrame(() => {
            const item = [...column.querySelectorAll(".date-wheel__item")].find(x => Number(x.dataset.value) === Number(current) && !x.disabled);
            if (item) column.scrollTop = Math.max(0, item.offsetTop - (column.clientHeight - item.offsetHeight) / 2);
        });
    };

    const render = () => {
        picker.innerHTML = `
            <div class="date-wheel__top"><div><span class="date-wheel__eyebrow">تاریخ تولد</span><strong>روز، ماه و سال تولد را انتخاب کنید</strong></div><button type="button" class="date-wheel__close" aria-label="بستن">×</button></div>
            <div class="date-wheel__columns">
                <div class="date-wheel__column-wrap"><span>روز</span><div class="date-wheel__column" data-day></div></div>
                <div class="date-wheel__column-wrap"><span>ماه</span><div class="date-wheel__column" data-month></div></div>
                <div class="date-wheel__column-wrap"><span>سال</span><div class="date-wheel__column date-wheel__year" data-year></div></div>
                <div class="date-wheel__selection"></div>
            </div>
            <div class="date-wheel__bottom"><span data-preview></span><div><button type="button" class="date-wheel__clear">پاک کردن</button><button type="button" class="date-wheel__confirm">تأیید تاریخ</button></div></div>`;

        const day = picker.querySelector("[data-day]");
        const month = picker.querySelector("[data-month]");
        const year = picker.querySelector("[data-year]");

        const rebuildDays = () => {
            const maxDay = daysInMonth(view.year, view.month);
            if (view.day > maxDay) view.day = maxDay;
            renderColumn(day, Array.from({length: maxDay}, (_, i) => i + 1), view.day, digits, value => {
                view.day = value; selected = null; updatePreview();
            }, value => !isAllowedBirthDate(view.year, view.month, value));
        };

        const years = Array.from({length: maxYear - minYear + 1}, (_, i) => maxYear - i);
        renderColumn(year, years, view.year, digits, value => {
            view.year = value; selected = null;
            // When the user moves to a year older than the cutoff, every month/day is available.
            // In the cutoff year, future days inside that Jalali year are disabled.
            rebuildDays(); updatePreview();
        }, value => value > maxYear);

        renderColumn(month, Array.from({length: 12}, (_, i) => i + 1), view.month, value => months[value - 1], value => {
            view.month = value; selected = null; rebuildDays(); updatePreview();
        }, value => {
            if (view.year < maxYear) return false;
            return jalaliToGregorian(view.year, value, 1) > minimumBirthDate;
        });

        rebuildDays();
        updatePreview();

        picker.querySelector(".date-wheel__close").onclick = close;
        picker.querySelector(".date-wheel__clear").onclick = () => { selected = null; hidden.value = ""; input.value = ""; close(); };
        picker.querySelector(".date-wheel__confirm").onclick = () => {
            const chosen = jalaliToGregorian(view.year, view.month, Math.min(view.day, daysInMonth(view.year, view.month)));
            if (!isAllowedBirthDate(view.year, view.month, view.day)) return;
            selected = {year: view.year, month: view.month, day: view.day};
            hidden.value = iso(chosen);
            input.value = format(selected);
            close();
        };
    };

    const open = () => { picker.hidden = false; input.setAttribute("aria-expanded", "true"); render(); };
    if (selected) input.value = format(selected);
    input.addEventListener("click", open);
    input.addEventListener("focus", open);
    input.addEventListener("keydown", e => e.preventDefault());
    input.addEventListener("paste", e => e.preventDefault());
    document.addEventListener("click", e => { if (!input.closest(".jalali-picker-field")?.contains(e.target)) close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
});
