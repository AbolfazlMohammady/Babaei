(() => {
    "use strict";
    const root = document.getElementById("customizer");
    if (!root) return;
    let data = {};
    try { data = JSON.parse(document.getElementById("designer-data")?.textContent || "{}"); } catch { return; }

    const variants = data.variants || [];
    const views = data.views || [];
    const select = document.getElementById("variant-select");
    const rotation = document.getElementById("designer-3d-rotation");
    const colorHosts = [document.getElementById("variant-color-list"), document.getElementById("variant-color-list-right")].filter(Boolean);
    const sizeHost = document.getElementById("premium-size-list");
    const viewHost = document.getElementById("view-switcher-mobile");
    const esc = value => String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

    function chooseVariant(variant) {
        if (!variant) return;
        if (select) {
            select.value = String(variant.id);
            select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        colorHosts.forEach(host => host.querySelectorAll("button").forEach(button => {
            button.classList.toggle("is-active", button.dataset.color === variant.color);
        }));
        if (sizeHost) sizeHost.querySelectorAll("button").forEach(button => {
            button.classList.toggle("is-active", button.dataset.size === variant.size);
        });
    }

    function renderColors() {
        const seen = new Set();
        const colors = variants.filter(item => {
            if (seen.has(item.color)) return false;
            seen.add(item.color);
            return true;
        });
        colorHosts.forEach(host => {
            host.innerHTML = colors.map(item => `<button type="button" class="premium-color-button" style="--swatch:${item.hex || "#fff"}" data-color="${esc(item.color)}" title="${esc(item.color)}" aria-label="${esc(item.color)}"></button>`).join("");
            host.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
                const variant = variants.find(item => item.color === button.dataset.color && Number(item.stock) > 0) || variants.find(item => item.color === button.dataset.color);
                chooseVariant(variant);
            }));
        });
    }

    function renderSizes() {
        if (!sizeHost) return;
        const seen = new Set();
        const sizes = variants.filter(item => {
            if (seen.has(item.size)) return false;
            seen.add(item.size);
            return true;
        });
        sizeHost.innerHTML = sizes.map(item => `<button type="button" class="premium-size-button ${Number(item.stock) <= 0 ? "is-disabled" : ""}" data-size="${esc(item.size)}">${esc(item.size)}</button>`).join("");
        sizeHost.querySelectorAll("button:not(.is-disabled)").forEach(button => button.addEventListener("click", () => {
            const color = select ? variants.find(item => String(item.id) === String(select.value))?.color : null;
            const variant = variants.find(item => item.size === button.dataset.size && item.color === color && Number(item.stock) > 0)
                || variants.find(item => item.size === button.dataset.size && Number(item.stock) > 0);
            chooseVariant(variant);
        }));
    }

    function renderViews() {
        if (!viewHost) return;
        const fallback = [
            { name: "جلو", angle: 0 }, { name: "پشت", angle: 180 }, { name: "چپ", angle: -90 }, { name: "راست", angle: 90 },
        ];
        const source = views.length ? views.slice(0, 5) : fallback;
        viewHost.innerHTML = source.map((view, index) => {
            const angle = view.angle != null ? Number(view.angle) : fallback[index]?.angle || 0;
            const image = view.background ? `<img src="${esc(view.background)}" alt="">` : `<span>${esc(view.name || fallback[index]?.name || "نما")}</span>`;
            return `<button type="button" class="studio-view-card ${index === 0 ? "is-active" : ""}" data-angle="${angle}">${image}<b>${esc(view.name || fallback[index]?.name || "نما")}</b></button>`;
        }).join("");
        viewHost.querySelectorAll(".studio-view-card").forEach(button => button.addEventListener("click", () => {
            viewHost.querySelectorAll(".studio-view-card").forEach(item => item.classList.toggle("is-active", item === button));
            if (rotation) {
                const angle = Number(button.dataset.angle || 0);
                rotation.value = String(Math.max(-180, Math.min(180, angle)));
                rotation.dispatchEvent(new Event("input", { bubbles: true }));
            }
        }));
    }

    renderColors();
    renderSizes();
    renderViews();

    /* Fullscreen studio drawers: the 3D garment always stays underneath. */
    const workspace = document.querySelector(".customizer-workspace--premium");
    const leftDrawer = document.querySelector(".customizer-panel--premium-left");
    const rightDrawer = document.querySelector(".customizer-panel--premium-right");
    const leftToggle = document.getElementById("studio-drawer-left-toggle");
    const rightToggle = document.getElementById("studio-drawer-right-toggle");

    function setDrawer(side, open) {
        const drawer = side === "left" ? leftDrawer : rightDrawer;
        const toggle = side === "left" ? leftToggle : rightToggle;
        if (!workspace || !drawer || !toggle) return;

        // On phones the controls behave like bottom sheets: only one sheet is
        // allowed to occupy the lower part of the viewport at a time.
        if (open && window.matchMedia("(max-width: 820px)").matches) {
            const other = side === "left" ? "right" : "left";
            const otherDrawer = other === "left" ? leftDrawer : rightDrawer;
            const otherToggle = other === "left" ? leftToggle : rightToggle;
            otherDrawer?.classList.add("is-drawer-closed");
            workspace.classList.add(other === "left" ? "left-drawer-closed" : "right-drawer-closed");
            otherToggle?.setAttribute("aria-expanded", "false");
        }

        drawer.classList.toggle("is-drawer-closed", !open);
        workspace.classList.toggle(side === "left" ? "left-drawer-closed" : "right-drawer-closed", !open);
        toggle.setAttribute("aria-expanded", String(open));
        const anyOpen = !leftDrawer?.classList.contains("is-drawer-closed") || !rightDrawer?.classList.contains("is-drawer-closed");
        const mobileOpen = anyOpen && window.matchMedia("(max-width: 820px)").matches;
        workspace.classList.toggle("mobile-drawer-open", mobileOpen);
        document.dispatchEvent(new CustomEvent("babaei:drawer-state", {
            detail: { open: mobileOpen, side, drawerOpen: open }
        }));
        toggle.setAttribute("aria-label", open
            ? (side === "left" ? "بستن ابزار طراحی" : "بستن تنظیمات محصول")
            : (side === "left" ? "باز کردن ابزار طراحی" : "باز کردن تنظیمات محصول"));
    }

    // Start with the model unobstructed. The template also carries the closed
    // classes so there is never a flash of two full panels over the 3D model.
    setDrawer("left", false);
    setDrawer("right", false);

    leftToggle?.addEventListener("click", () => {
        const open = leftDrawer?.classList.contains("is-drawer-closed");
        setDrawer("left", open);
    });
    rightToggle?.addEventListener("click", () => {
        const open = rightDrawer?.classList.contains("is-drawer-closed");
        setDrawer("right", open);
    });

    document.querySelectorAll("[data-drawer-close]").forEach(button => {
        button.addEventListener("click", () => {
            setDrawer(button.dataset.drawerClose, false);
        });
    });

    document.getElementById("studio-drawer-backdrop")?.addEventListener("click", () => {
        setDrawer("left", false);
        setDrawer("right", false);
    });

    document.getElementById("label-library-trigger")?.addEventListener("click", () => {
        setDrawer("right", true);
    });

    // When a label is added, switch the user directly to its transform controls.
    document.addEventListener("babaei:label-added", () => {
        setDrawer("right", false);
        setDrawer("left", true);
    });

    const mobileToolbar = document.getElementById("mobile-customizer-toolbar");
    const mobileTextSheet = document.getElementById("mobile-text-sheet");
    const mobileTextInput = document.getElementById("mobile-text-input");

    function closeMobileText() {
        if (mobileTextSheet) mobileTextSheet.hidden = true;
    }

    document.querySelectorAll("[data-mobile-action]").forEach(button => {
        button.addEventListener("click", () => {
            const action = button.dataset.mobileAction;
            if (action === "product") setDrawer("right", true);
            if (action === "artwork") {
                setDrawer("right", true);
                setTimeout(() => document.getElementById("label-library-trigger")?.click(), 30);
            }
            if (action === "tools") setDrawer("left", true);
            if (action === "text") {
                closeMobileText();
                if (mobileTextSheet) mobileTextSheet.hidden = false;
                mobileTextInput?.focus();
            }
            if (action === "save") document.getElementById("save-design")?.click();
        });
    });

    document.getElementById("mobile-text-close")?.addEventListener("click", closeMobileText);
    document.getElementById("mobile-text-add")?.addEventListener("click", () => {
        const value = mobileTextInput?.value?.trim();
        if (!value) return mobileTextInput?.focus();
        document.dispatchEvent(new CustomEvent("babaei:add-text", { detail: { text: value } }));
        mobileTextInput.value = "";
        closeMobileText();
    });

    document.addEventListener("babaei:drawer-state", event => {
        mobileToolbar?.classList.toggle("is-hidden", Boolean(event.detail?.open));
    });

    window.BabaeiStudioDrawers = {
        open: side => setDrawer(side, true),
        close: side => setDrawer(side, false),
        toggle: side => {
            const drawer = side === "left" ? leftDrawer : rightDrawer;
            setDrawer(side, drawer?.classList.contains("is-drawer-closed"));
        },
    };


    const current = variants.find(item => String(item.id) === String(select?.value)) || variants.find(item => Number(item.stock) > 0) || variants[0];
    if (current) chooseVariant(current);
})();