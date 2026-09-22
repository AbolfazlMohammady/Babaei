/* ==========================================================================
   BABAEI — Shop shell controller
   --------------------------------------------------------------------------
   Owns two things and nothing else:
     1. the sticky nav's transparent-over-hero state
     2. the mobile drawer (open/close, focus trap, scroll lock)

   No dependencies. Every listener is passive or cheap, scroll work is batched
   into a single requestAnimationFrame, and nothing is bound unless the element
   is actually on the page — so this file is inert on every other template.
   ========================================================================== */

(() => {
    "use strict";

    /* ======================================================================
       1. Sticky nav state
       ---------------------------------------------------------------------
       The markup ships with `.is-top` so the transparent state is painted on
       the very first frame (no flash). From here on we only flip it.
       ==================================================================== */

    const nav = document.querySelector("[data-sh-nav]");

    if (nav) {
        /* The handler only reads scrollY and flips two classes, and it returns
           immediately when the state has not changed. There is no layout read,
           so no reflow is forced and batching into requestAnimationFrame is
           unnecessary — which also means the state cannot get stuck if the
           browser throttles rAF (background tab, off-screen frame). */
        const THRESHOLD = 8;
        let solid = null;

        const syncNav = () => {
            const next = window.scrollY > THRESHOLD;
            if (next === solid) return;
            solid = next;
            nav.classList.toggle("is-top", !next);
            nav.classList.toggle("is-scrolled", next);
        };

        syncNav();
        window.addEventListener("scroll", syncNav, { passive: true });
        window.addEventListener("resize", syncNav, { passive: true });
        window.addEventListener("pageshow", syncNav);
        window.addEventListener("hashchange", syncNav);
    }

    /* ======================================================================
       2. Mobile drawer
       ==================================================================== */

    const drawer = document.querySelector("[data-sh-drawer]");
    const burger = document.querySelector("[data-sh-burger]");

    if (!drawer || !burger) return;

    const panel = drawer.querySelector(".sh-drawer__panel");
    const body = document.body;
    const FOCUSABLE = [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    let lastFocused = null;
    const desktop = window.matchMedia("(min-width: 941px)");

    const focusables = () =>
        Array.from(panel ? panel.querySelectorAll(FOCUSABLE) : []).filter(
            (el) => el.offsetParent !== null || el === document.activeElement
        );

    const isOpen = () => drawer.classList.contains("is-open");

    const open = () => {
        if (isOpen()) return;
        lastFocused = document.activeElement;
        drawer.classList.add("is-open");
        drawer.setAttribute("aria-hidden", "false");
        burger.setAttribute("aria-expanded", "true");
        body.classList.add("sh-no-scroll");

        const first = focusables()[0];
        if (first) first.focus({ preventScroll: true });
    };

    const close = ({ restoreFocus = true } = {}) => {
        if (!isOpen()) return;
        drawer.classList.remove("is-open");
        drawer.setAttribute("aria-hidden", "true");
        burger.setAttribute("aria-expanded", "false");
        body.classList.remove("sh-no-scroll");

        if (!restoreFocus) return;

        /* The burger is the only way in, and some browsers do not give a
           programmatically clicked button focus, so fall back to it rather
           than dropping the focus ring onto <body>. */
        const target =
            lastFocused instanceof HTMLElement && lastFocused !== body
                ? lastFocused
                : burger;
        target.focus({ preventScroll: true });
    };

    burger.addEventListener("click", () => {
        isOpen() ? close() : open();
    });

    drawer.querySelectorAll("[data-sh-drawer-close]").forEach((el) => {
        el.addEventListener("click", () => close());
    });

    /* Any in-panel navigation should dismiss the drawer. Links that point at
       the current page are left alone so the focus is not thrown away. */
    drawer.querySelectorAll("a[href]").forEach((link) => {
        link.addEventListener("click", () => close({ restoreFocus: false }));
    });

    document.addEventListener("keydown", (event) => {
        if (!isOpen()) return;

        if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
        }

        if (event.key !== "Tab") return;

        // focus trap
        const items = focusables();
        if (!items.length) return;

        const first = items[0];
        const last = items[items.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    /* Rotating to a wide viewport must not strand the drawer open. */
    const onBreakpoint = (event) => {
        if (event.matches) close({ restoreFocus: false });
    };

    if (typeof desktop.addEventListener === "function") {
        desktop.addEventListener("change", onBreakpoint);
    } else if (typeof desktop.addListener === "function") {
        desktop.addListener(onBreakpoint); // Safari < 14
    }
})();
