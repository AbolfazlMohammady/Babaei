(() => {
    "use strict";

    const charactersRoot = document.querySelector("[data-not-found-characters]");
    const canvas = document.querySelector("[data-not-found-canvas]");
    const message = document.querySelector("[data-not-found-message]");
    const backButton = document.querySelector("[data-go-back]");

    if (!charactersRoot || !canvas || !message) {
        return;
    }

    const CHARACTER_SOURCES = [
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

    const activeAnimations = [];

    const createCharacters = () => {
        activeAnimations.forEach((animation) => animation.cancel());
        activeAnimations.length = 0;
        charactersRoot.replaceChildren();

        CHARACTER_SOURCES.forEach((figure, index) => {
            const character = document.createElement("img");
            character.className = "not-found__character";
            character.alt = "";
            character.decoding = "async";
            character.draggable = false;
            character.src = figure.src;

            if (figure.top) character.style.top = figure.top;
            if (figure.bottom) character.style.bottom = figure.bottom;
            if (figure.transform) character.style.transform = figure.transform;

            if (index === CHARACTER_SOURCES.length - 1) {
                character.classList.add("not-found__character--static");
                charactersRoot.appendChild(character);
                return;
            }

            charactersRoot.appendChild(character);

            const horizontal = character.animate(
                [
                    { left: "100%" },
                    { left: "-20%" },
                ],
                {
                    duration: figure.speedX,
                    easing: "linear",
                    fill: "forwards",
                },
            );
            activeAnimations.push(horizontal);

            if (figure.speedRotation) {
                const rotation = character.animate(
                    [
                        { transform: "rotate(0deg)" },
                        { transform: "rotate(-360deg)" },
                    ],
                    {
                        duration: figure.speedRotation,
                        iterations: Infinity,
                        easing: "linear",
                    },
                );
                activeAnimations.push(rotation);
            }
        });
    };

    const context = canvas.getContext("2d");

    if (!context) {
        message.classList.add("is-visible");
        return;
    }

    let frameId = 0;
    let timer = 0;
    let circles = [];

    const resizeCanvas = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = window.innerWidth;
        const height = window.innerHeight;

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";

        context.setTransform(dpr, 0, 0, dpr, 0, 0);

        const size = Math.max(0.8, width / 1000);
        circles = Array.from({ length: 300 }, () => ({
            x: width * (1.2 + Math.random() * 1.8),
            y: height * (-0.2 + Math.random() * 1.2),
            size,
        }));
    };

    const draw = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const distanceX = width / 80;
        const growthRate = width / 1000;

        timer += 1;
        context.clearRect(0, 0, width, height);
        context.fillStyle = "rgba(255, 255, 255, 0.9)";

        for (const circle of circles) {
            if (timer < 65) {
                circle.x -= distanceX;
                circle.size += growthRate;
            } else if (timer < 500) {
                circle.x -= distanceX * 0.02;
                circle.size += growthRate * 0.2;
            }

            context.beginPath();
            context.arc(circle.x, circle.y, circle.size, 0, Math.PI * 2);
            context.fill();
        }

        if (timer >= 500) {
            frameId = 0;
            return;
        }

        frameId = window.requestAnimationFrame(draw);
    };

    const restartCanvasAnimation = () => {
        if (frameId) {
            window.cancelAnimationFrame(frameId);
        }

        timer = 0;
        resizeCanvas();
        draw();
    };

    backButton?.addEventListener("click", () => {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }

        window.location.assign("/");
    });

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!reducedMotion) {
        createCharacters();
        restartCanvasAnimation();
    }

    window.setTimeout(() => {
        message.classList.add("is-visible");
    }, reducedMotion ? 0 : 1200);

    let resizeTimer = 0;
    window.addEventListener("resize", () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            if (!reducedMotion) {
                createCharacters();
                restartCanvasAnimation();
            }
        }, 120);
    });

    window.addEventListener("pagehide", () => {
        if (frameId) {
            window.cancelAnimationFrame(frameId);
        }
        activeAnimations.forEach((animation) => animation.cancel());
    });
})();
