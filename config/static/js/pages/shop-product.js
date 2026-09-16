(() => {
    const data = window.BabaeiProduct;
    if (!data || !Array.isArray(data.variants) || !data.variants.length) return;

    const variants = data.variants;
    const colorButtons = [...document.querySelectorAll(".color-option")];
    const sizeButtons = [...document.querySelectorAll(".size-option")];
    const priceEl = document.getElementById("product-price");
    const oldPriceRow = document.getElementById("product-old-price-row");
    const oldPriceEl = document.getElementById("product-old-price");
    const discountEl = document.getElementById("product-discount");
    const totalStockEl = document.getElementById("total-stock");
    const statusEl = document.getElementById("variant-status");
    const selectedColorLabel = document.getElementById("selected-color-label");
    const selectedSizeLabel = document.getElementById("selected-size-label");
    const variantInput = document.getElementById("cart-variant-id");
    const addButton = document.getElementById("add-to-cart-button");

    let selectedColorId = null;
    let selectedSizeId = null;

    const formatPrice = (value) => new Intl.NumberFormat("fa-IR").format(Number(value || 0));
    const formatPercent = (value) => `٪${formatPrice(value)}`;
    const discounted = (variant) => variant.compare_at_price && Number(variant.compare_at_price) > Number(variant.price);
    const discountPercent = (variant) => discounted(variant) ? Math.round(((Number(variant.compare_at_price) - Number(variant.price)) * 100) / Number(variant.compare_at_price)) : 0;
    const availableForColor = (colorId) => variants.filter((variant) => Number(variant.color_id) === Number(colorId));
    const findVariant = () => variants.find((variant) => Number(variant.color_id) === Number(selectedColorId) && Number(variant.size_id) === Number(selectedSizeId));
    const findColorName = (colorId) => (variants.find((item) => Number(item.color_id) === Number(colorId)) || {}).color || "";
    const findSizeName = (sizeId) => (variants.find((item) => Number(item.size_id) === Number(sizeId)) || {}).size || "";

    const renderSizes = () => sizeButtons.forEach((button) => {
        const sizeId = Number(button.dataset.sizeId);
        const variant = variants.find((item) => Number(item.color_id) === Number(selectedColorId) && Number(item.size_id) === sizeId);
        const available = Boolean(variant && Number(variant.stock) > 0);
        button.disabled = !variant || !available;
        button.classList.toggle("is-unavailable", !variant || !available);
        button.classList.toggle("is-selected", sizeId === Number(selectedSizeId));
    });

    const renderColors = () => colorButtons.forEach((button) => {
        const colorId = Number(button.dataset.colorId);
        const hasStock = availableForColor(colorId).some((variant) => Number(variant.stock) > 0);
        button.disabled = !hasStock;
        button.classList.toggle("is-selected", colorId === Number(selectedColorId));
        button.classList.toggle("is-unavailable", !hasStock);
    });

    const renderVariant = () => {
        const variant = findVariant();
        selectedColorLabel.textContent = findColorName(selectedColorId);
        selectedSizeLabel.textContent = findSizeName(selectedSizeId);
        if (!variant) {
            statusEl.textContent = "این ترکیب رنگ و سایز موجود نیست.";
            priceEl.textContent = formatPrice(data.initialProductPrice);
            oldPriceRow.classList.add("is-hidden");
            if (variantInput) variantInput.value = "";
            if (addButton) addButton.disabled = true;
            return;
        }
        priceEl.textContent = formatPrice(variant.price);
        if (discounted(variant)) {
            oldPriceEl.textContent = formatPrice(variant.compare_at_price);
            discountEl.textContent = formatPercent(discountPercent(variant));
            oldPriceRow.classList.remove("is-hidden");
        } else {
            oldPriceRow.classList.add("is-hidden");
            oldPriceEl.textContent = "";
            discountEl.textContent = "";
        }
        if (variantInput) variantInput.value = variant.id;
        if (Number(variant.stock) > 0) {
            statusEl.innerHTML = `<strong>${formatPrice(variant.stock)} عدد</strong> از این ترکیب موجود است`;
            if (addButton) addButton.disabled = false;
        } else {
            statusEl.textContent = "این ترکیب ناموجود است.";
            if (addButton) addButton.disabled = true;
        }
    };

    const selectInitialVariant = () => {
        const initial = variants.find((variant) => Number(variant.stock) > 0) || variants[0];
        selectedColorId = initial.color_id;
        selectedSizeId = initial.size_id;
        renderColors(); renderSizes(); renderVariant();
    };

    colorButtons.forEach((button) => button.addEventListener("click", () => {
        if (button.disabled) return;
        selectedColorId = Number(button.dataset.colorId);
        const sameColor = availableForColor(selectedColorId);
        const nextSize = sameColor.find((variant) => Number(variant.stock) > 0) || sameColor[0];
        selectedSizeId = nextSize ? nextSize.size_id : null;
        renderColors(); renderSizes(); renderVariant();
    }));
    sizeButtons.forEach((button) => button.addEventListener("click", () => {
        if (button.disabled) return;
        selectedSizeId = Number(button.dataset.sizeId);
        renderSizes(); renderVariant();
    }));
    if (totalStockEl) totalStockEl.textContent = `${formatPrice(variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0))} عدد`;
    selectInitialVariant();
})();
