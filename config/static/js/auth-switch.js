(function () {
    "use strict";

    var shell = document.querySelector("[data-auth-shell]");
    if (!shell) return;

    var prefersReducedMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function normalizeDigits(value) {
        return String(value || "")
            .replace(/[۰-۹]/g, function (digit) {
                return String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit));
            })
            .replace(/[٠-٩]/g, function (digit) {
                return String("٠١٢٣٤٥٦٧٨٩".indexOf(digit));
            })
            .replace(/\D/g, "");
    }

    function initPhoneNormalization() {
        var input = document.getElementById("phone");
        if (!input) return;

        input.addEventListener("input", function () {
            var normalized = normalizeDigits(input.value).slice(0, 11);
            if (input.value !== normalized) input.value = normalized;
        });
    }

    function initOtpDigits() {
        var digits = [].slice.call(
            shell.querySelectorAll("[data-otp-digit]")
        );
        var hidden = document.getElementById("code");
        if (!digits.length || !hidden) return;

        function syncHidden() {
            hidden.value = digits.map(function (input) {
                return normalizeDigits(input.value).slice(0, 1);
            }).join("");
        }

        function focusAt(index) {
            if (digits[index]) {
                digits[index].focus();
                digits[index].select();
            }
        }

        digits.forEach(function (input, index) {
            input.addEventListener("input", function () {
                var value = normalizeDigits(input.value);

                if (!value) {
                    input.value = "";
                    syncHidden();
                    return;
                }

                input.value = value.slice(-1);
                syncHidden();

                if (index < digits.length - 1) {
                    focusAt(index + 1);
                }
            });

            input.addEventListener("keydown", function (event) {
                if (event.key === "Backspace" && !input.value && index > 0) {
                    focusAt(index - 1);
                }

                if (event.key === "ArrowLeft" && index > 0) {
                    event.preventDefault();
                    focusAt(index - 1);
                }

                if (event.key === "ArrowRight" && index < digits.length - 1) {
                    event.preventDefault();
                    focusAt(index + 1);
                }
            });

            input.addEventListener("paste", function (event) {
                event.preventDefault();

                var pasted = normalizeDigits(
                    event.clipboardData ? event.clipboardData.getData("text") : ""
                ).slice(0, digits.length);

                if (!pasted) return;

                pasted.split("").forEach(function (char, offset) {
                    if (digits[index + offset]) {
                        digits[index + offset].value = char;
                    }
                });

                syncHidden();
                focusAt(Math.min(index + pasted.length, digits.length - 1));
            });
        });

        var form = hidden.closest("form");
        if (form) {
            form.addEventListener("submit", function (event) {
                syncHidden();

                if (hidden.value.length !== digits.length) {
                    event.preventDefault();

                    var firstEmpty = digits.findIndex(function (input) {
                        return !input.value;
                    });

                    focusAt(firstEmpty < 0 ? 0 : firstEmpty);
                }
            });
        }

        window.setTimeout(function () {
            focusAt(0);
        }, 80);
    }

    function initRouteTransition() {
        var phoneForm = shell.querySelector("[data-auth-phone-form]");
        var verificationStep =
            shell.getAttribute("data-auth-step") === "verify";

        if (phoneForm) {
            phoneForm.addEventListener("submit", function (event) {
                if (shell.getAttribute("data-auth-transition") === "verify") {
                    return;
                }

                event.preventDefault();
                shell.setAttribute("data-auth-transition", "verify");

                try {
                    window.sessionStorage.setItem(
                        "babaei-auth-transition",
                        "verify"
                    );
                } catch (_) {}

                var delay = prefersReducedMotion ? 0 : 340;

                window.setTimeout(function () {
                    phoneForm.submit();
                }, delay);
            });
        }

        if (verificationStep) {
            var shouldAnimate = false;

            try {
                shouldAnimate =
                    window.sessionStorage.getItem("babaei-auth-transition") === "verify";
                window.sessionStorage.removeItem("babaei-auth-transition");
            } catch (_) {}

            if (shouldAnimate && !prefersReducedMotion) {
                shell.setAttribute("data-auth-transition", "enter");

                window.setTimeout(function () {
                    shell.removeAttribute("data-auth-transition");
                }, 460);
            }
        }
    }

    var triggers = [].slice.call(shell.querySelectorAll("[data-auth-go]"));
    var panes = [].slice.call(shell.querySelectorAll("[data-auth-pane]"));
    var state = shell.getAttribute("data-auth-state") || "signin";

    function paneNamed(name) {
        return shell.querySelector(
            '[data-auth-pane][data-auth-for="' + name + '"]'
        );
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
            btn.setAttribute(
                "aria-expanded",
                btn.getAttribute("data-auth-go") === state ? "true" : "false"
            );
        });
    }

    function moveFocus(target) {
        var wanted = shell.querySelector(
            '[data-auth-go="' + target + '"][data-auth-focus]'
        );

        if (wanted) {
            var field = document.getElementById(
                wanted.getAttribute("data-auth-focus")
            );

            if (field && !field.closest("[inert]")) {
                field.focus();
                return;
            }
        }

        var pane = paneNamed(target);
        if (pane) pane.focus();
    }

    function apply(next, focus) {
        if (next !== "signin" && next !== "signup") return;
        if (next === state) return;

        state = next;
        shell.setAttribute("data-auth-state", state);
        setA11y();

        if (focus) moveFocus(next);
    }

    triggers.forEach(function (btn) {
        btn.addEventListener("click", function () {
            apply(btn.getAttribute("data-auth-go"), true);
        });
    });

    initPhoneNormalization();
    initOtpDigits();
    initRouteTransition();

    if (window.location.hash === "#signup" && triggers.length) {
        shell.setAttribute("data-auth-state", "signup");
        state = "signup";
    }

    setA11y();
})();
