document.addEventListener("DOMContentLoaded", () => {
    const slider = document.querySelector(".hero__slider");

    if (!slider) {
        return;
    }

    const slides = Array.from(
        slider.querySelectorAll(".hero__slide")
    );

    const nextButton = document.querySelector(".hero__next");
    const prevButton = document.querySelector(".hero__prev");
    const currentCounter = document.querySelector(".hero__current");

    if (!slides.length) {
        return;
    }

    let currentIndex = 0;
    let autoplayTimer = null;

    const totalSlides = slides.length;

    const updateCounter = () => {
        if (!currentCounter) {
            return;
        }

        currentCounter.textContent = String(
            currentIndex + 1
        ).padStart(2, "0");
    };

    const showSlide = (index) => {
        if (index < 0) {
            index = totalSlides - 1;
        }

        if (index >= totalSlides) {
            index = 0;
        }

        currentIndex = index;

        slides.forEach((slide, slideIndex) => {
            const isActive = slideIndex === currentIndex;

            slide.classList.toggle("is-active", isActive);
            slide.setAttribute("aria-hidden", String(!isActive));
        });

        updateCounter();
    };

    const nextSlide = () => {
        showSlide(currentIndex + 1);
    };

    const previousSlide = () => {
        showSlide(currentIndex - 1);
    };

    const stopAutoplay = () => {
        if (autoplayTimer) {
            clearInterval(autoplayTimer);
            autoplayTimer = null;
        }
    };

    const startAutoplay = () => {
        stopAutoplay();

        if (totalSlides <= 1) {
            return;
        }

        autoplayTimer = setInterval(() => {
            nextSlide();
        }, 6000);
    };

    nextButton?.addEventListener("click", () => {
        nextSlide();
        startAutoplay();
    });

    prevButton?.addEventListener("click", () => {
        previousSlide();
        startAutoplay();
    });

    slider.addEventListener("mouseenter", stopAutoplay);
    slider.addEventListener("mouseleave", startAutoplay);

    slider.addEventListener(
        "touchstart",
        stopAutoplay,
        { passive: true }
    );

    slider.addEventListener(
        "touchend",
        startAutoplay,
        { passive: true }
    );

    /*
     * Initial state
     */

    showSlide(0);
    startAutoplay();
});