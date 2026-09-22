(() => {
    const root = document.querySelector(".shop-reference");
    if (!root) return;

    const panel = root.querySelector("[data-shop-filter-panel]");
    const toggle = root.querySelector("[data-shop-filter-toggle]");
    const close = root.querySelector("[data-shop-filter-close]");
    const form = root.querySelector("[data-shop-filter-form]");
    const count = root.querySelector("[data-filter-count]");
    const products = root.querySelector("[data-shop-products]");
    const params = new URLSearchParams(window.location.search);

    const openFilters = () => {
        if (!panel) return;
        panel.classList.add("is-open");
        toggle?.setAttribute("aria-expanded", "true");
    };
    const closeFilters = () => {
        if (!panel) return;
        panel.classList.remove("is-open");
        toggle?.setAttribute("aria-expanded", "false");
    };

    toggle?.addEventListener("click", () => {
        if (panel?.classList.contains("is-open")) closeFilters();
        else openFilters();
    });
    close?.addEventListener("click", closeFilters);

    const activeFilters = ["category", "size", "min_price", "max_price", "discount"]
        .filter((key) => params.get(key));
    if (count) {
        if (activeFilters.length) {
            count.textContent = String(activeFilters.length);
            count.style.display = "inline-grid";
        } else {
            count.style.display = "none";
        }
    }

    const minRange = root.querySelector("[data-min-range]");
    const maxRange = root.querySelector("[data-max-range]");
    const minInput = root.querySelector("[data-min-price-input]");
    const maxInput = root.querySelector("[data-max-price-input]");
    const minLabel = root.querySelector("[data-min-price-label]");
    const maxLabel = root.querySelector("[data-max-price-label]");

    const formatPrice = (value) => Number(value || 0).toLocaleString("fa-IR");
    const syncRange = (source) => {
        if (!minRange || !maxRange) return;
        let min = Number(minRange.value);
        let max = Number(maxRange.value);
        if (min > max) {
            if (source === "min") max = min;
            else min = max;
            minRange.value = String(min);
            maxRange.value = String(max);
        }
        if (minInput) minInput.value = min > 0 ? String(min) : "";
        if (maxInput) maxInput.value = max < 5000000 ? String(max) : "";
        if (minLabel) minLabel.textContent = formatPrice(min) + " تومان";
        if (maxLabel) maxLabel.textContent = formatPrice(max) + " تومان";
    };
    minRange?.addEventListener("input", () => syncRange("min"));
    maxRange?.addEventListener("input", () => syncRange("max"));
    if (minRange && maxRange) syncRange();

    // Keep radio/chip states visually synchronized with the actual form values.
    root.querySelectorAll(".shop-reference__sort-options label, .shop-reference__sizes label, .shop-reference__discount-check").forEach((label) => {
        const input = label.querySelector("input");
        if (!input) return;
        const sync = () => {
            if (input.type === "radio") {
                const group = root.querySelectorAll('input[name="' + input.name + '"]');
                group.forEach((item) => item.closest("label")?.classList.toggle("is-active", item.checked));
            } else {
                label.classList.toggle("is-active", input.checked);
            }
        };
        input.addEventListener("change", sync);
        if (input.closest(".shop-reference__sort-options")) {
            input.addEventListener("change", () => {
                const url = new URL(window.location.href);
                url.searchParams.set("sort", input.value);
                url.searchParams.delete("page");
                window.location.assign(url.toString());
            });
        }
        sync();
    });

    // Grid is always the initial catalog view, matching the reference design.
    // The list toggle remains available for the current session only.
    const mobileMedia = window.matchMedia("(max-width: 820px)");
    const closeOnDesktop = () => {
        if (!mobileMedia.matches) closeFilters();
    };
    mobileMedia.addEventListener?.("change", closeOnDesktop);

    form?.addEventListener("submit", () => {
        syncRange();
    });
})();