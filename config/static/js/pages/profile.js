document.addEventListener("DOMContentLoaded", () => {
    const input = document.querySelector("[data-jalali-picker]");
    const hidden = document.querySelector("[data-gregorian-input]");
    const picker = document.querySelector("[data-jalali-calendar]");

    if (!input || !hidden || !picker) return;

    const monthNames = [
        "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
        "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"
    ];
    const weekDays = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
    const fa = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        year: "numeric",
        month: "numeric",
        day: "numeric"
    });
    const partsFormatter = new Intl.DateTimeFormat("en-US-u-ca-persian", {
        year: "numeric",
        month: "numeric",
        day: "numeric"
    });

    const toParts = (date) => {
        const parts = partsFormatter.formatToParts(date);
        return {
            year: Number(parts.find((p) => p.type === "year").value),
            month: Number(parts.find((p) => p.type === "month").value),
            day: Number(parts.find((p) => p.type === "day").value),
        };
    };

    const toIso = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    const fromIso = (value) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        const [year, month, day] = value.split("-").map(Number);
        const date = new Date(year, month - 1, day);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
            ? date
            : null;
    };

    const formatJalali = (date) => {
        if (!date) return "";
        return fa.format(date).replace(/\s/g, "").replace(/،/g, "/");
    };

    const persianDigits = (value) => String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const findGregorianForJalali = (year, month, day = 1) => {
        const anchor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const approx = new Date(anchor);
        approx.setDate(approx.getDate() + (year - toParts(anchor).year) * 365 + (month - toParts(anchor).month) * 31);

        for (let offset = -370; offset <= 370; offset += 1) {
            const candidate = new Date(approx);
            candidate.setDate(approx.getDate() + offset);
            const parts = toParts(candidate);
            if (parts.year === year && parts.month === month && parts.day === day) return candidate;
        }
        return null;
    };

    const initialDate = fromIso(hidden.value) || today;
    let selectedDate = fromIso(hidden.value);
    let view = toParts(initialDate);

    const closePicker = () => {
        picker.hidden = true;
        input.setAttribute("aria-expanded", "false");
    };

    const openPicker = () => {
        picker.hidden = false;
        input.setAttribute("aria-expanded", "true");
        render();
    };

    const render = () => {
        const firstDay = findGregorianForJalali(view.year, view.month, 1);
        if (!firstDay) return;

        picker.innerHTML = "";

        const header = document.createElement("div");
        header.className = "jalali-picker__header";
        header.innerHTML = `
            <button type="button" class="jalali-picker__nav" data-prev aria-label="ماه قبل">‹</button>
            <strong>${monthNames[view.month - 1]} ${persianDigits(view.year)}</strong>
            <button type="button" class="jalali-picker__nav" data-next aria-label="ماه بعد">›</button>
        `;
        picker.appendChild(header);

        const weekdays = document.createElement("div");
        weekdays.className = "jalali-picker__weekdays";
        weekDays.forEach((day) => {
            const cell = document.createElement("span");
            cell.textContent = day;
            weekdays.appendChild(cell);
        });
        picker.appendChild(weekdays);

        const grid = document.createElement("div");
        grid.className = "jalali-picker__grid";

        // JS Sunday=0; Persian week starts Saturday.
        const offset = (firstDay.getDay() + 1) % 7;
        for (let i = 0; i < offset; i += 1) {
            grid.appendChild(document.createElement("span"));
        }

        let cursor = new Date(firstDay);
        while (true) {
            const parts = toParts(cursor);
            if (parts.year !== view.year || parts.month !== view.month) break;

            const button = document.createElement("button");
            button.type = "button";
            button.className = "jalali-picker__day";
            button.textContent = persianDigits(parts.day);
            button.dataset.iso = toIso(cursor);

            if (selectedDate && toIso(selectedDate) === button.dataset.iso) {
                button.classList.add("is-selected");
            }

            if (cursor >= today) {
                button.disabled = true;
                button.classList.add("is-disabled");
            }

            button.addEventListener("click", () => {
                selectedDate = new Date(cursor);
                hidden.value = toIso(selectedDate);
                input.value = formatJalali(selectedDate);
                view = toParts(selectedDate);
                closePicker();
            });
            grid.appendChild(button);

            cursor.setDate(cursor.getDate() + 1);
        }

        picker.appendChild(grid);

        const footer = document.createElement("div");
        footer.className = "jalali-picker__footer";
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "jalali-picker__clear";
        clear.textContent = "پاک کردن تاریخ";
        clear.addEventListener("click", () => {
            selectedDate = null;
            hidden.value = "";
            input.value = "";
            closePicker();
        });
        footer.appendChild(clear);
        picker.appendChild(footer);

        picker.querySelector("[data-prev]").addEventListener("click", () => {
            view.month -= 1;
            if (view.month < 1) {
                view.month = 12;
                view.year -= 1;
            }
            render();
        });

        picker.querySelector("[data-next]").addEventListener("click", () => {
            const next = { year: view.year, month: view.month + 1 };
            if (next.month > 12) {
                next.month = 1;
                next.year += 1;
            }
            // Never navigate beyond the current Jalali month.
            const current = toParts(today);
            if (next.year < current.year || (next.year === current.year && next.month <= current.month)) {
                view = next;
                render();
            }
        });
    };

    if (selectedDate) input.value = formatJalali(selectedDate);
    input.addEventListener("click", openPicker);
    input.addEventListener("focus", openPicker);

    document.addEventListener("click", (event) => {
        if (!input.closest(".jalali-picker-field")?.contains(event.target)) closePicker();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closePicker();
    });

    // Keep the input strictly visual; the actual submitted value is Gregorian ISO.
    input.addEventListener("keydown", (event) => event.preventDefault());
    input.addEventListener("paste", (event) => event.preventDefault());

    render();
});
