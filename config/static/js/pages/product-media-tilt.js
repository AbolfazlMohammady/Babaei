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
    let next = null;
    let attached = false;

    const flush = () => {
        queued = false;
        if (!next) return;
        card.style.setProperty("--tilt-x", `${next.x.toFixed(2)}deg`);
        card.style.setProperty("--tilt-y", `${next.y.toFixed(2)}deg`);
        card.style.setProperty("--glow-x", `${next.glowX.toFixed(1)}%`);
        card.style.setProperty("--glow-y", `${next.glowY.toFixed(1)}%`);
        next = null;
    };

    const onMove = (event) => {
        const rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const px = (event.clientX - rect.left) / rect.width;  // 0 … 1
        const py = (event.clientY - rect.top) / rect.height;  // 0 … 1

        next = {
            // Turning the pointer right lifts the left edge, and so on.
            y: (px - 0.5) * 2 * MAX_TILT,
            x: (0.5 - py) * 2 * MAX_TILT,
            glowX: px * 100,
            glowY: py * 100,
        };

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
        next = null;
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
        card.style.setProperty("--glow-x", "50%");
        card.style.setProperty("--glow-y", "50%");
    };

    const detach = () => {
        if (!attached) return;
        card.removeEventListener("pointermove", onMove);
        card.removeEventListener("pointerleave", reset);
        card.removeEventListener("pointercancel", reset);
        card.classList.remove("is-interactive");
        attached = false;
        reset();
    };

    const attach = () => {
        if (attached) return;
        card.addEventListener("pointermove", onMove);
        card.addEventListener("pointerleave", reset);
        card.addEventListener("pointercancel", reset);
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
