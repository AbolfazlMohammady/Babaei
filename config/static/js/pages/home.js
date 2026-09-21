(() => {
    const canvas = document.querySelector('[data-particle-field]');
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, dpr = 1, raf = 0;
    let particles = [];
    let mouseX = 0, mouseY = 0, targetX = 0, targetY = 0;
    let previousTime = performance.now();
    let elapsed = 0;

    const jade = [
        [15, 82, 53],
        [20, 119, 70],
        [28, 158, 91],
        [55, 191, 119],
        [116, 221, 166]
    ];

    const rnd = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    /*
     * Important performance rule:
     * particles keep immutable seeds and are evaluated from one smooth clock.
     * Nothing is randomly regenerated during animation, so there is no
     * visible stepping/jitter.
     */
    function makeParticle() {
        return {
            u: Math.random(),
            spread: Math.pow(Math.random(), 1.85),
            side: Math.random() < 0.5 ? -1 : 1,
            phase: Math.random() * Math.PI * 2,
            speed: rnd(0.000018, 0.000055),
            size: rnd(0.35, 1.15),
            alpha: rnd(0.22, 0.78),
            depth: Math.random(),
            color: Math.random()
        };
    }

    function resize() {
        const rect = canvas.getBoundingClientRect();
        w = Math.max(1, rect.width);
        h = Math.max(1, rect.height);
        dpr = Math.min(window.devicePixelRatio || 1, 1.75);

        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Fewer particles = much smoother motion while preserving density.
        const count = w < 700 ? 3400 : 8200;
        particles = Array.from({ length: count }, makeParticle);
    }

    function getColor(t) {
        const p = ((t % 1) + 1) % 1 * (jade.length - 1);
        const i = Math.floor(p);
        const f = p - i;
        const a = jade[i];
        const b = jade[Math.min(i + 1, jade.length - 1)];

        return [
            Math.round(a[0] + (b[0] - a[0]) * f),
            Math.round(a[1] + (b[1] - a[1]) * f),
            Math.round(a[2] + (b[2] - a[2]) * f)
        ];
    }

    function draw(now) {
        const dt = Math.min(32, now - previousTime);
        previousTime = now;

        if (!reduced) {
            elapsed += dt;
            mouseX += (targetX - mouseX) * 0.035;
            mouseY += (targetY - mouseY) * 0.035;
        }

        ctx.clearRect(0, 0, w, h);

        // Static atmosphere: no per-frame gradient allocation.
        const cx = w * 0.5 + mouseX * w * 0.018;
        const cy = h * 0.5 + mouseY * h * 0.018;
        const S = Math.min(w, h);
        const time = elapsed;

        /*
         * One continuous mathematical flow field.
         * The ribbons are generated from smooth sine curves instead of
         * particles jumping between path segments.
         */
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            const u = (p.u + time * p.speed) % 1;
            const theta = u * Math.PI * 2 + p.phase * 0.015;

            // Large breathing wave. It changes very slowly.
            const breath = Math.sin(time * 0.00018 + p.phase) * 0.035;

            // Two broad organic ribbons crossing the composition.
            const envelope = Math.sin(u * Math.PI);
            const broad = 0.075 + envelope * 0.34;

            let x = p.side * (
                0.035 +
                broad * (0.72 + p.spread * 0.52) +
                Math.sin(theta * 1.7 + time * 0.00008) * 0.035 * envelope
            );

            let y =
                Math.cos(u * Math.PI * 2) * 0.37 +
                Math.sin(theta * 0.75) * 0.035 +
                breath;

            // Fine turbulence follows the ribbon; no discontinuous jumps.
            x += Math.sin(theta * 9.0 + p.phase) * 0.009 * p.spread;
            y += Math.cos(theta * 7.0 + p.phase) * 0.008 * p.spread;

            // Make the outer field softer and wider.
            const widthFactor = 0.72 + p.depth * 0.46;
            x *= widthFactor;
            y *= 0.96 + p.depth * 0.08;

            // Gentle mouse parallax.
            x += mouseX * (0.018 + p.depth * 0.038);
            y += mouseY * (0.014 + p.depth * 0.030);

            const px = cx + x * S;
            const py = cy + y * S;

            // Deep central opening, with a soft edge rather than a hard cut.
            const centerDistance = Math.abs(x);
            const hole = 0.095 + envelope * 0.105;
            const opening = clamp((centerDistance - hole) / 0.085, 0, 1);

            // Keep the ribbon strongest around the middle of its curve.
            const bodyFade = 0.25 + 0.75 * Math.sin(u * Math.PI);
            const alpha = p.alpha * opening * bodyFade * (0.42 + p.depth * 0.58);

            if (alpha < 0.018) continue;

            const rgb = getColor(
                p.color + u * 0.20 + time * 0.000012
            );

            const size = p.size * (0.72 + p.depth * 1.25);

            ctx.fillStyle =
                'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
            ctx.fillRect(px, py, size, size);

            // Very rare glow particles. Kept tiny so they don't look like bubbles.
            if (p.depth > 0.96 && i % 97 === 0) {
                ctx.globalAlpha = alpha * 0.16;
                ctx.beginPath();
                ctx.arc(px, py, size * 2.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }

        if (!reduced) {
            raf = requestAnimationFrame(draw);
        }
    }

    window.addEventListener('pointermove', (event) => {
        targetX = (event.clientX / window.innerWidth - 0.5) * 2;
        targetY = (event.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    window.addEventListener('pointerleave', () => {
        targetX = 0;
        targetY = 0;
    }, { passive: true });

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    resize();
    draw(performance.now());

    window.addEventListener('pagehide', () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
    }, { once: true });
})();