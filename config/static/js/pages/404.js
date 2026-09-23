(() => {
    "use strict";

    const charactersRoot = document.querySelector("[data-not-found-characters]");
    const canvas = document.querySelector("[data-not-found-canvas]");
    const message = document.querySelector("[data-not-found-message]");
    const backButton = document.querySelector("[data-go-back]");

    if (!charactersRoot || !canvas || !message) return;

    const stickFigures = [
        {
            top: "0%",
            src: "https://cdn.21st.dev/assets/mirror/54/54f366bdbf75b7a2d3b9f2264c3ada12aefcaf6e6a467bcecc856ffcd686e52e.svg",
            transform: "rotateZ(-90deg)",
            speedX: 1500,
        },
        {
            top: "10%",
            src: "https://cdn.21st.dev/assets/mirror/7e/7e48603d6fd3fac9720b25b4b6a06d107feea2d21ef8fa0720921808b9808514.svg",
            speedX: 3000,
            speedRotation: 2000,
        },
        {
            top: "20%",
            src: "https://cdn.21st.dev/assets/mirror/4f/4fd3a604a36cc8811c341ef3221010ed11e2563d4add29901922d7464c28c186.svg",
            speedX: 5000,
            speedRotation: 1000,
        },
        {
            top: "25%",
            src: "https://cdn.21st.dev/assets/mirror/54/54f366bdbf75b7a2d3b9f2264c3ada12aefcaf6e6a467bcecc856ffcd686e52e.svg",
            speedX: 2500,
            speedRotation: 1500,
        },
        {
            top: "35%",
            src: "https://cdn.21st.dev/assets/mirror/54/54f366bdbf75b7a2d3b9f2264c3ada12aefcaf6e6a467bcecc856ffcd686e52e.svg",
            speedX: 2000,
            speedRotation: 300,
        },
        {
            bottom: "5%",
            src: "https://cdn.21st.dev/assets/mirror/66/668d66f4c4d1dbc5c421692b4e5ad644c0f11f0327da214bcae21f78816c6b2f.svg",
            speedX: 0,
        },
    ];

    const animations = [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.matchMedia("(max-width: 640px)").matches;

    function createCharacters() {
        animations.forEach((animation) => animation.cancel());
        animations.length = 0;
        charactersRoot.replaceChildren();

        stickFigures.forEach((figure, index) => {
            const stick = document.createElement("img");
            stick.className = "not-found__character";
            stick.alt = "";
            stick.draggable = false;
            stick.decoding = "async";
            stick.src = figure.src;

            if (figure.top) stick.style.top = figure.top;
            if (figure.bottom) stick.style.bottom = figure.bottom;
            if (figure.transform) stick.style.transform = figure.transform;

            charactersRoot.appendChild(stick);

            if (index === 5) return;

            // Transform-based movement avoids repeatedly triggering layout/reflow.
            animations.push(
                stick.animate(
                    [
                        { transform: "translate3d(100%, 0, 0)" },
                        { transform: "translate3d(-20%, 0, 0)" },
                    ],
                    {
                        duration: figure.speedX,
                        easing: "linear",
                        fill: "forwards",
                        composite: "add",
                    },
                ),
            );

            if (index !== 0 && figure.speedRotation) {
                animations.push(
                    stick.animate(
                        [
                            { transform: "rotate(0deg)" },
                            { transform: "rotate(-360deg)" },
                        ],
                        {
                            duration: figure.speedRotation,
                            iterations: Infinity,
                            easing: "linear",
                            composite: "add",
                        },
                    ),
                );
            }
        });
    }

    const context = canvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
    });

    if (!context) {
        message.classList.add("is-visible");
        return;
    }

    let frameId = 0;
    let timer = 0;
    let circles = [];
    let animationRunning = false;

    function initCircles() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const count = isMobile ? 180 : 300;

        circles = Array.from({ length: count }, () => ({
            x: width * (1.2 + Math.random() * 1.8),
            y: height * (-0.2 + Math.random() * 1.2),
            size: width / 1000,
        }));
    }

    function draw() {
        if (!animationRunning) return;

        const width = window.innerWidth;
        const height = window.innerHeight;
        const distanceX = width / 80;
        const growthRate = width / 1000;

        timer += 1;

        context.clearRect(0, 0, width, height);
        context.beginPath();

        for (const circle of circles) {
            if (timer < 65) {
                circle.x -= distanceX;
                circle.size += growthRate;
            } else if (timer < 500) {
                circle.x -= distanceX * 0.02;
                circle.size += growthRate * 0.2;
            }

            context.moveTo(circle.x + circle.size, circle.y);
            context.arc(circle.x, circle.y, circle.size, 0, Math.PI * 2);
        }

        context.fill();

        if (timer >= 500) {
            animationRunning = false;
            frameId = 0;
            return;
        }

        frameId = requestAnimationFrame(draw);
    }

    function restartCanvas() {
        if (frameId) cancelAnimationFrame(frameId);

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        timer = 0;
        animationRunning = true;
        initCircles();
        draw();
    }

    function stopCanvas() {
        animationRunning = false;

        if (frameId) {
            cancelAnimationFrame(frameId);
            frameId = 0;
        }
    }

    backButton?.addEventListener("click", () => {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.assign("/");
        }
    });

    if (!reducedMotion) {
        createCharacters();
        restartCanvas();
    }

    window.setTimeout(() => {
        message.classList.add("is-visible");
    }, reducedMotion ? 0 : 1200);

    let resizeTimer = 0;

    window.addEventListener("resize", () => {
        window.clearTimeout(resizeTimer);

        resizeTimer = window.setTimeout(() => {
            // Characters use percentage-based positioning, so they don't need
            // to be recreated on every resize. Only resize the canvas.
            if (!reducedMotion) {
                restartCanvas();
            }
        }, 160);
    }, { passive: true });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopCanvas();
            return;
        }

        if (!reducedMotion && timer < 500) {
            animationRunning = true;
            frameId = requestAnimationFrame(draw);
        }
    });

    window.addEventListener("pagehide", () => {
        stopCanvas();
        animations.forEach((animation) => animation.cancel());
    }, { passive: true });
})();
