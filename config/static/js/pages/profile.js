document.addEventListener("DOMContentLoaded", () => {
    const input = document.querySelector("[data-jalali-picker]");
    const hidden = document.querySelector("[data-gregorian-input]");
    const picker = document.querySelector("[data-jalali-calendar]");
    if (!input || !hidden || !picker) return;

    const months = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
    const digits = value => String(value).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
    const div = (a, b) => Math.floor(a / b);
    const mod = (a, b) => a - Math.floor(a / b) * b;

    const jalaliToGregorian = (jy, jm, jd) => {
        jy += 1595;
        let days = -355668 + 365 * jy + div(jy / 33) * 8 + div(((jy % 33) + 3) / 4) + jd;
        days += jm < 7 ? (jm - 1) * 31 : (jm - 1) * 30 + 6;
        let gy = 400 * div(days / 146097);
        days = mod(days, 146097);
        if (days > 36524) { gy += 100 * div(--days / 36524); days = mod(days, 36524); if (days >= 365) days++; }
        gy += 4 * div(days / 1461);
        days = mod(days, 1461);
        if (days > 365) { gy += div((days - 1) / 365); days = (days - 1) % 365; }
        const gd = days + 1;
        const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
        const md = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let gm = 0, remaining = gd;
        while (remaining > md[gm]) remaining -= md[gm++];
        return new Date(gy, gm, remaining);
    };

    const gregorianToJalali = date => {
        let gy = date.getFullYear() - 1600, gm = date.getMonth(), gd = date.getDate() - 1;
        const gdm = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let days = 365 * gy + div((gy + 3) / 4) - div((gy + 99) / 100) + div((gy + 399) / 400);
        for (let i = 0; i < gm; i++) days += gdm[i];
        if (gm > 1 && ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0)) days++;
        days += gd;
        let jy = -1597 + 33 * div(days / 12053);
        days %= 12053; jy += 4 * div(days / 1461); days %= 1461;
        if (days > 365) { jy += div((days - 1) / 365); days = (days - 1) % 365; }
        return { year: jy, month: days < 186 ? 1 + div(days / 31) : 7 + div((days - 186) / 30), day: 1 + (days < 186 ? days % 31 : (days - 186) % 30) };
    };

    const isoToDate = value => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        const [y, m, d] = value.split("-").map(Number);
        return new Date(y, m - 1, d);
    };
    const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const format = d => d ? `${digits(d.year)}/${digits(String(d.month).padStart(2, "0"))}/${digits(String(d.day).padStart(2, "0"))}` : "";

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayJ = gregorianToJalali(today);
    const minYear = 1200, maxYear = todayJ.year - 1; // birth year must be before current Jalali year
    const initial = isoToDate(hidden.value);
    let selected = initial ? gregorianToJalali(initial) : null;
    let view = selected || { year: Math.max(1370, maxYear - 25), month: 1, day: 1 };

    const daysInMonth = (year, month) => {
        if (month <= 6) return 31;
        if (month <= 11) return 30;
        const a = jalaliToGregorian(year, 1, 1), b = jalaliToGregorian(year + 1, 1, 1);
        return Math.round((b - a) / 86400000) === 366 ? 30 : 29;
    };

    const close = () => { picker.hidden = true; input.setAttribute("aria-expanded", "false"); };
    const updatePreview = () => {
        const p = picker.querySelector("[data-preview]");
        if (p) p.textContent = selected ? format(selected) : format(view);
    };

    const renderColumn = (column, values, current, formatter, onChange) => {
        column.innerHTML = "";
        const top = document.createElement("div"); top.className = "date-wheel__spacer";
        column.appendChild(top);
        values.forEach(value => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "date-wheel__item";
            item.textContent = formatter(value);
            item.dataset.value = value;
            if (Number(value) === Number(current)) item.classList.add("is-selected");
            item.addEventListener("click", () => onChange(Number(value)));
            column.appendChild(item);
        });
        column.appendChild(top.cloneNode(true));
        requestAnimationFrame(() => {
            const item = [...column.querySelectorAll(".date-wheel__item")].find(x => Number(x.dataset.value) === Number(current));
            if (item) column.scrollTop = item.offsetTop - (column.clientHeight - item.offsetHeight) / 2;
        });
    };

    const render = () => {
        picker.innerHTML = `
            <div class="date-wheel__top">
                <div><span class="date-wheel__eyebrow">تاریخ تولد</span><strong>روز، ماه و سال تولد را انتخاب کنید</strong></div>
                <button type="button" class="date-wheel__close" aria-label="بستن">×</button>
            </div>
            <div class="date-wheel__columns">
                <div class="date-wheel__column-wrap"><span>روز</span><div class="date-wheel__column" data-day></div></div>
                <div class="date-wheel__column-wrap"><span>ماه</span><div class="date-wheel__column" data-month></div></div>
                <div class="date-wheel__column-wrap"><span>سال</span><div class="date-wheel__column date-wheel__year" data-year></div></div>
                <div class="date-wheel__selection"></div>
            </div>
            <div class="date-wheel__bottom"><span data-preview></span><div><button type="button" class="date-wheel__clear">پاک کردن</button><button type="button" class="date-wheel__confirm">تأیید تاریخ</button></div></div>`;

        const day = picker.querySelector("[data-day]"), month = picker.querySelector("[data-month]"), year = picker.querySelector("[data-year]");
        const rebuildDays = () => {
            const maxDay = daysInMonth(view.year, view.month);
            if (view.day > maxDay) view.day = maxDay;
            renderColumn(day, Array.from({length: maxDay}, (_, i) => i + 1), view.day, digits, v => { view.day = v; selected = null; updatePreview(); });
        };
        renderColumn(year, Array.from({length: maxYear - minYear + 1}, (_, i) => maxYear - i), view.year, digits, v => { view.year = v; selected = null; rebuildDays(); updatePreview(); });
        renderColumn(month, Array.from({length: 12}, (_, i) => i + 1), view.month, v => months[v - 1], v => { view.month = v; selected = null; rebuildDays(); updatePreview(); });
        rebuildDays(); updatePreview();

        picker.querySelector(".date-wheel__close").onclick = close;
        picker.querySelector(".date-wheel__clear").onclick = () => { selected = null; hidden.value = ""; input.value = ""; close(); };
        picker.querySelector(".date-wheel__confirm").onclick = () => {
            const chosen = jalaliToGregorian(view.year, view.month, Math.min(view.day, daysInMonth(view.year, view.month)));
            if (chosen >= today) return;
            selected = {year: view.year, month: view.month, day: view.day};
            hidden.value = iso(chosen); input.value = format(selected); close();
        };
    };

    const open = () => { picker.hidden = false; input.setAttribute("aria-expanded", "true"); render(); };
    if (selected) input.value = format(selected);
    input.addEventListener("click", open);
    input.addEventListener("focus", open);
    input.addEventListener("keydown", e => e.preventDefault());
    document.addEventListener("click", e => { if (!input.closest(".jalali-picker-field")?.contains(e.target)) close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
});
