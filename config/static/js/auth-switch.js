/* ==========================================================================
   BABAEI — auth switch
   --------------------------------------------------------------------------
   Drives the two-state composition on the sign-in page: one shell, a cream
   column carrying the form and a forest "field" carrying the invitation. The
   state lives in a single attribute on the shell (data-auth-state), so every
   thing the eye sees — the sweep of the field, the cross-fade of the two
   panes, the cross-fade of the two invitations — is CSS reacting to one
   attribute change. Nothing here touches the auth contract: the form still
   posts phone/code to the same URLs.

   Accessibility contract this file maintains:
     * the switch is a pair of real <button>s carrying aria-expanded +
       aria-controls, both on screen (aria-expanded describes the pane each
       button opens)
     * the pane that is not on screen gets `inert` (out of the tab order, out
       of the accessibility tree) and aria-hidden="true"
     * focus follows the swap, because the pressed button is inside the layer
       that just went off-canvas
     * the markup ships in the correct default state, so the page is usable
       and coherent before this file runs
   ========================================================================== */

(function () {
    "use strict";

    var shell = document.querySelector("[data-auth-shell]");
    if (!shell) return;

    var triggers = [].slice.call(shell.querySelectorAll("[data-auth-go]"));
    /* No triggers (the verification step): the page is a single state, and the
       only swap is a real link back to the phone step. Nothing to do. */
    if (!triggers.length) return;

    var panes = [].slice.call(shell.querySelectorAll("[data-auth-pane]"));
    var layers = [].slice.call(shell.querySelectorAll("[data-auth-for]"));
    var state = shell.getAttribute("data-auth-state") || "signin";

    function paneNamed(name) {
        return shell.querySelector('[data-auth-pane][data-auth-for="' + name + '"]');
    }

    function setA11y() {
        panes.forEach(function (pane) {
            var on = pane.getAttribute("data-auth-for") === state;
            pane.setAttribute("aria-hidden", on ? "false" : "true");
            if (on) {
                pane.removeAttribute("inert");
            } else {
                pane.setAttribute("inert", "");
            }
        });
        triggers.forEach(function (btn) {
            btn.setAttribute("aria-expanded",
                btn.getAttribute("data-auth-go") === state ? "true" : "false");
        });
    }

    function moveFocus(target) {
        var wanted = shell.querySelector(
            '[data-auth-go="' + target + '"][data-auth-focus]');
        if (wanted) {
            var field = document.getElementById(wanted.getAttribute("data-auth-focus"));
            if (field && !field.closest("[inert]")) {
                field.focus();
                return;
            }
        }
        /* The pane itself is the tab stop of last resort: it is tabindex="-1"
           and labelled by its own heading, so the swap is announced. */
        var pane = paneNamed(target);
        if (pane) pane.focus();
    }

    function apply(next, focus) {
        if (next !== "signin" && next !== "signup") return;
        if (next === state) return;
        state = next;
        /* One attribute change; CSS owns every pixel of the transition. */
        shell.setAttribute("data-auth-state", state);
        setA11y();
        if (focus) moveFocus(next);
    }

    triggers.forEach(function (btn) {
        btn.addEventListener("click", function () {
            apply(btn.getAttribute("data-auth-go"), true);
        });
    });

    /* A deep link (#signup) opens that side directly: the anchor form of the
       invitation works even where the script has not run yet. */
    if (window.location.hash === "#signup") {
        shell.setAttribute("data-auth-state", "signup");
        state = "signup";
    }
    setA11y();
})();
