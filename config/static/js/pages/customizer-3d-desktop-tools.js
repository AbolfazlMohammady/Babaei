(() => {
    "use strict";

    function initDesktopToolDock() {
        const LOG = "[BABAEI][DESKTOP-TOOLS]";
        const log = (...args) => console.log(LOG, ...args);
        const warn = (...args) => console.warn(LOG, ...args);
        const error = (...args) => console.error(LOG, ...args);

        log("INIT: desktop tools script started", {
            readyState: document.readyState,
            width: window.innerWidth,
            height: window.innerHeight,
        });

        const dock = document.getElementById("desktop-tool-dock");
        const popover = document.getElementById("desktop-tool-popover");

        log("DOM CHECK", {
            dock: !!dock,
            popover: !!popover,
            dockButtons: dock?.querySelectorAll("[data-desktop-tool]").length ?? 0,
        });

        if (!dock || !popover) {
            error("INIT FAILED: dock or popover element not found");
            return;
        }

        if (dock.dataset.bound === "1") {
            warn("INIT SKIPPED: dock is already bound");
            return;
        }

        dock.dataset.bound = "1";
        log("INIT OK: event binding begins");

        let currentTool = null;

        const close = () => {
            log("POPOVER CLOSE");
            popover.hidden = true;
            popover.innerHTML = "";
        };

        const open = (title, node) => {
            log("POPOVER OPEN", {
                title,
                node: node?.className || node?.tagName || null,
            });

            popover.innerHTML = "";

            const header = document.createElement("div");
            header.className = "desktop-tool-popover__title";

            const label = document.createElement("span");
            label.textContent = title;

            const closeButton = document.createElement("button");
            closeButton.type = "button";
            closeButton.className = "desktop-tool-popover__close";
            closeButton.setAttribute("aria-label", "بستن");
            closeButton.textContent = "×";
            closeButton.addEventListener("click", close);

            header.append(label, closeButton);
            popover.append(header, node);
            popover.hidden = false;

            log("POPOVER STATE", {
                hidden: popover.hidden,
                display: getComputedStyle(popover).display,
                visibility: getComputedStyle(popover).visibility,
                opacity: getComputedStyle(popover).opacity,
                rect: popover.getBoundingClientRect().toJSON(),
            });
        };

        const clone = (selector, options = {}) => {
            const source = document.querySelector(selector);

            log("CLONE REQUEST", {
                selector,
                found: !!source,
                hidden: source?.hidden,
                display: source ? getComputedStyle(source).display : null,
            });

            if (!source) {
                warn("CLONE FAILED: source not found", selector);
                return null;
            }

            const node = source.cloneNode(true);
            if (options.removeId !== false) {
                node.removeAttribute("id");
                node.querySelectorAll("[id]").forEach(item => item.removeAttribute("id"));
            }
            if (options.unhide) node.removeAttribute("hidden");
            return { source, node };
        };

        const dispatch = (name, detail = {}) => {
            log("DISPATCH", { name, detail });
            document.dispatchEvent(new CustomEvent(name, { detail }));
        };

        const openLabel = (focusUploaded = false) => {
            currentTool = "label";
            log("ACTION: label");
            const result = clone("#label-library-panel", { unhide: true });
            if (!result) return;

            // The desktop popover already has its own single × in the header.
            // Remove the old panel header so there is no second close button.
            result.node.querySelector(".label-library-panel__head")?.remove();

            const librarySection = result.node.querySelector('[data-artwork-section="library"]');
            const libraryToggle = librarySection?.querySelector(".artwork-library-section__toggle");
            if (libraryToggle) {
                const description = document.createElement("small");
                description.className = "artwork-library-section__description";
                description.textContent = "یک لیبل انتخاب کن تا روی لباس قرار بگیرد.";
                libraryToggle.appendChild(description);
            }

            const librarySectionNode = result.node.querySelector('[data-artwork-section="library"]');
            const uploadedSectionNode = result.node.querySelector('[data-artwork-section="uploaded"]');
            const setSectionState = (section, openState) => {
                const toggle = section?.querySelector(".artwork-library-section__toggle");
                const grid = section?.querySelector(".artwork-library-section__grid");
                if (!toggle || !grid) return;
                grid.hidden = !openState;
                toggle.setAttribute("aria-expanded", String(openState));
                section.classList.toggle("is-open", openState);
            };

            // Exactly one label group is expanded at a time.
            setSectionState(librarySectionNode, !focusUploaded);
            setSectionState(uploadedSectionNode, focusUploaded);

            result.node.querySelectorAll("[data-artwork-section] .artwork-library-section__toggle").forEach(toggle => {
                toggle.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const section = toggle.closest("[data-artwork-section]");
                    const grid = section?.querySelector(".artwork-library-section__grid");
                    if (!grid) return;
                    const isOpen = !grid.hidden;
                    const nextOpen = isOpen ? false : true;
                    const sibling = section.parentElement?.querySelector(
                        '[data-artwork-section].is-open'
                    );
                    if (nextOpen && sibling && sibling !== section) {
                        setSectionState(sibling, false);
                    }
                    grid.hidden = !nextOpen;
                    toggle.setAttribute("aria-expanded", String(nextOpen));
                    section.classList.toggle("is-open", nextOpen);
                    log("LABEL SECTION TOGGLE", {
                        section: section.dataset.artworkSection,
                        open: !isOpen,
                    });
                });
            });

            const sourceButtons = result.source.querySelectorAll(".artwork-grid button");
            result.node.querySelectorAll(".artwork-grid button").forEach((button, index) => {
                button.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    log("LABEL SELECT", { index });
                    sourceButtons[index]?.click();
                    // Keep the library popover open. The user closes it explicitly with ×.
                });
            });

            // Keep the upload controls inside the separate "لیبل‌های من" box.
            const uploadedSection = result.node.querySelector('[data-artwork-section="uploaded"]');
            const uploadDropzone = result.node.querySelector(".upload-dropzone");
            const backgroundOption = result.node.querySelector(".upload-background-option");
            const uploadStatus = result.node.querySelector("#upload-status");
            if (uploadedSection && uploadDropzone) {
                uploadedSection.append(uploadDropzone);
                if (backgroundOption) uploadedSection.append(backgroundOption);
                if (uploadStatus) uploadedSection.append(uploadStatus);
            }

            const sourceUpload = result.source.querySelector("#artwork-upload");
            const uploadButton = result.node.querySelector(".upload-dropzone");
            if (sourceUpload && uploadButton) {
                uploadButton.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    sourceUpload.click();
                });
            }
            const panelClose = result.node.querySelector(".label-library-close");
            panelClose?.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                log("LABEL LIBRARY CLOSE");
                close();
            });

            result.node.querySelector('input[type="file"]')?.remove();

            open("انتخاب لیبل", result.node);
        };

        document.addEventListener("babaei:artwork-uploaded", event => {
            log("ARTWORK UPLOADED", { artwork: event.detail?.artwork });
            if (currentTool === "label" && !popover.hidden) {
                openLabel(true);
            }
        });

        const openButtons = (selector, title) => {
            currentTool = selector;
            log("ACTION: button group", { selector, title });
            const result = clone(selector);
            if (!result) return;

            const sourceButtons = result.source.querySelectorAll("button");
            result.node.querySelectorAll("button").forEach((button, index) => {
                button.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    sourceButtons[index]?.click();
                    // Keep the tool card open until the explicit × is pressed.
                });
            });

            open(title, result.node);
        };

        const wireTextEditor = (editorResult) => {
            if (!editorResult) return;

            const source = editorResult.source;
            const node = editorResult.node;
            const editInput = node.querySelector('input[type="text"]');
            const sourceEditInput = source.querySelector("#desktop-text-edit-input");
            const apply = node.querySelector(".desktop-text-editor__apply");
            const sourceApply = source.querySelector("#desktop-text-apply");

            if (editInput && sourceEditInput) {
                editInput.value = sourceEditInput.value || "";
            }

            node.querySelectorAll("[data-text-style]").forEach(button => {
                button.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();

                    const selector = '[data-text-style="' +
                        CSS.escape(button.dataset.textStyle || "") +
                        '"]';
                    const original = Array.from(document.querySelectorAll(selector))
                        .find(item => item !== button);

                    log("TEXT STYLE SELECT", { style: button.dataset.textStyle });
                    original?.click();
                });
            });

            const sourceRanges = source.querySelectorAll('input[type="range"]');
            node.querySelectorAll('input[type="range"]').forEach((range, index) => {
                range.addEventListener("input", () => {
                    const original = sourceRanges[index];
                    if (!original) return;

                    original.value = range.value;
                    original.dispatchEvent(new Event("input", { bubbles: true }));
                });
            });

            node.querySelectorAll("[data-text-color]").forEach(button => {
                button.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();

                    const color = button.dataset.textColor;
                    const original = Array.from(document.querySelectorAll("[data-text-color]"))
                        .find(item => item !== button && item.dataset.textColor === color);

                    log("TEXT COLOR SELECT", { color });
                    original?.click();
                });
            });

            apply?.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();

                const value = editInput?.value?.trim();
                if (!value) {
                    editInput?.focus();
                    return;
                }

                const sourceColor = Array.from(document.querySelectorAll("[data-text-color].is-active"))
                    .find(item => item.dataset.textColor)?.dataset.textColor || "#ffffff";

                const style = {
                    preset: Array.from(document.querySelectorAll("[data-text-style].is-active"))
                        .find(item => item.dataset.textStyle)?.dataset.textStyle || "modern",
                    curve: Number(source.querySelector("#desktop-text-curve")?.value || 0),
                    letterSpacing: Number(source.querySelector("#desktop-text-spacing")?.value || 0),
                };

                log("TEXT APPLY", { value, style, color: sourceColor });
                dispatch("babaei:update-text", {
                    text: value,
                    style,
                    color: sourceColor,
                });
            });

            editInput?.addEventListener("keydown", event => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                apply?.click();
            });
        };

        const buildTextPopover = () => {
            currentTool = "text";
            log("ACTION: text");

            const textResult = clone(".desktop-text-tools");
            const editorResult = clone("#desktop-text-editor", { unhide: true });
            if (!textResult || !editorResult) return;

            const wrapper = document.createElement("div");
            wrapper.className = "desktop-text-popover-content";

            const textNode = textResult.node;
            // clone() strips IDs to avoid duplicate IDs in the DOM.
            const input = textNode.querySelector('.desktop-text-tools__row input[type="text"]');
            const add = textNode.querySelector(".desktop-text-tools__row button");

            const editorNode = editorResult.node;
            const editInput = editorNode.querySelector('.desktop-text-editor > input[type="text"]');
            const ranges = editorNode.querySelectorAll('.text-style-range input[type="range"]');
            const outputs = editorNode.querySelectorAll(".text-style-range output");
            const sizeRange = ranges[0];
            const sizeValue = outputs[0];
            const curveRange = ranges[1];
            const spacingRange = ranges[2];

            const submit = () => {
                const value = input?.value?.trim();
                if (!value) {
                    input?.focus();
                    return;
                }

                const sourceColor = Array.from(editorNode.querySelectorAll("[data-text-color].is-active"))
                    .find(item => item.dataset.textColor)?.dataset.textColor
                    || Array.from(document.querySelectorAll("[data-text-color].is-active"))
                        .find(item => item.dataset.textColor)?.dataset.textColor
                    || "#ffffff";
                const style = {
                    preset: Array.from(editorNode.querySelectorAll("[data-text-style].is-active"))
                        .find(item => item.dataset.textStyle)?.dataset.textStyle || "modern",
                    fontSize: Number(sizeRange?.value || 100),
                    curve: Number(curveRange?.value || 0),
                    letterSpacing: Number(spacingRange?.value || 0),
                };

                log("TEXT ADD", { value, style, color: sourceColor });

                // In the desktop cloned popover the original hidden form is not
                // the active UI. Add directly through the 3D API so the new text
                // layer is created immediately, then fall back to the event bridge
                // for older/customizer builds.
                let added = false;
                if (window.BabaeiCustomizer3D?.isReady?.() && window.BabaeiCustomizer3D?.addText) {
                    added = Boolean(window.BabaeiCustomizer3D.addText(value, style, sourceColor));
                    log("TEXT ADD RESULT", { added, via: "BabaeiCustomizer3D" });
                }

                if (!added) {
                    log("TEXT ADD FALLBACK", { via: "babaei:add-text" });
                    dispatch("babaei:add-text", { text: value, style, color: sourceColor });
                }

                if (input) input.value = "";
                input?.focus();
            };

            add?.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                submit();
            });

            input?.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    submit();
                }
            });

            // The editor is shown immediately, so the first click on Aa
            // opens both adding and editing controls in one place.
            wireTextEditor(editorResult);

            wrapper.append(textNode);
            const separator = document.createElement("div");
            separator.className = "desktop-text-popover__separator";
            wrapper.append(separator, editorNode);

            const syncSelection = event => {
                const detail = event.detail || {};
                if (!detail.isText) return;

                if (editInput) editInput.value = String(detail.text || "");
                const style = detail.textStyle || {};
                if (sizeRange) {
                    sizeRange.value = String(style.fontSize ?? 100);
                    if (sizeValue) sizeValue.textContent = String(style.fontSize ?? 100);
                }
                if (curveRange) curveRange.value = String(style.curve ?? 0);
                if (spacingRange) spacingRange.value = String(style.letterSpacing ?? 0);
                if (outputs[1]) outputs[1].textContent = String(style.curve ?? 0);
                if (outputs[2]) outputs[2].textContent = String(style.letterSpacing ?? 0);

                editorNode.querySelectorAll("[data-text-style]").forEach(button => {
                    button.classList.toggle("is-active", button.dataset.textStyle === (style.preset || "modern"));
                });
                if (detail.color) {
                    editorNode.querySelectorAll("[data-text-color]").forEach(button => {
                        button.classList.toggle("is-active", button.dataset.textColor === detail.color);
                    });
                }
            };

            document.addEventListener("babaei:selection-changed", syncSelection);
            const originalClose = close;
            open("متن و استایل", wrapper);

            // Keep the editor usable even when no text is selected yet.
            editorNode.querySelector("#desktop-text-apply")?.addEventListener("click", () => {
                if (!document.getElementById("desktop-text-editor")) return;
            });

            input?.focus();

            // Replace the temporary listener when this popover closes.
            const closeButton = popover.querySelector(".desktop-tool-popover__close");
            closeButton?.addEventListener("click", () => {
                document.removeEventListener("babaei:selection-changed", syncSelection);
            }, { once: true });
        };
        const openText = () => buildTextPopover();

        const openTextFont = () => buildTextPopover();

        const openTextColor = () => {
            currentTool = "text-color";
            log("ACTION: text-color");
            const result = clone(".text-style-colors");
            if (!result) return;

            const originals = result.source.querySelectorAll("[data-text-color]");
            result.node.querySelectorAll("[data-text-color]").forEach((button, index) => {
                button.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    originals[index]?.click();
                });
            });

            open("رنگ متن", result.node);
        };

        const openLabelTools = () => {
            currentTool = "label-tools";
            log("ACTION: label-tools");
            const result = clone("#selected-controls", { unhide: true });
            if (!result) return;

            const originals = result.source.querySelectorAll("[data-action]");
            result.node.querySelectorAll("[data-action]").forEach((button, index) => {
                button.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    originals[index]?.click();
                });
            });

            open("ابزارهای لیبل", result.node);
        };

        const buttons = dock.querySelectorAll("[data-desktop-tool]");
        log("BIND BUTTONS", {
            count: buttons.length,
            tools: Array.from(buttons).map(button => button.dataset.desktopTool),
        });

        buttons.forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();

                const tool = button.dataset.desktopTool;

                log("CLICK", {
                    tool,
                    title: button.title,
                    target: event.target?.tagName,
                    buttonRect: button.getBoundingClientRect().toJSON(),
                });

                try {
                    if (tool === "label") openLabel();
                    else if (tool === "text") openText();
                    else if (tool === "shirt-color") openButtons("#variant-color-list-right", "رنگ تیشرت");
                    else if (tool === "size") openButtons("#premium-size-list", "انتخاب سایز");
                    else if (tool === "text-font") openTextFont();
                    else if (tool === "label-tools") openLabelTools();
                    else if (tool === "save") {
                        const save = document.getElementById("save-design");
                        log("SAVE TARGET", { found: !!save });
                        save?.click();
                    } else {
                        warn("UNKNOWN TOOL", tool);
                    }
                } catch (err) {
                    error("CLICK HANDLER ERROR", { tool, error: err });
                    console.error(err);
                }
            });
        });

        // Desktop popovers are intentionally modal-like: they stay open until
        // the explicit × button is pressed or another desktop tool replaces them.
        document.addEventListener("keydown", event => {
            if (event.key !== "Escape" || popover.hidden) return;
            log("ESCAPE IGNORED: close with ×");
        });

        window.BabaeiDesktopToolsDebug = {
            version: "20260925-desktop-tools3",
            dock,
            popover,
            buttons,
            inspect() {
                const state = {
                    width: window.innerWidth,
                    dockExists: !!document.getElementById("desktop-tool-dock"),
                    popoverExists: !!document.getElementById("desktop-tool-popover"),
                    dockDisplay: getComputedStyle(dock).display,
                    dockPointerEvents: getComputedStyle(dock).pointerEvents,
                    dockZIndex: getComputedStyle(dock).zIndex,
                    popoverHidden: popover.hidden,
                    popoverDisplay: getComputedStyle(popover).display,
                    popoverPointerEvents: getComputedStyle(popover).pointerEvents,
                    popoverZIndex: getComputedStyle(popover).zIndex,
                };
                console.table(state);
                return state;
            },
        };

        log("READY: desktop tools fully bound");
        log("DEBUG: run BabaeiDesktopToolsDebug.inspect() in console");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initDesktopToolDock, { once: true });
    } else {
        initDesktopToolDock();
    }
})();
