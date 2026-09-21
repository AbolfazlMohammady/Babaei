(() => {
    const canvas = document.querySelector('[data-particle-field]');
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];
    let raf = 0;
    let last = performance.now();

    const palette = [
        [242, 190, 72],
        [190, 211, 90],
        [42, 196, 108],
        [46, 136, 214],
        [120, 96, 225],
        [242, 190, 72]
    ];

    const random = (min, max) => min + Math.random() * (max - min);
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    function makeParticle() {
        return {
            u: Math.random(),
            v: Math.random(),
            seed: Math.random() * Math.PI * 2,
            speed: random(.00008, .00022),
            size: random(.55, 1.65),
            alpha: random(.28, .92),
            color: Math.random(),
            drift: random(-1, 1)
        };
    }

    function resize() {
        const rect = canvas.getBoundingClientRect();
        width = Math.max(1, rect.width);
        height = Math.max(1, rect.height);
        dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Gemini-like density: many tiny particles, but still reasonable for mobile.
        const count = width < 700 ? 1800 : 4300;
        particles = Array.from({ length: count }, makeParticle);
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function paletteColor(t) {
        const p = (t % 1 + 1) % 1 * (palette.length - 1);
        const i = Math.floor(p);
        const n = Math.min(i + 1, palette.length - 1);
        const f = p - i;
        return [
            Math.round(lerp(palette[i][0], palette[n][0], f)),
            Math.round(lerp(palette[i][1], palette[n][1], f)),
            Math.round(lerp(palette[i][2], palette[n][2], f))
        ];
    }

    function drawParticle(p, time) {
        /*
         * The reference is not a normal circular particle cloud.
         * It behaves like a constantly breathing stream:
         * - a dark void stays in the center
         * - particles concentrate around the void's edges
         * - the whole mass bends from a narrow A/arch into a wide wave
         * - color travels through the stream instead of changing all at once
         */
        const phase = time * p.speed + p.seed;
        const cycle = time * 0.000075;
        const morph = (Math.sin(cycle * Math.PI * 2) + 1) * .5;

        const side = p.u < .5 ? -1 : 1;
        const edge = Math.abs(p.u - .5) * 2;
        const spread = lerp(.34, 1.08, morph);

        // Horizontal stream coordinate.
        let x = (p.u - .5) * width * spread;

        // Narrow near the top, wider toward the sides: an A/portal silhouette.
        const vertical = p.v;
        const centerWidth = .08 + vertical * .46;
        const portalDistance = Math.abs(x) / Math.max(1, width);
        const arch = centerWidth + .07 * Math.sin(vertical * Math.PI);

        // Pull particles toward two luminous rails and leave a clean central void.
        const targetX = side * (width * (.08 + vertical * .28));
        const railPull = Math.pow(1 - clamp(Math.abs(x - targetX) / (width * .42), 0, 1), 1.6);
        x = lerp(x, targetX, railPull * .68);

        // During the wide phase, let the stream fan horizontally.
        x += Math.sin(vertical * 8 + phase) * width * .035 * spread;

        // Make the top converge and the lower section breathe outward.
        const y = height * (.14 + vertical * .78)
            + Math.sin(phase * .7 + vertical * 13) * height * .025;

        // Keep the central opening visibly empty.
        const voidRadius = height * (.055 + vertical * .11);
        const distFromCenter = Math.hypot(x, y - height * .50);
        const voidFade = clamp((distFromCenter - voidRadius) / (height * .16), 0, 1);

        // A few particles escape far away, like the reference's scattered field.
        const scatter = Math.pow(p.v, 2.7) * width * .28;
        x += Math.sin(p.seed * 3.1 + time * p.speed * 3000) * scatter * p.drift;

        const shimmer = .78 + Math.sin(time * .002 + p.seed) * .22;
        const alpha = p.alpha * voidFade * shimmer;

        if (alpha < .035) return;

        // Color flows through the particle field.
        const color = paletteColor(p.color + cycle * .7 + p.v * .34);
        const size = p.size * (0.75 + edge * .7);

        ctx.fillStyle = 'rgba(' + color[0] + ',' + color[1] + ',' + color[2] + ',' + alpha + ')';
        ctx.fillRect(x + width * .5, y, size, size);
    }

    function draw(time) {
        const delta = Math.min(40, time - last);
        last = time;

        ctx.clearRect(0, 0, width, height);

        // Deep black/green atmosphere.
        const glow = ctx.createRadialGradient(
            width * .5, height * .5, 0,
            width * .5, height * .5, height * .72
        );
        glow.addColorStop(0, 'rgba(26, 75, 45, .22)');
        glow.addColorStop(.34, 'rgba(14, 43, 28, .10)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < particles.length; i++) {
            drawParticle(particles[i], reduceMotion ? 0 : time);
        }

        if (!reduceMotion) {
            raf = requestAnimationFrame(draw);
        }
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    resize();
    draw(performance.now());

    window.addEventListener('pagehide', () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
    }, { once: true });
})();