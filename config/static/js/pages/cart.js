(() => {
    const root = document.querySelector("[data-cart-page]");
    if (!root) return;

    const formatPrice = (value) => new Intl.NumberFormat("fa-IR").format(Number(value || 0));
    const csrfToken = root.querySelector("input[name=csrfmiddlewaretoken]")?.value;
    const summaryCount = root.querySelector("[data-cart-count]");
    const headingCount = root.querySelector("[data-cart-heading-count]");
    const subtotalEls = [...root.querySelectorAll("[data-cart-subtotal]")];
    const summary = root.querySelector("[data-cart-summary]");
    const empty = root.querySelector("[data-cart-empty]");

    const setTotals = (count, subtotal) => {
        if (summaryCount) summaryCount.textContent = `${formatPrice(count)} کالا`;
        if (headingCount) headingCount.textContent = formatPrice(count);
        subtotalEls.forEach((el) => { el.textContent = `${formatPrice(subtotal)} تومان`; });
    };

    const request = async (form) => {
        const response = await fetch(form.action, {
            method: "POST",
            headers: {
                "X-Requested-With": "XMLHttpRequest",
                "Accept": "application/json",
                ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
            },
            body: new FormData(form),
            credentials: "same-origin",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.message || "به‌روزرسانی سبد خرید انجام نشد.");
        return data;
    };

    const showMessage = (message, isError = false) => {
        const toast = document.createElement("div");
        toast.className = `cart-toast${isError ? " cart-toast--error" : ""}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add("is-visible"));
        setTimeout(() => {
            toast.classList.remove("is-visible");
            setTimeout(() => toast.remove(), 180);
        }, 2200);
    };

    const updateItem = (item, data) => {
        const quantity = item.querySelector("[data-quantity-value]");
        const lineTotal = item.querySelector("[data-line-total]");
        const minus = item.querySelector("[data-quantity-minus]");
        const plus = item.querySelector("[data-quantity-plus]");
        const max = Number(item.dataset.stock || 0);

        if (quantity) {
            quantity.textContent = formatPrice(data.quantity);
            quantity.dataset.value = String(data.quantity);
        }
        if (lineTotal) lineTotal.textContent = `${formatPrice(data.line_total)} تومان`;
        if (minus) minus.disabled = data.quantity <= 1;
        if (plus && max > 0) plus.disabled = data.quantity >= max;
    };

    root.addEventListener("submit", async (event) => {
        const form = event.target.closest("form[data-cart-action]");
        if (!form) return;
        event.preventDefault();

        const buttons = [...form.querySelectorAll("button")];
        buttons.forEach((button) => { button.disabled = true; });

        try {
            const data = await request(form);
            const item = form.closest("[data-cart-item]");

            if (form.dataset.cartAction === "update" && item) updateItem(item, data);
            if (form.dataset.cartAction === "remove" && item) {
                item.classList.add("is-removing");
                setTimeout(() => item.remove(), 180);
            }
            if (form.dataset.cartAction === "clear") root.querySelectorAll("[data-cart-item]").forEach((el) => el.remove());

            setTotals(data.count, data.subtotal);
            if (Number(data.count) === 0) {
                if (summary) summary.hidden = true;
                if (empty) empty.hidden = false;
                root.classList.add("is-empty");
            }
            showMessage(data.message || "سبد خرید بروزرسانی شد.");
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            buttons.forEach((button) => { button.disabled = false; });
            const item = form.closest("[data-cart-item]");
            if (item && form.dataset.cartAction === "update") {
                const quantity = Number(item.querySelector("[data-quantity-value]")?.dataset.value || 1);
                const minus = item.querySelector("[data-quantity-minus]");
                const plus = item.querySelector("[data-quantity-plus]");
                const max = Number(item.dataset.stock || 0);
                if (minus) minus.disabled = quantity <= 1;
                if (plus && max > 0) plus.disabled = quantity >= max;
            }
        }
    });

    root.addEventListener("click", (event) => {
        const button = event.target.closest("[data-quantity-button]");
        if (!button || button.disabled) return;

        const form = button.closest("form[data-cart-action=update]");
        const item = button.closest("[data-cart-item]");
        if (!form || !item) return;

        event.preventDefault();
        const quantityEl = item.querySelector("[data-quantity-value]");
        const current = Number(quantityEl?.dataset.value || 1);
        const next = current + Number(button.dataset.quantityButton);
        const max = Number(item.dataset.stock || 0);
        if (next < 1 || (max > 0 && next > max)) return;

        form.querySelector("input[name=quantity]").value = next;
        form.requestSubmit();
    });
})();
