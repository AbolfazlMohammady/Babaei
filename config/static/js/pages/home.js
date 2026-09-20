(() => {
    "use strict";

    const clamp = (value, min = 0, max = 1) =>
        Math.min(max, Math.max(min, value));

    const lerp = (from, to, progress) =>
        from + (to - from) * progress;

    const easeOutCubic = (value) =>
        1 - Math.pow(1 - value, 3);

    const easeInOutCubic = (value) =>
        value < 0.5
            ? 4 * value * value * value
            : 1 - Math.pow(-2 * value + 2, 3) / 2;

    const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    const onReady = (callback) => {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, {
                once: true,
            });
            return;
        }

        callback();
    };

    const setupHeroSlider = () => {
        const slider = document.querySelector(".hero__slider");

        if (!slider) return;

        const slides = Array.from(
            slider.querySelectorAll(".hero__slide")
        );

        if (slides.length <= 1) {
            slides.forEach((slide) => {
                slide.classList.add("is-active");
                slide.setAttribute("aria-hidden", "false");
            });

            return;
        }

        const nextButton = slider.querySelector(".hero__next");
        const prevButton = slider.querySelector(".hero__prev");
        const currentCounter = slider.querySelector(
            ".hero__current"
        );

        let currentIndex = 0;
        let timer = null;

        const showSlide = (index) => {
            currentIndex =
                (index + slides.length) % slides.length;

            slides.forEach((slide, slideIndex) => {
                const active =
                    slideIndex === currentIndex;

                slide.classList.toggle(
                    "is-active",
                    active
                );

                slide.setAttribute(
                    "aria-hidden",
                    String(!active)
                );
            });

            if (currentCounter) {
                currentCounter.textContent = String(
                    currentIndex + 1
                ).padStart(2, "0");
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

            timer = window.setInterval(() => {
                showSlide(currentIndex + 1);
            }, 6500);
        };

        nextButton?.addEventListener("click", () => {
            showSlide(currentIndex + 1);
            start();
        });

        prevButton?.addEventListener("click", () => {
            showSlide(currentIndex - 1);
            start();
        });

        slider.addEventListener("mouseenter", stop);
        slider.addEventListener("mouseleave", start);

        slider.addEventListener(
            "touchstart",
            stop,
            { passive: true }
        );

        slider.addEventListener(
            "touchend",
            start,
            { passive: true }
        );

        showSlide(0);
        start();
    };

    const setupReveals = () => {
        const elements = Array.from(
            document.querySelectorAll(
                ".home-page .category-card, " +
                ".home-page .label-story__intro, " +
                ".home-page .label-story__outro, " +
                ".home-page .feature-banner__item, " +
                ".home-page .trust__item, " +
                ".home-page .product-card"
            )
        );

        if (!elements.length) return;

        if (
            prefersReducedMotion ||
            !("IntersectionObserver" in window)
        ) {
            elements.forEach((element) => {
                element.classList.add(
                    "is-motion-visible"
                );
            });

            return;
        }

        const observer = new IntersectionObserver(
            (entries, currentObserver) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;

                    entry.target.classList.add(
                        "is-motion-visible"
                    );

                    currentObserver.unobserve(
                        entry.target
                    );
                });
            },
            {
                threshold: 0.14,
                rootMargin: "0px 0px -9% 0px",
            }
        );

        elements.forEach((element) => {
            observer.observe(element);
        });
    };

    const setupScrollMotion = () => {
        const hero = document.querySelector(
            "[data-home-hero]"
        );

        const categories = Array.from(
            document.querySelectorAll(
                "[data-parallax-card]"
            )
        );

        const story = document.querySelector(
            "[data-label-story]"
        );

        const storyScene = story?.querySelector(
            ".label-story__scene"
        );

        const storyGarment = story?.querySelector(
            ".label-story__garment"
        );

        const storyHalo = story?.querySelector(
            ".label-story__halo"
        );

        const storyTarget = story?.querySelector(
            ".label-story__target"
        );

        const storyLabel = story?.querySelector(
            "[data-label-piece]"
        );

        const storyGuides = story
            ? Array.from(
                story.querySelectorAll(
                    ".label-story__guide"
                )
            )
            : [];

        const finalStory = document.querySelector(
            "[data-motion-story]"
        );

        const finalStoryImage = finalStory?.querySelector(
            ".story__image img"
        );

        if (
            !hero &&
            !categories.length &&
            !story &&
            !finalStory
        ) {
            return;
        }

        let frame = 0;

        const metrics = {
            heroHeight: 1,
            storyStart: 0,
            storyTravel: 1,
            labelFinalX: 0,
            labelFinalY: 0,
            labelStartX: 0,
            labelStartY: 0,
        };

        const measure = () => {
            if (hero) {
                metrics.heroHeight = Math.max(
                    1,
                    hero.getBoundingClientRect().height
                );
            }

            if (
                story &&
                storyScene &&
                storyTarget &&
                storyLabel
            ) {
                const storyRect =
                    story.getBoundingClientRect();

                const sceneRect =
                    storyScene.getBoundingClientRect();

                const targetRect =
                    storyTarget.getBoundingClientRect();

                const labelWidth =
                    storyLabel.offsetWidth;

                const labelHeight =
                    storyLabel.offsetHeight;

                metrics.storyStart =
                    storyRect.top +
                    window.scrollY -
                    window.innerHeight * 0.10;

                metrics.storyTravel = Math.max(
                    window.innerHeight * 1.18,
                    story.offsetHeight -
                        window.innerHeight * 0.44
                );

                metrics.labelFinalX =
                    targetRect.left -
                    sceneRect.left +
                    (targetRect.width -
                        labelWidth) /
                        2;

                metrics.labelFinalY =
                    targetRect.top -
                    sceneRect.top +
                    (targetRect.height -
                        labelHeight) /
                        2;

                metrics.labelStartX =
                    -sceneRect.width *
                    (
                        window.innerWidth <= 780
                            ? 0.48
                            : 0.62
                    );

                metrics.labelStartY =
                    metrics.labelFinalY -
                    sceneRect.height *
                    (
                        window.innerWidth <= 780
                            ? 0.22
                            : 0.30
                    );
            }
        };

        const updateCategories = () => {
            if (
                prefersReducedMotion ||
                !categories.length
            ) {
                return;
            }

            const viewportCenter =
                window.innerHeight * 0.56;

            categories.forEach((card, index) => {
                const rect =
                    card.getBoundingClientRect();

                const cardCenter =
                    rect.top + rect.height * 0.5;

                const distance =
                    (cardCenter -
                        viewportCenter) /
                    window.innerHeight;

                const drift = clamp(
                    -distance * 22,
                    -18,
                    18
                );

                const secondary =
                    (index - 1.5) * 2;

                card.style.setProperty(
                    "--category-drift",
                    (
                        drift +
                        secondary
                    ).toFixed(2) + "px"
                );

                const imageOffset =
                    clamp(
                        -distance * 24,
                        -22,
                        22
                    );

                card.style.setProperty(
                    "--card-parallax",
                    imageOffset.toFixed(2) + "px"
                );
            });
        };

        const update = () => {
            frame = 0;

            const scrollY = window.scrollY;

            if (hero) {
                const progress = clamp(
                    scrollY / metrics.heroHeight
                );

                const eased =
                    easeOutCubic(progress);

                hero.style.setProperty(
                    "--hero-bg-y",
                    Math.round(
                        progress * 36
                    ) + "px"
                );

                hero.style.setProperty(
                    "--hero-art-x",
                    Math.round(
                        progress * -22
                    ) + "px"
                );

                hero.style.setProperty(
                    "--hero-art-y",
                    Math.round(
                        progress * 68
                    ) + "px"
                );

                hero.style.setProperty(
                    "--hero-art-scale",
                    (
                        1 +
                        eased * 0.08
                    ).toFixed(4)
                );

                hero.style.setProperty(
                    "--hero-shadow-scale",
                    (
                        1 -
                        eased * 0.14
                    ).toFixed(4)
                );

                hero.style.setProperty(
                    "--hero-copy-x",
                    Math.round(
                        progress * -16
                    ) + "px"
                );

                hero.style.setProperty(
                    "--hero-copy-y",
                    Math.round(
                        progress * -44
                    ) + "px"
                );

                hero.style.setProperty(
                    "--hero-copy-scale",
                    (
                        1 -
                        progress * 0.015
                    ).toFixed(4)
                );

                hero.style.setProperty(
                    "--hero-copy-opacity",
                    (
                        1 -
                        clamp(progress / 0.82)
                    ).toFixed(3)
                );

                hero.style.setProperty(
                    "--hero-line-scale",
                    (
                        1 -
                        progress * 0.58
                    ).toFixed(3)
                );

                hero.style.setProperty(
                    "--scroll-line",
                    (
                        1 -
                        progress * 0.72
                    ).toFixed(3)
                );

                hero.style.setProperty(
                    "--hero-memory-y",
                    Math.round(
                        progress * -24
                    ) + "px"
                );
            }

            updateCategories();

            if (
                story &&
                storyScene &&
                storyGarment &&
                storyLabel &&
                storyTarget
            ) {
                const progress =
                    prefersReducedMotion
                        ? 1
                        : clamp(
                            (
                                scrollY -
                                metrics.storyStart
                            ) /
                            metrics.storyTravel
                        );

                const approach =
                    easeInOutCubic(
                        clamp(
                            progress / 0.88
                        )
                    );

                const settle =
                    clamp(
                        (progress - 0.78) /
                        0.22
                    );

                const x = lerp(
                    metrics.labelStartX,
                    metrics.labelFinalX,
                    approach
                );

                const y = lerp(
                    metrics.labelStartY,
                    metrics.labelFinalY,
                    approach
                );

                const rotation =
                    -14 +
                    14 * approach -
                    settle * 1.4;

                const scale =
                    0.82 +
                    approach * 0.18 +
                    settle * 0.012;

                const garmentY =
                    lerp(
                        24,
                        -18,
                        easeOutCubic(progress)
                    );

                const garmentScale =
                    lerp(
                        0.965,
                        1.035,
                        easeOutCubic(progress)
                    );

                const guideVisibility =
                    clamp(
                        (progress - 0.25) /
                        0.42
                    );

                storyLabel.style.transform =
                    "translate3d(" +
                    x.toFixed(2) +
                    "px, " +
                    y.toFixed(2) +
                    "px, 0) rotate(" +
                    rotation.toFixed(2) +
                    "deg) scale(" +
                    scale.toFixed(4) +
                    ")";

                storyLabel.style.opacity =
                    String(
                        clamp(
                            (progress + 0.04) * 5
                        )
                    );

                storyGarment.style.setProperty(
                    "--garment-y",
                    garmentY.toFixed(2) + "px"
                );

                storyGarment.style.setProperty(
                    "--garment-scale",
                    garmentScale.toFixed(4)
                );

                storyHalo?.style.setProperty(
                    "--halo-y",
                    Math.round(
                        lerp(
                            18,
                            -28,
                            progress
                        )
                    ) + "px"
                );

                storyHalo?.style.setProperty(
                    "--halo-scale",
                    (
                        1 +
                        progress * 0.06
                    ).toFixed(4)
                );

                story.style.setProperty(
                    "--story-progress",
                    progress.toFixed(3)
                );

                story.style.setProperty(
                    "--target-opacity",
                    clamp(
                        (
                            0.68 -
                            progress
                        ) * 2.7
                    ).toFixed(3)
                );

                story.style.setProperty(
                    "--scene-line-scale",
                    (
                        1 -
                        progress * 0.34
                    ).toFixed(3)
                );

                storyGuides.forEach(
                    (guide, index) => {
                        const start =
                            0.40 +
                            index * 0.13;

                        const visibility =
                            clamp(
                                (
                                    progress -
                                    start
                                ) / 0.17
                            );

                        const delayY =
                            18 -
                            visibility * 18;

                        guide.style.setProperty(
                            "--guide-y",
                            delayY.toFixed(2) +
                            "px"
                        );

                        guide.style.setProperty(
                            "--guide-opacity",
                            (
                                guideVisibility *
                                visibility
                            ).toFixed(3)
                        );
                    }
                );

                story.style.setProperty(
                    "--outro-y",
                    Math.round(
                        lerp(
                            24,
                            0,
                            settle
                        )
                    ) + "px"
                );

                story.style.setProperty(
                    "--outro-opacity",
                    clamp(
                        (progress - 0.72) /
                        0.20
                    ).toFixed(3)
                );
            }

            if (
                finalStory &&
                finalStoryImage &&
                !prefersReducedMotion
            ) {
                const rect =
                    finalStory.getBoundingClientRect();

                const viewportProgress =
                    clamp(
                        (
                            window.innerHeight -
                            rect.top
                        ) /
                        (
                            window.innerHeight +
                            rect.height
                        )
                    );

                finalStoryImage.style.setProperty(
                    "--story-image-y",
                    Math.round(
                        lerp(
                            28,
                            -28,
                            viewportProgress
                        )
                    ) + "px"
                );
            }
        };

        const requestUpdate = () => {
            if (frame) return;

            frame =
                window.requestAnimationFrame(
                    update
                );
        };

        measure();
        update();

        window.addEventListener(
            "resize",
            () => {
                measure();
                requestUpdate();
            },
            { passive: true }
        );

        if (!prefersReducedMotion) {
            window.addEventListener(
                "scroll",
                requestUpdate,
                { passive: true }
            );
        }
    };

    onReady(() => {
        setupHeroSlider();
        setupReveals();
        setupScrollMotion();
    });
})();