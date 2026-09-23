(function () {
    "use strict";

    var root = document.querySelector(".auth-page");
    if (!root) return;

    var card = root.querySelector(".auth-card");
    var reduced = window.matchMedia &&
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

    function initPhoneStep() {
        var input = document.getElementById("phone");
        var form = root.querySelector("[data-auth-phone-form]");

        if (input) {
            input.addEventListener("input", function () {
                input.value = normalizeDigits(input.value).slice(0, 11);
            });
        }

        if (!form || !card) return;

        form.addEventListener("submit", function (event) {
            if (card.getAttribute("data-auth-transition") === "verify") {
                return;
            }

            event.preventDefault();

            card.setAttribute("data-auth-transition", "verify");

            try {
                sessionStorage.setItem(
                    "babaei-auth-transition",
                    "verify"
                );
            } catch (_) {}

            window.setTimeout(function () {
                form.submit();
            }, reduced ? 0 : 330);
        });
    }

    function initVerifyStep() {
        var form = root.querySelector("[data-auth-verify-form]");
        var hidden = document.getElementById("code");
        var inputs = [].slice.call(
            root.querySelectorAll("[data-otp-digit]")
        );

        if (!form || !hidden || !inputs.length) return;

        function sync() {
            hidden.value = inputs.map(function (input) {
                return normalizeDigits(input.value).slice(0, 1);
            }).join("");
        }

        function focusAt(index) {
            if (!inputs[index]) return;
            inputs[index].focus();
            inputs[index].select();
        }

        inputs.forEach(function (input, index) {
            input.addEventListener("input", function () {
                var value = normalizeDigits(input.value);

                if (!value) {
                    input.value = "";
                    sync();
                    return;
                }

                input.value = value.slice(-1);
                sync();

                if (index < inputs.length - 1) {
                    focusAt(index + 1);
                }
            });

            input.addEventListener("keydown", function (event) {
                if (event.key === "Backspace" && !input.value && index > 0) {
                    event.preventDefault();
                    focusAt(index - 1);
                }

                if (event.key === "ArrowLeft" && index > 0) {
                    event.preventDefault();
                    focusAt(index - 1);
                }

                if (event.key === "ArrowRight" && index < inputs.length - 1) {
                    event.preventDefault();
                    focusAt(index + 1);
                }
            });

            input.addEventListener("paste", function (event) {
                event.preventDefault();

                var pasted = normalizeDigits(
                    event.clipboardData
                        ? event.clipboardData.getData("text")
                        : ""
                ).slice(0, inputs.length);

                pasted.split("").forEach(function (char, offset) {
                    if (inputs[index + offset]) {
                        inputs[index + offset].value = char;
                    }
                });

                sync();

                if (pasted) {
                    focusAt(
                        Math.min(
                            index + pasted.length,
                            inputs.length - 1
                        )
                    );
                }
            });
        });

        form.addEventListener("submit", function (event) {
            sync();

            if (hidden.value.length !== inputs.length) {
                event.preventDefault();

                var emptyIndex = inputs.findIndex(function (input) {
                    return !input.value;
                });

                focusAt(emptyIndex < 0 ? 0 : emptyIndex);
            }
        });

        window.setTimeout(function () {
            focusAt(0);
        }, 90);
    }

    function initVerifyEnter() {
        if (!root.classList.contains("auth-page--verify") || !card) {
            return;
        }

        var shouldAnimate = false;

        try {
            shouldAnimate =
                sessionStorage.getItem("babaei-auth-transition") === "verify";

            sessionStorage.removeItem("babaei-auth-transition");
        } catch (_) {}

        if (!shouldAnimate || reduced) return;

        card.setAttribute("data-auth-transition", "enter");

        window.setTimeout(function () {
            card.removeAttribute("data-auth-transition");
        }, 440);
    }

    initPhoneStep();
    initVerifyStep();
    initVerifyEnter();
})();
