document.addEventListener("DOMContentLoaded", () => {
    const video = document.getElementById("home-background-video");
    const accessButton = document.getElementById("home-access-button");
    const ctaWrap = document.getElementById("home-cta-wrap");
    const toast = document.getElementById("home-toast");

    const HLS_URL = "https://stream.mux.com/kimF2ha9zLrX64H00UgLGPflCzNtl1T0215MlAmeOztv8.m3u8";

    if (video) {
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = HLS_URL;
        } else if (window.Hls && window.Hls.isSupported()) {
            const hls = new window.Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 30
            });

            hls.loadSource(HLS_URL);
            hls.attachMedia(video);

            video.addEventListener("error", () => hls.destroy(), { once: true });
        }
    }

    if (!accessButton || !ctaWrap) {
        return;
    }

    let resetTimer = null;
    let typingTimer = null;

    const clearTyping = () => {
        if (typingTimer) {
            clearInterval(typingTimer);
            typingTimer = null;
        }
    };

    const typePlaceholder = (input, value) => {
        clearTyping();
        input.placeholder = "";
        let index = 0;

        typingTimer = window.setInterval(() => {
            input.placeholder = value.slice(0, index + 1);
            index += 1;

            if (index >= value.length) {
                clearTyping();
            }
        }, 60);
    };

    const showToast = (message) => {
        if (!toast) return;

        toast.textContent = message;
        toast.classList.add("is-visible");

        window.setTimeout(() => {
            toast.classList.remove("is-visible");
        }, 2600);
    };

    const renderButton = () => {
        clearTyping();
        ctaWrap.innerHTML = '<button type="button" class="home-cta" id="home-access-button">Get early access</button>';
        document.getElementById("home-access-button").addEventListener("click", openForm);
    };

    const renderForm = () => {
        ctaWrap.innerHTML = `
            <form class="home-email-form" id="home-email-form" novalidate>
                <input class="home-email-input" id="home-email-input" name="email" type="email" autocomplete="email" aria-label="Email address">
                <button class="home-email-submit" type="submit" aria-label="Submit email">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"></path></svg>
                </button>
            </form>
        `;

        const form = document.getElementById("home-email-form");
        const input = document.getElementById("home-email-input");
        const submit = form.querySelector(".home-email-submit");

        input.focus();
        typePlaceholder(input, "Enter Your Email Here For Early Access");

        form.addEventListener("submit", (event) => {
            event.preventDefault();

            if (!input.value.trim() || !input.checkValidity()) {
                input.focus();
                showToast("Please enter a valid email.");
                return;
            }

            clearTyping();
            input.value = "";
            typePlaceholder(input, "You Will Receive Notifications By Email");

            submit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>';

            showToast("Thanks — you are on the early access list.");

            window.clearTimeout(resetTimer);
            resetTimer = window.setTimeout(renderButton, 4000);
        });
    };

    const openForm = () => {
        window.clearTimeout(resetTimer);
        renderForm();
    };

    accessButton.addEventListener("click", openForm);
});
