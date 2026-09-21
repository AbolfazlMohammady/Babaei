document.addEventListener("DOMContentLoaded", () => {
    const video = document.getElementById("home-background-video");
    const menuToggle = document.getElementById("home-menu-toggle");
    const mobileMenu = document.getElementById("home-mobile-menu");

    const HLS_URL = "https://stream.mux.com/kimF2ha9zLrX64H00UgLGPflCzNtl1T0215MlAmeOztv8.m3u8";

    if (video) {
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = HLS_URL;
            video.play().catch(() => {});
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

    if (!menuToggle || !mobileMenu) return;

    const closeMenu = () => {
        menuToggle.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
        mobileMenu.classList.remove("is-open");
        mobileMenu.setAttribute("aria-hidden", "true");
        document.body.classList.remove("no-scroll");
    };

    menuToggle.addEventListener("click", () => {
        const open = !mobileMenu.classList.contains("is-open");
        menuToggle.classList.toggle("is-open", open);
        menuToggle.setAttribute("aria-expanded", String(open));
        mobileMenu.classList.toggle("is-open", open);
        mobileMenu.setAttribute("aria-hidden", String(!open));
        document.body.classList.toggle("no-scroll", open);
    });

    mobileMenu.querySelectorAll("[data-home-menu-close]").forEach((element) => {
        element.addEventListener("click", closeMenu);
    });

    mobileMenu.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
    });
});
