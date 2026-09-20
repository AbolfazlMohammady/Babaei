(() => {
    "use strict";

    const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
    const lerp = (from, to, progress) => from + (to - from) * progress;
    const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);
    const easeInOutCubic = (value) => value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const onReady = (callback) => {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
            return;
        }
        callback();
    };

    const setupHeroSlider = () => {
        const slider = document.querySelector(".hero__slider");
        if (!slider) return;

        const slides = Array.from(slider.querySelectorAll(".hero__slide"));
        if (slides.length <= 1) {
            slides.forEach((slide) => {
                slide.classList.add("is-active");
                slide.setAttribute("aria-hidden", "false");
            });
            return;
        }

        const nextButton = slider.querySelector(".hero__next");
        const prevButton = slider.querySelector(".hero__prev");
        const currentCounter = slider.querySelector(".hero__current");
        let currentIndex = 0;
        let timer = null;

        const showSlide = (index) => {
            currentIndex = (index + slides.length) % slides.length;
            slides.forEach((slide, slideIndex) => {
                const active = slideIndex === currentIndex;
                slide.classList.toggle("is-active", active);
                slide.setAttribute("aria-hidden", String(!active));
            });
            if (currentCounter) {
                currentCounter.textContent = String(currentIndex + 1).padStart(2, "0");
            }
        };

        const stop = () => {
            if (timer !== null) {
                window.clearInterval(timer);
                timer = null;
            }
        };

        const start = () => {
            stop();
            timer = window.setInterval(() => showSlide(currentIndex + 1), 6500);
        };

        nextButton?.addEventListener("click", () => { showSlide(currentIndex + 1); start(); });
        prevButton?.addEventListener("click", () => { showSlide(currentIndex - 1); start(); });
        slider.addEventListener("mouseenter", stop);
        slider.addEventListener("mouseleave", start);
        slider.addEventListener("touchstart", stop, { passive: true });
        slider.addEventListener("touchend", start, { passive: true });

        showSlide(0);
        start();
    };

    const setupReveals = () => {
        const elements = Array.from(document.querySelectorAll(
            ".home-page .category-card, " +
            ".home-page .label-story__intro, " +
            ".home-page .label-story__outro, " +
            ".home-page .feature-banner__item, " +
            ".home-page .trust__item, " +
            ".home-page .product-card"
        ));

        if (!elements.length) return;

        if (prefersReducedMotion || !("IntersectionObserver" in window)) {
            elements.forEach((element) => element.classList.add("is-motion-visible"));
            return;
        }

        const observer = new IntersectionObserver((entries, currentObserver) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-motion-visible");
                currentObserver.unobserve(entry.target);
            });
        }, { threshold: 0.14, rootMargin: "0px 0px -9% 0px" });

        elements.forEach((element) => observer.observe(element));
    };

    const setupScrollMotion = () => {
        const hero = document.querySelector("[data-home-hero]");
        const story = document.querySelector("[data-label-story]");
        const storyScene = story?.querySelector(".label-story__scene");
        const storyGarment = story?.querySelector(".label-story__garment");
        const storyHalo = story?.querySelector(".label-story__halo");
        const storyTarget = story?.querySelector(".label-story__target");
        const storyLabel = story?.querySelector("[data-label-piece]");
        const finalStory = document.querySelector("[data-motion-story]");
        const finalStoryImage = finalStory?.querySelector(".story__image img");

        if (!hero && !story && !finalStory) return;

        let frame = 0;
        const metrics = {
            heroHeight: 1,
            storyStart: 0,
            storyTravel: 1,
            labelFinalX: 0,
            labelFinalY: 0,
            labelStartX: 0,
            labelStartY: 0,
            storySceneHeight: 1,
            storySceneWidth: 1,
        };

        const measure = () => {
            if (hero) {
                metrics.heroHeight = Math.max(1, hero.getBoundingClientRect().height);
            }

            if (story && storyScene && storyTarget && storyLabel) {
                const storyRect = story.getBoundingClientRect();
                const sceneRect = storyScene.getBoundingClientRect();
                const targetRect = storyTarget.getBoundingClientRect();
                const labelWidth = storyLabel.offsetWidth;
                const labelHeight = storyLabel.offsetHeight;

                metrics.storyStart = storyRect.top + window.scrollY - window.innerHeight * 0.12;
                metrics.storyTravel = Math.max(window.innerHeight * 1.02, story.offsetHeight - window.innerHeight * 0.6);
                metrics.labelFinalX = targetRect.left - sceneRect.left + (targetRect.width - labelWidth) / 2;
                metrics.labelFinalY = targetRect.top - sceneRect.top + (targetRect.height - labelHeight) / 2;
                metrics.storySceneHeight = sceneRect.height;
                metrics.storySceneWidth = sceneRect.width;
                metrics.labelStartX = -sceneRect.width * (window.innerWidth <= 780 ? 0.34 : 0.47);
                metrics.labelStartY = metrics.labelFinalY - sceneRect.height * (window.innerWidth <= 780 ? 0.22 : 0.27);
            }
        };

        const update = () => {
            frame = 0;
            const scrollY = window.scrollY;

            if (hero) {
                const progress = clamp(scrollY / metrics.heroHeight);
                const eased = easeOutCubic(progress);
                const heroContent = hero.querySelector(".hero__content");

                hero.style.setProperty("--hero-bg-y", Math.round(progress * 30) + "px");
                hero.style.setProperty("--hero-art-x", Math.round(progress * -18) + "px");
                hero.style.setProperty("--hero-art-y", Math.round(progress * 62) + "px");
                hero.style.setProperty("--hero-art-scale", (1 + eased * 0.075).toFixed(4));
                hero.style.setProperty("--hero-copy-y", Math.round(progress * -42) + "px");
                hero.style.setProperty("--hero-copy-scale", (1 - progress * 0.018).toFixed(4));
                hero.style.setProperty("--scroll-line-scale", (1 - progress * 0.6).toFixed(3));
                hero.style.setProperty("--scroll-line-opacity", (1 - progress * 0.8).toFixed(3));

                if (heroContent) {
                    heroContent.style.opacity = String(1 - clamp(progress / 0.9));
                }
            }

            if (story && storyScene && storyGarment && storyLabel && storyTarget) {
                const progress = prefersReducedMotion ? 1 : clamp((scrollY - metrics.storyStart) / metrics.storyTravel);
                const approach = easeInOutCubic(clamp(progress / 0.92));
                const settle = clamp((progress - 0.84) / 0.16);
                const x = lerp(metrics.labelStartX, metrics.labelFinalX, approach);
                const y = lerp(metrics.labelStartY, metrics.labelFinalY, approach);
                const rotation = -14 + 14 * approach - settle * 1.8;
                const scale = 0.84 + approach * 0.16 + settle * 0.012;
                const garmentY = lerp(18, -14, easeOutCubic(progress));
                const garmentScale = lerp(0.975, 1.035, easeOutCubic(progress));

                storyLabel.style.setProperty("--label-x", x.toFixed(2) + "px");
                storyLabel.style.setProperty("--label-y", y.toFixed(2) + "px");
                storyLabel.style.setProperty("--label-r", rotation.toFixed(2) + "deg");
                storyLabel.style.setProperty("--label-s", scale.toFixed(4));
                storyLabel.style.setProperty("--label-opacity", clamp((progress + 0.08) * 4.2).toFixed(3));
                storyGarment.style.setProperty("--garment-motion-y", garmentY.toFixed(2) + "px");
                storyGarment.style.setProperty("--garment-motion-scale", garmentScale.toFixed(4));
                storyHalo?.style.setProperty("--halo-y", Math.round(lerp(14, -18, progress)) + "px");
                story.style.setProperty("--story-progress", progress.toFixed(3));
                story.style.setProperty("--target-opacity", clamp((0.74 - progress) * 2.5).toFixed(3));
                story.style.setProperty("--outro-y", Math.round(lerp(22, 0, settle)) + "px");
                story.style.setProperty("--outro-opacity", clamp((progress - 0.68) / 0.22).toFixed(3));
            }

            if (finalStory && finalStoryImage) {
                const rect = finalStory.getBoundingClientRect();
                const viewportProgress = clamp((window.innerHeight - rect.top) / (window.innerHeight + rect.height));
                finalStoryImage.style.setProperty("--story-image-y", Math.round(lerp(24, -24, viewportProgress)) + "px");
            }
        };

        const requestUpdate = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(update);
        };

        measure();
        update();

        window.addEventListener("resize", () => { measure(); requestUpdate(); }, { passive: true });

        if (!prefersReducedMotion) {
            window.addEventListener("scroll", requestUpdate, { passive: true });
        }
    };

    onReady(() => {
        setupHeroSlider();
        setupReveals();
        setupScrollMotion();
    });
})();