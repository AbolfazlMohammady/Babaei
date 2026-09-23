(function () {
    "use strict";

    var root = document.querySelector(".auth-page");
    if (!root) return;

    var card = root.querySelector(".auth-card");
    var reduced = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function digits(value) {
        return String(value || "")
            .replace(/[۰-۹]/g, function (d) {
                return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d));
            })
            .replace(/[٠-٩]/g, function (d) {
                return String("٠١٢٣٤٥٦٧٨٩".indexOf(d));
            })
            .replace(/\D/g, "");
    }

    function initMode() {
        var buttons = [].slice.call(
            root.querySelectorAll("[data-auth-mode-button]")
        );
        if (!buttons.length) return;

        var copy = {
            signin: {
                eyebrow: "SIGN IN",
                title: "وارد حساب شو.",
                lead: "شماره موبایلت را وارد کن؛ کد تأیید برایت ارسال می‌شود."
            },
            signup: {
                eyebrow: "CREATE ACCOUNT",
                title: "حساب خودت را بساز.",
                lead: "شماره موبایلت کافی است؛ حساب با اولین تأیید ساخته می‌شود."
            }
        };

        buttons.forEach(function (button) {
            button.addEventListener("click", function () {
                var mode = button.getAttribute("data-auth-mode-button");

                buttons.forEach(function (item) {
                    var active =
                        item.getAttribute("data-auth-mode-button") === mode;

                    item.classList.toggle("is-active", active);
                    item.setAttribute(
                        "aria-selected",
                        active ? "true" : "false"
                    );
                });

                var e = root.querySelector('[data-auth-copy="eyebrow"]');
                var t = root.querySelector('[data-auth-copy="title"]');
                var l = root.querySelector('[data-auth-copy="lead"]');

                if (e) e.textContent = copy[mode].eyebrow;
                if (t) t.textContent = copy[mode].title;
                if (l) l.textContent = copy[mode].lead;
            });
        });
    }

    function initPhone() {
        var input = document.getElementById("phone");
        if (!input) return;

        input.addEventListener("input", function () {
            input.value = digits(input.value).slice(0, 11);
        });
    }

    function initRouteTransition() {
        var form = root.querySelector("[data-auth-phone-form]");
        if (!form || !card) return;

        form.addEventListener("submit", function (event) {
            if (card.getAttribute("data-auth-transition") === "verify") {
                return;
            }

            event.preventDefault();
            card.setAttribute("data-auth-transition", "verify");

            try {
                sessionStorage.setItem("babaei-auth-transition", "verify");
            } catch (_) {}

            window.setTimeout(function () {
                form.submit();
            }, reduced ? 0 : 320);
        });
    }

    function initVerify() {
        var form = root.querySelector("[data-auth-verify-form]");
        var hidden = document.getElementById("code");
        var inputs = [].slice.call(root.querySelectorAll("[data-otp-digit]"));

        if (!form || !hidden || !inputs.length) return;

        function sync() {
            hidden.value = inputs.map(function (input) {
                return digits(input.value).slice(0, 1);
            }).join("");
        }

        function focusAt(index) {
            if (!inputs[index]) return;
            inputs[index].focus();
            inputs[index].select();
        }

        inputs.forEach(function (input, index) {
            input.addEventListener("input", function () {
                var value = digits(input.value);

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

                var value = digits(
                    event.clipboardData
                        ? event.clipboardData.getData("text")
                        : ""
                ).slice(0, inputs.length);

                value.split("").forEach(function (char, offset) {
                    if (inputs[index + offset]) {
                        inputs[index + offset].value = char;
                    }
                });

                sync();
                focusAt(
                    Math.min(
                        index + Math.max(value.length - 1, 0),
                        inputs.length - 1
                    )
                );
            });
        });

        form.addEventListener("submit", function (event) {
            sync();

            if (hidden.value.length !== inputs.length) {
                event.preventDefault();

                var empty = inputs.findIndex(function (input) {
                    return !input.value;
                });

                focusAt(empty < 0 ? 0 : empty);
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

        var animate = false;

        try {
            animate =
                sessionStorage.getItem("babaei-auth-transition") === "verify";
            sessionStorage.removeItem("babaei-auth-transition");
        } catch (_) {}

        if (!animate || reduced) return;

        card.setAttribute("data-auth-transition", "enter");

        window.setTimeout(function () {
            card.removeAttribute("data-auth-transition");
        }, 480);
    }

    initMode();
    initPhone();
    initRouteTransition();
    initVerify();
    initVerifyEnter();
})();
