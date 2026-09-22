(() => {
    const root = document.querySelector(".shop-reference");
    if (!root) return;

    const getPanel = () => root.querySelector("[data-shop-filter-panel]");
    const getToggle = () => root.querySelector("[data-shop-filter-toggle]");
    const getForm = () => root.querySelector("[data-shop-filter-form]");

    const formatPrice = (value) => Number(value || 0).toLocaleString("fa-IR");

    const syncRange = (source) => {
        const minRange = root.querySelector("[data-min-range]");
        const maxRange = root.querySelector("[data-max-range]");
        const minInput = root.querySelector("[data-min-price-input]");
        const maxInput = root.querySelector("[data-max-price-input]");
        const minLabel = root.querySelector("[data-min-price-label]");
        const maxLabel = root.querySelector("[data-max-price-label]");

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
        if (minLabel) minLabel.textContent = formatPrice(min);
        if (maxLabel) maxLabel.textContent = formatPrice(max);
    };

    const syncFilterCount = (url = window.location.href) => {
        const count = root.querySelector("[data-filter-count]");
        if (!count) return;

        const params = new URL(url, window.location.origin).searchParams;
        const activeFilters = ["category", "size", "min_price", "max_price", "discount"]
            .filter((key) => params.get(key));

        count.textContent = String(activeFilters.length);
        count.style.display = activeFilters.length ? "inline-grid" : "none";
    };

    const setLoading = (loading) => {
        root.classList.toggle("is-filter-loading", loading);
        root.setAttribute("aria-busy", loading ? "true" : "false");
    };

    const closeFilters = () => {
        const panel = getPanel();
        const toggle = getToggle();
        if (!panel) return;
        panel.classList.remove("is-open");
        toggle?.setAttribute("aria-expanded", "false");
    };

    const closeSort = () => {
        const dropdown = root.querySelector("[data-sort-dropdown]");
        const trigger = root.querySelector("[data-sort-trigger]");
        dropdown?.classList.remove("is-open");
        trigger?.setAttribute("aria-expanded", "false");
    };

    const fetchCatalog = async (targetUrl, {push = true} = {}) => {
        const url = new URL(targetUrl, window.location.href);
        url.searchParams.delete("page");

        if (root.classList.contains("is-filter-loading")) return;

        setLoading(true);

        try {
            const response = await fetch(url.toString(), {
                method: "GET",
                credentials: "same-origin",
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                    "Accept": "text/html"
                }
            });

            if (!response.ok) throw new Error("Catalog request failed");

            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, "text/html");
            const nextCatalog = doc.querySelector(".shop-reference__catalog");
            const currentCatalog = root.querySelector(".shop-reference__catalog");

            if (!nextCatalog || !currentCatalog) {
                throw new Error("Catalog markup not found");
            }

            currentCatalog.replaceWith(nextCatalog);

            if (push) {
                window.history.pushState({shopCatalog: true}, "", url.toString());
            }

            if (doc.title) document.title = doc.title;
            syncFilterCount(url.toString());
            closeFilters();
            closeSort();

            // Re-initialize card image observers after replacing the product grid.
            window.dispatchEvent(new CustomEvent("shop:catalog-updated"));
        } catch (error) {
            console.error("[BABAEI] Shop filter update failed:", error);
        } finally {
            setLoading(false);
        }
    };

    const buildFilterUrl = (form) => {
        const url = new URL(window.location.href);
        const formData = new FormData(form);

        // Keep category/sort already present in the URL, while replacing
        // only the actual filter fields.
        ["size", "min_price", "max_price", "discount"].forEach((key) => {
            url.searchParams.delete(key);
        });

        for (const [key, value] of formData.entries()) {
            if (value !== "") url.searchParams.set(key, value);
        }

        url.searchParams.delete("page");
        return url;
    };

    root.addEventListener("click", (event) => {
        const filterToggle = event.target.closest("[data-shop-filter-toggle]");
        if (filterToggle) {
            const panel = getPanel();
            if (panel?.classList.contains("is-open")) closeFilters();
            else {
                panel?.classList.add("is-open");
                filterToggle.setAttribute("aria-expanded", "true");
            }
            return;
        }

        if (event.target.closest("[data-shop-filter-close]")) {
            closeFilters();
            return;
        }

        const sortTrigger = event.target.closest("[data-sort-trigger]");
        if (sortTrigger) {
            event.preventDefault();
            event.stopPropagation();
            const dropdown = root.querySelector("[data-sort-dropdown]");
            const open = dropdown?.classList.toggle("is-open");
            sortTrigger.setAttribute("aria-expanded", open ? "true" : "false");
            return;
        }

        const sortOption = event.target.closest("[data-sort-option]");
        if (sortOption) {
            event.preventDefault();
            const value = sortOption.dataset.value;
            if (!value) return;

            const url = new URL(window.location.href);
            url.searchParams.set("sort", value);
            url.searchParams.delete("page");
            fetchCatalog(url);
            return;
        }

        const clearLink = event.target.closest(".shop-reference__clear");
        if (clearLink) {
            event.preventDefault();
            fetchCatalog(clearLink.href);
            return;
        }
    });

    root.addEventListener("submit", (event) => {
        const form = event.target.closest("[data-shop-filter-form]");
        if (!form) return;

        event.preventDefault();
        syncRange();
        fetchCatalog(buildFilterUrl(form));
    });

    root.addEventListener("input", (event) => {
        if (event.target.matches("[data-min-range]")) syncRange("min");
        if (event.target.matches("[data-max-range]")) syncRange("max");
    });

    root.addEventListener("change", (event) => {
        const input = event.target;
        if (!input.matches(".shop-reference__sizes input, .shop-reference__discount-check input")) return;

        if (input.type === "radio") {
            root.querySelectorAll('input[name="' + input.name + '"]').forEach((item) => {
                item.closest("label")?.classList.toggle("is-active", item.checked);
            });
        } else {
            input.closest("label")?.classList.toggle("is-active", input.checked);
        }
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest(".shop-reference__sort-section")) closeSort();
    });

    window.addEventListener("popstate", () => {
        fetchCatalog(window.location.href, {push: false});
    });

    const mobileMedia = window.matchMedia("(max-width: 820px)");
    mobileMedia.addEventListener?.("change", () => {
        if (!mobileMedia.matches) closeFilters();
    });

    syncRange();
    syncFilterCount();
})();
