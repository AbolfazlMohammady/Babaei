document.addEventListener("DOMContentLoaded", () => {
    const body = document.body;

    /*
     * =========================================================
     * HEADER SCROLL STATE
     * =========================================================
     */

    const header = document.querySelector(".site-header");

    const updateHeader = () => {
        if (!header) {
            return;
        }

        if (window.scrollY > 30) {
            header.classList.add("is-scrolled");
        } else {
            header.classList.remove("is-scrolled");
        }
    };

    updateHeader();

    window.addEventListener(
        "scroll",
        updateHeader,
        { passive: true }
    );


    /*
     * =========================================================
     * MOBILE MENU
     * =========================================================
     */

    const mobileMenu = document.querySelector(
        "[data-mobile-menu-panel]"
    );

    const mobileMenuTriggers = document.querySelectorAll(
        "[data-mobile-menu]"
    );

    const mobileMenuCloseButtons = document.querySelectorAll(
        "[data-mobile-menu-close]"
    );


    const openMobileMenu = () => {
        if (!mobileMenu) {
            return;
        }

        mobileMenu.classList.add("is-open");

        mobileMenu.setAttribute(
            "aria-hidden",
            "false"
        );

        body.classList.add("no-scroll");

        mobileMenuTriggers.forEach((trigger) => {
            trigger.setAttribute(
                "aria-expanded",
                "true"
            );
        });
    };


    const closeMobileMenu = () => {
        if (!mobileMenu) {
            return;
        }

        mobileMenu.classList.remove("is-open");

        mobileMenu.setAttribute(
            "aria-hidden",
            "true"
        );

        body.classList.remove("no-scroll");

        mobileMenuTriggers.forEach((trigger) => {
            trigger.setAttribute(
                "aria-expanded",
                "false"
            );
        });
    };


    mobileMenuTriggers.forEach((trigger) => {
        trigger.addEventListener(
            "click",
            openMobileMenu
        );
    });


    mobileMenuCloseButtons.forEach((button) => {
        button.addEventListener(
            "click",
            closeMobileMenu
        );
    });


    mobileMenu?.querySelectorAll("a").forEach((link) => {
        link.addEventListener(
            "click",
            closeMobileMenu
        );
    });


    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMobileMenu();
        }
    });


    /*
     * =========================================================
     * MODALS
     * =========================================================
     */

    document.querySelectorAll(
        "[data-modal-open]"
    ).forEach((trigger) => {

        trigger.addEventListener("click", () => {

            const selector =
                trigger.dataset.modalOpen;

            const modal =
                document.querySelector(selector);

            if (!modal) {
                return;
            }

            modal.classList.add("is-open");

            body.classList.add("no-scroll");
        });
    });


    document.querySelectorAll(
        "[data-modal-close]"
    ).forEach((trigger) => {

        trigger.addEventListener("click", () => {

            const modal =
                trigger.closest(".modal");

            if (!modal) {
                return;
            }

            modal.classList.remove("is-open");

            body.classList.remove("no-scroll");
        });
    });
});

/* =========================================================================
   SITE FOOTER
   The behaviour behind includes/footer.html. Vanilla, because this project
   has no React, no Tailwind and no GSAP: what was ported from the component
   the footer design comes from is the effect, not the stack.

   Everything is gated on the footer existing, and nothing runs while it is
   off screen except the three cheap things that must: reveal, scroll-linked
   depth for the giant text, and the magnetic pills on a fine pointer.
   ========================================================================= */
const setupSiteFooter = () => {
    const footer = document.querySelector("[data-site-footer]");

    if (!footer) {
        return;
    }

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

    /* Reveal. One observer, unobserved as it fires; without it the blocks are
       simply visible, because the hidden state is only ever added by CSS that
       this same sheet guards. */
    const stage = footer.closest("[data-footer-stage]") || footer;
    const blocks = footer.querySelectorAll("[data-ft-reveal]");

    if (blocks.length) {
        if (!("IntersectionObserver" in window)) {
            footer.classList.add("is-visible");
            blocks.forEach((block) => block.classList.add("is-revealed"));
        } else {
            // Arm the hidden state only now that an observer exists to undo it.
            footer.classList.add("is-animated");

            // The trigger is the stage, not each block. The footer is fixed to
            // the viewport, so its children are always "in view" as far as an
            // observer is concerned — watching them would fire at page load and
            // the fade would be over before anyone scrolled down to see it.
            const revealer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) {
                        return;
                    }

                    footer.classList.add("is-visible");
                    revealer.disconnect();
                });
            }, { rootMargin: "0px 0px -18% 0px" });

            revealer.observe(stage);
        }
    }

    /* The giant brand text tracks how far the footer has come up the screen.
       The listener only records that a frame is owed; the geometry is read
       once per frame, and only while the footer is near the viewport at all. */
    const giant = footer.querySelector("[data-footer-giant]");

    if (giant && !calm.matches) {
        let owed = false;

        const paint = () => {
            owed = false;

            // The stage is what moves; the pinned footer's box does not.
            const box = stage.getBoundingClientRect();
            const travel = box.height + window.innerHeight;

            if (travel <= 0) {
                return;
            }

            const progress = Math.min(1, Math.max(0, (window.innerHeight - box.top) / travel));
            footer.style.setProperty("--ft-p", progress.toFixed(3));
            footer.classList.toggle("is-visible", progress > 0.08);
        };

        const onScroll = () => {
            if (owed) {
                return;
            }

            owed = true;
            window.requestAnimationFrame(paint);
        };

        const watcher = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    window.addEventListener("scroll", onScroll, { passive: true });
                    window.addEventListener("resize", onScroll, { passive: true });
                    paint();
                } else {
                    window.removeEventListener("scroll", onScroll);
                    window.removeEventListener("resize", onScroll);
                }
            });
        }, { rootMargin: "240px" });

        watcher.observe(stage);
    }

    /* Magnetic pills. Fine pointers only — the same gate the hover styles use,
       so a touch shopper never gets a control that answers to a pointer they
       do not have. */
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");

    if (!fine.matches || calm.matches) {
        return;
    }

    footer.querySelectorAll("[data-magnet]").forEach((pill) => {
        let box = null;
        let owed = false;
        let pointer = null;

        const forget = () => {
            box = null;
        };

        const paint = () => {
            owed = false;

            if (!pointer) {
                return;
            }

            if (!box) {
                box = pill.getBoundingClientRect();
            }

            if (!box.width || !box.height) {
                return;
            }

            const dx = (pointer.x - (box.left + box.width / 2)) * 0.2;
            const dy = (pointer.y - (box.top + box.height / 2)) * 0.26;

            pill.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
            pointer = null;
        };

        const onMove = (event) => {
            pointer = { x: event.clientX, y: event.clientY };

            if (owed) {
                return;
            }

            owed = true;
            window.requestAnimationFrame(paint);
        };

        const reset = () => {
            pointer = null;
            pill.style.transform = "";
        };

        pill.addEventListener("pointerenter", forget, { passive: true });
        pill.addEventListener("pointermove", onMove, { passive: true });
        pill.addEventListener("pointerleave", reset);
        window.addEventListener("scroll", forget, { passive: true });
        pill.classList.add("is-magnetic");
    });
};

/* Run now when the document is already parsed — which it is, because this file
   is loaded with `defer` — and wait for the event only when it is not. This
   block used to wait on DOMContentLoaded unconditionally, and when that event
   has already fired the listener never runs: no reveal arming, no scroll-linked
   depth, no magnetic pills, with nothing in the console to say so. */
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupSiteFooter, { once: true });
} else {
    setupSiteFooter();
}
