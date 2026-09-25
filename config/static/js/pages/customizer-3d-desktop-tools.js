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

        const openLabel = () => {
            log("ACTION: label");
            const result = clone("#label-library-panel", { unhide: true });
            if (!result) return;

            const sourceButtons = result.source.querySelectorAll(".artwork-grid button");
            result.node.querySelectorAll(".artwork-grid button").forEach((button, index) => {
                button.addEventListener("click", event => {
                    event.preventDefault();
                    sourceButtons[index]?.click();
                    close();
                });
            });

            const sourceUpload = result.source.querySelector("#artwork-upload");
            const uploadButton = result.node.querySelector(".upload-dropzone");
            if (sourceUpload && uploadButton) {
                uploadButton.addEventListener("click", event => {
                    event.preventDefault();
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
                    sourceButtons[index]?.click();
                    close();
                });
            });

            open(title, result.node);
        };

        const openText = () => {
            log("ACTION: text");
            const result = clone(".desktop-text-tools");
            if (!result) return;

            const input = result.node.querySelector("#desktop-text-input");
            const add = result.node.querySelector("#desktop-text-add");

            const submit = () => {
                const value = input?.value?.trim();
                if (!value) {
                    input?.focus();
                    return;
                }

                const realInput = document.getElementById("desktop-text-input");
                const realAdd = document.getElementById("desktop-text-add");
                if (realInput) realInput.value = value;
                realAdd?.click();
                close();
            };

            add?.addEventListener("click", event => {
                event.preventDefault();
                submit();
            });

            input?.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    submit();
                }
            });

            open("افزودن متن", result.node);
            input?.focus();
        };

        const openTextFont = () => {
            log("ACTION: text-font");
            const result = clone("#desktop-text-editor", { unhide: true });
            if (!result) return;

            result.node.querySelectorAll("[data-text-style]").forEach(button => {
                button.addEventListener("click", event => {
                    event.preventDefault();
                    const selector = '[data-text-style="' + CSS.escape(button.dataset.textStyle || "") + '"]';
                    const originals = document.querySelectorAll(selector);
                    const original = Array.from(originals).find(item => item !== button);
                    original?.click();
                    close();
                });
            });

            const sourceRanges = result.source.querySelectorAll('input[type="range"]');
            result.node.querySelectorAll('input[type="range"]').forEach((range, index) => {
                range.addEventListener("input", () => {
                    const original = sourceRanges[index];
                    if (!original) return;
                    original.value = range.value;
                    original.dispatchEvent(new Event("input", { bubbles: true }));
                });
            });

            const sourceApply = result.source.querySelector("#desktop-text-apply");
            const apply = result.node.querySelector(".desktop-text-editor__apply");
            apply?.addEventListener("click", event => {
                event.preventDefault();
                sourceApply?.click();
                close();
            });

            open("فونت و استایل متن", result.node);
        };

        const openTextColor = () => {
            log("ACTION: text-color");
            const result = clone(".text-style-colors");
            if (!result) return;

            const originals = result.source.querySelectorAll("[data-text-color]");
            result.node.querySelectorAll("[data-text-color]").forEach((button, index) => {
                button.addEventListener("click", event => {
                    event.preventDefault();
                    originals[index]?.click();
                    close();
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
                    originals[index]?.click();
                    close();
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

        document.addEventListener("click", event => {
            if (popover.hidden) return;
            if (popover.contains(event.target) || dock.contains(event.target)) return;

            log("OUTSIDE CLICK", {
                target: event.target?.tagName,
                id: event.target?.id || null,
                className: event.target?.className || null,
            });

            close();
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                log("ESCAPE");
                close();
            }
        });

        window.BabaeiDesktopToolsDebug = {
            version: "20260925-debug1",
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
