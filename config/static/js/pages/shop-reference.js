(() => {
    const root = document.querySelector(".shop-reference");
    if (!root) return;

    const panel = root.querySelector("[data-shop-filter-panel]");
    const toggle = root.querySelector("[data-shop-filter-toggle]");
    const close = root.querySelector("[data-shop-filter-close]");
    const form = root.querySelector("[data-shop-filter-form]");
    const count = root.querySelector("[data-filter-count]");
    const products = root.querySelector("[data-shop-products]");
    const sort = root.querySelector("[data-shop-sort]");

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

    const activeFilters = ["category", "color", "size", "min_price", "max_price", "available", "discount"]
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

    sort?.addEventListener("change", () => {
        const next = new URL(window.location.href);
        next.searchParams.set("sort", sort.value);
        next.searchParams.delete("page");
        window.location.assign(next.toString());
    });

    root.querySelectorAll("[data-view]").forEach((button) => {
        button.addEventListener("click", () => {
            const view = button.dataset.view;
            root.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("is-active", item === button));
            products?.classList.toggle("is-list-view", view === "list");
            try { localStorage.setItem("babaei-shop-view", view); } catch (_) {}
        });
    });

    try {
        const savedView = localStorage.getItem("babaei-shop-view");
        if (savedView === "list" && products) {
            products.classList.add("is-list-view");
            root.querySelectorAll("[data-view]").forEach((button) => {
                button.classList.toggle("is-active", button.dataset.view === "list");
            });
        }
    } catch (_) {}

    const mobileMedia = window.matchMedia("(max-width: 820px)");
    const closeOnDesktop = () => {
        if (!mobileMedia.matches) closeFilters();
    };
    mobileMedia.addEventListener?.("change", closeOnDesktop);

    form?.addEventListener("submit", () => {
        syncRange();
    });
})();