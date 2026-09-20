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
    const compactMedia = window.matchMedia("(max-width: 1023px)");
    const mobileMedia = window.matchMedia("(max-width: 600px)");

    function setDrawer(side, open) {
        const drawer = side === "left" ? leftDrawer : rightDrawer;
        const toggle = side === "left" ? leftToggle : rightToggle;
        if (!workspace || !drawer || !toggle) return;

        // On phones the controls behave like bottom sheets: only one sheet is
        // allowed to occupy the lower part of the viewport at a time.
        if (open && compactMedia.matches) {
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
        const mobileOpen = anyOpen && compactMedia.matches;
        workspace.classList.toggle("mobile-drawer-open", mobileOpen);
        document.dispatchEvent(new CustomEvent("babaei:drawer-state", { detail: { open: mobileOpen, side, drawerOpen: open } }));
        toggle.setAttribute("aria-label", open
            ? (side === "left" ? "بستن ابزار طراحی" : "بستن تنظیمات محصول")
            : (side === "left" ? "باز کردن ابزار طراحی" : "باز کردن تنظیمات محصول"));
    }

    let selectedMobile = false;
    let editingMobile = false;

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

    // After choosing a label, close both sheets and keep the contextual
    // controls in the bottom action area. The 3D model remains unobstructed.
    document.addEventListener("babaei:label-added", () => {
        setDrawer("right", false);
        setDrawer("left", false);
    });

    const mobileToolbar = document.getElementById("mobile-customizer-toolbar");
    const mobileSelectionToolbar = document.getElementById("mobile-selection-toolbar");
    const mobileContextToolbar = document.getElementById("mobile-context-toolbar");
    const mobileTextSheet = document.getElementById("mobile-text-sheet");
    const mobileTextInput = document.getElementById("mobile-text-input");
    const mobileColorSheet = document.getElementById("mobile-color-sheet");
    const mobileColorSheetMode = document.getElementById("mobile-color-sheet-mode");
    const mobileColorSheetTitle = document.getElementById("mobile-color-sheet-title");
    const mobileLayerOpacity = document.getElementById("mobile-layer-opacity");
    const mobileLayerOpacityValue = document.getElementById("mobile-layer-opacity-value");
    const mobileLayerColorCustom = document.getElementById("mobile-layer-color-custom");

    function closeMobileText() {
        if (mobileTextSheet) mobileTextSheet.hidden = true;
        const drawerOpen = !leftDrawer?.classList.contains("is-drawer-closed") ||
            !rightDrawer?.classList.contains("is-drawer-closed");
        if (!drawerOpen) document.body.classList.remove("customizer-mobile-sheet-open");
        setMobileEditorUi({ selected: selectedMobile, drawerOpen });
    }

    function openMobileText() {
        if (!mobileTextSheet) return;
        closeMobileText();
        mobileTextSheet.hidden = false;
        document.body.classList.add("customizer-mobile-sheet-open");
        mobileTextInput?.focus();
    }

    function setMobileEditorUi({ selected = selectedMobile, drawerOpen = false } = {}) {
        if (drawerOpen || !mobileMedia.matches) {
            mobileToolbar?.classList.toggle("is-hidden", drawerOpen);
            mobileSelectionToolbar?.setAttribute("hidden", "");
            mobileContextToolbar?.setAttribute("hidden", "");
            return;
        }

        mobileToolbar?.classList.toggle("is-hidden", selected);
        if (selected) {
            mobileContextToolbar?.removeAttribute("hidden");
            if (editingMobile) mobileSelectionToolbar?.removeAttribute("hidden");
            else mobileSelectionToolbar?.setAttribute("hidden", "");
        } else {
            editingMobile = false;
            mobileContextToolbar?.setAttribute("hidden", "");
            mobileSelectionToolbar?.setAttribute("hidden", "");
        }
    }

    function openMobileEdit() {
        if (!selectedMobile) return;
        editingMobile = true;
        mobileToolbar?.classList.add("is-hidden");
        mobileContextToolbar?.setAttribute("hidden", "");
        mobileSelectionToolbar?.removeAttribute("hidden");
    }

    function closeMobileEdit() {
        editingMobile = false;
        setMobileEditorUi({ selected: selectedMobile, drawerOpen: false });
    }

    function openMobileColorSheet(mode = "color") {
        if (!mobileColorSheet) return;
        if (mobileColorSheetMode) mobileColorSheetMode.textContent = mode === "paint" ? "ویرایش رنگ طرح" : "ویرایش طرح";
        if (mobileColorSheetTitle) mobileColorSheetTitle.textContent = mode === "paint" ? "رنگ‌آمیزی طرح" : "رنگ طرح";
        mobileColorSheet.hidden = false;
        document.body.classList.add("customizer-mobile-sheet-open");
        document.dispatchEvent(new CustomEvent("babaei:mobile-color-sheet", { detail: { open: true, mode } }));
    }

    function closeMobileColorSheet() {
        if (mobileColorSheet) mobileColorSheet.hidden = true;
        const drawerOpen = !leftDrawer?.classList.contains("is-drawer-closed") ||
            !rightDrawer?.classList.contains("is-drawer-closed");
        if (!drawerOpen && mobileTextSheet?.hidden !== false) document.body.classList.remove("customizer-mobile-sheet-open");
        setMobileEditorUi({ selected: selectedMobile, drawerOpen });
        document.dispatchEvent(new CustomEvent("babaei:mobile-color-sheet", { detail: { open: false } }));
    }

    document.querySelectorAll("[data-mobile-action]").forEach(button => {
        button.addEventListener("click", () => {
            const action = button.dataset.mobileAction;
            if (action === "product") setDrawer("right", true);
            if (action === "artwork") {
                setDrawer("right", true);
                document.getElementById("label-library-trigger")?.click();
            }
            if (action === "tools") setDrawer("left", true);
            if (action === "text") openMobileText();
        });
    });

    document.getElementById("mobile-text-close")?.addEventListener("click", closeMobileText);
    document.getElementById("mobile-text-add")?.addEventListener("click", () => {
        const value = mobileTextInput?.value?.trim();
        if (!value) {
            mobileTextInput?.focus();
            return;
        }
        document.dispatchEvent(new CustomEvent("babaei:add-text", { detail: { text: value } }));
        if (mobileTextInput) mobileTextInput.value = "";
        closeMobileText();
    });

    const desktopTextInput = document.getElementById("desktop-text-input");
    const desktopTextAdd = document.getElementById("desktop-text-add");

    function addDesktopText() {
        const value = desktopTextInput?.value?.trim();
        if (!value) {
            desktopTextInput?.focus();
            return;
        }
        document.dispatchEvent(new CustomEvent("babaei:add-text", { detail: { text: value } }));
        if (desktopTextInput) {
            desktopTextInput.value = "";
            desktopTextInput.focus();
        }
    }

    desktopTextAdd?.addEventListener("click", addDesktopText);
    desktopTextInput?.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            addDesktopText();
        }
    });

    document.addEventListener("babaei:drawer-state", event => {
        const open = Boolean(event.detail?.open);
        document.body.classList.toggle("customizer-mobile-sheet-open", open);
        setMobileEditorUi({ selected: Boolean(selectedMobile), drawerOpen: open });
    });

    document.addEventListener("babaei:selection-changed", event => {
        selectedMobile = Boolean(event.detail?.selected);
        if (!selectedMobile) editingMobile = false;
        const drawerOpen = Boolean(
            !leftDrawer?.classList.contains("is-drawer-closed") ||
            !rightDrawer?.classList.contains("is-drawer-closed")
        );
        setMobileEditorUi({ selected: selectedMobile, drawerOpen });
    });

    document.querySelectorAll("[data-mobile-selection]").forEach(button => {
        button.addEventListener("click", () => {
            const action = button.dataset.mobileSelection;
            if (action === "layout") setDrawer("left", true);
            if (action === "done") closeMobileEdit();
        });
    });


    document.querySelectorAll("[data-mobile-context]").forEach(button => {
        button.addEventListener("click", () => {
            const action = button.dataset.mobileContext;
            if (action === "color") openMobileColorSheet("color");
            if (action === "text") openMobileText();
            if (action === "background") setDrawer("right", true);
            if (action === "edit") openMobileEdit();
        });
    });

    document.getElementById("mobile-color-sheet-close")?.addEventListener("click", closeMobileColorSheet);
    document.getElementById("mobile-color-sheet-done")?.addEventListener("click", closeMobileColorSheet);

    document.querySelectorAll("[data-layer-color]").forEach(button => {
        button.addEventListener("click", () => {
            document.dispatchEvent(new CustomEvent("babaei:set-layer-color", {
                detail: { color: button.dataset.layerColor }
            }));
            document.querySelectorAll("[data-layer-color]").forEach(item => item.classList.toggle("is-active", item === button));
            if (mobileLayerColorCustom) mobileLayerColorCustom.value = button.dataset.layerColor;
        });
    });

    mobileLayerColorCustom?.addEventListener("input", () => {
        const color = mobileLayerColorCustom.value;
        document.dispatchEvent(new CustomEvent("babaei:set-layer-color", { detail: { color } }));
    });

    mobileLayerOpacity?.addEventListener("input", () => {
        const value = Number(mobileLayerOpacity.value || 100);
        if (mobileLayerOpacityValue) mobileLayerOpacityValue.textContent = value + "%";
        document.dispatchEvent(new CustomEvent("babaei:set-layer-opacity", {
            detail: { opacity: value / 100 }
        }));
    });

    document.addEventListener("babaei:mobile-color-sheet", event => {
        const open = Boolean(event.detail?.open);
        if (open) {
            editingMobile = false;
            mobileToolbar?.classList.add("is-hidden");
            mobileSelectionToolbar?.setAttribute("hidden", "");
            mobileContextToolbar?.setAttribute("hidden", "");
        } else {
            setMobileEditorUi({ selected: selectedMobile, drawerOpen: false });
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        if (mobileColorSheet && !mobileColorSheet.hidden) {
            closeMobileColorSheet();
            return;
        }
        if (mobileTextSheet && !mobileTextSheet.hidden) {
            closeMobileText();
            return;
        }
        if (editingMobile) {
            closeMobileEdit();
            return;
        }
        const drawerOpen = !leftDrawer?.classList.contains("is-drawer-closed") ||
            !rightDrawer?.classList.contains("is-drawer-closed");
        if (drawerOpen) {
            setDrawer("left", false);
            setDrawer("right", false);
        }
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
