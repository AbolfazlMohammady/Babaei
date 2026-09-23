/* ==========================================================================
   BABAEI — product photo tilt
   --------------------------------------------------------------------------
   One behaviour, taken from the React/`shadcn` card the shop owner asked to
   reuse and written for the stack this project actually runs: Django templates
   plus plain CSS, no React, no Tailwind, no build step. The photo leans a few
   degrees toward the pointer and a soft highlight follows it across the glass.

   Never active on touch. `(hover: hover) and (pointer: fine)` is the gate and
   `prefers-reduced-motion: reduce` switches it off entirely; both queries are
   observed, so plugging in a mouse or changing the OS setting takes effect
   without a reload. The custom properties it writes are all declared in
   css/pages/shop-product.css §12, so the card sits at neutral with no
   transform when this file never runs.
   ========================================================================== */
(() => {
    "use strict";

    const card = document.querySelector("[data-product-tilt]");
    if (!card) return;

    const MAX_TILT = 5;      // degrees — a lean, not a spin

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const noMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let queued = false;
    let pointer = null;
    let box = null;
    let attached = false;

    /* Reading the box forces the browser to flush layout, so it must never
       happen per pointer event: a pointer can move at 120Hz and a forced
       reflow at that rate is how a smooth card turns into a janky one. The
       event only records where the pointer is; the box is read inside the
       animation frame, and only when the page has moved since the last read. */
    const forgetBox = () => {
        box = null;
    };

    const readBox = () => {
        if (!box) box = card.getBoundingClientRect();
        return box;
    };

    const flush = () => {
        queued = false;
        if (!pointer) return;

        const rect = readBox();
        if (!rect.width || !rect.height) return;

        const px = (pointer.x - rect.left) / rect.width;   // 0 … 1
        const py = (pointer.y - rect.top) / rect.height;   // 0 … 1

        card.style.setProperty("--tilt-x", `${((0.5 - py) * 2 * MAX_TILT).toFixed(2)}deg`);
        card.style.setProperty("--tilt-y", `${((px - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`);
        card.style.setProperty("--glow-x", `${(px * 100).toFixed(1)}%`);
        card.style.setProperty("--glow-y", `${(py * 100).toFixed(1)}%`);
        pointer = null;
    };

    const onMove = (event) => {
        // Read the coordinates now: the event object is reused afterwards.
        pointer = { x: event.clientX, y: event.clientY };
        if (!card.classList.contains("is-tilting")) {
            card.classList.add("is-tilting");
        }
        if (!queued) {
            queued = true;
            window.requestAnimationFrame(flush);
        }
    };

    const reset = () => {
        card.classList.remove("is-tilting");
        pointer = null;
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
        card.style.setProperty("--glow-x", "50%");
        card.style.setProperty("--glow-y", "50%");
    };

    const detach = () => {
        if (!attached) return;
        card.removeEventListener("pointerenter", forgetBox);
        card.removeEventListener("pointermove", onMove);
        card.removeEventListener("pointerleave", reset);
        card.removeEventListener("pointercancel", reset);
        window.removeEventListener("scroll", forgetBox);
        window.removeEventListener("resize", forgetBox);
        forgetBox();
        card.classList.remove("is-interactive");
        attached = false;
        reset();
    };

    const attach = () => {
        if (attached) return;
        card.addEventListener("pointerenter", forgetBox, { passive: true });
        card.addEventListener("pointermove", onMove, { passive: true });
        card.addEventListener("pointerleave", reset);
        card.addEventListener("pointercancel", reset);
        // The card is sticky, so its box moves with the page; drop the cached
        // one whenever the page does, and it is re-read at most once per frame.
        window.addEventListener("scroll", forgetBox, { passive: true });
        window.addEventListener("resize", forgetBox, { passive: true });
        card.classList.add("is-interactive");
        attached = true;
    };

    const sync = () => {
        if (finePointer.matches && !noMotion.matches && card.isConnected) {
            attach();
        } else {
            detach();
        }
    };

    finePointer.addEventListener("change", sync);
    noMotion.addEventListener("change", sync);
    sync();
})();
