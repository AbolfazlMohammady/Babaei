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

        const openLabel = () => {
            log("ACTION: label");
            const result = clone("#label-library-panel", { unhide: true });
            if (!result) return;

            const sourceButtons = result.source.querySelectorAll(".artwork-grid button");
            result.node.querySelectorAll(".artwork-grid button").forEach((button, index) => {
                button.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    log("LABEL SELECT", { index });
                    sourceButtons[index]?.click();
                    // Keep the library open. The user closes it explicitly with ×.
                });
            });

            const sourceUpload = result.source.querySelector("#artwork-upload");
            const uploadButton = result.node.querySelector(".upload-dropzone");
            if (sourceUpload && uploadButton) {
                uploadButton.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    sourceUpload.click();
                });
            }
            result.node.querySelector('input[type="file"]')?.remove();

            open("انتخاب لیبل", result.node);
        };

        const openButtons = (selector, title) => {
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

        const buildTextPopover = (focusStyle = false) => {
            log("ACTION: text", { focusStyle });

            const textResult = clone(".desktop-text-tools");
            if (!textResult) return;

            const editorSource = document.getElementById("desktop-text-editor");
            const editorResult = editorSource && !editorSource.hidden
                ? clone("#desktop-text-editor", { unhide: true })
                : null;

            const wrapper = document.createElement("div");
            wrapper.className = "desktop-text-popover-content";

            const textNode = textResult.node;
            const input = textNode.querySelector('input[type="text"]');
            const add = textNode.querySelector("button");

            const submit = () => {
                const value = input?.value?.trim();
                if (!value) {
                    input?.focus();
                    return;
                }

                log("TEXT ADD", { value });
                dispatch("babaei:add-text", { text: value });
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

            wrapper.appendChild(textNode);

            if (editorResult) {
                const separator = document.createElement("div");
                separator.className = "desktop-text-popover__separator";
                wrapper.appendChild(separator);
                wrapper.appendChild(editorResult.node);
                wireTextEditor(editorResult);
            }

            open(editorResult ? "متن و استایل" : "افزودن متن", wrapper);

            if (focusStyle && editorResult) {
                editorResult.node.querySelector('input[type="text"]')?.focus();
            } else {
                input?.focus();
            }
        };

        const openText = () => buildTextPopover(false);

        const openTextFont = () => {
            const sourceEditor = document.getElementById("desktop-text-editor");
            if (!sourceEditor || sourceEditor.hidden) {
                log("ACTION: text-font without selected text -> open text tool");
                buildTextPopover(false);
                return;
            }
            buildTextPopover(true);
        };

        const openTextColor = () => {
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
                    else if (tool === "text-color") openTextColor();
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
            version: "20260925-desktop-tools2",
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
