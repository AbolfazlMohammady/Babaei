(() => {
    const canvas = document.querySelector('[data-particle-field]');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, dpr = 1, particles = [], raf = 0;
    const start = performance.now();

    const colors = [
        [255, 211, 55],   // yellow
        [71, 211, 103],   // green
        [65, 177, 255],   // blue
        [133, 92, 255],   // violet
        [255, 211, 55]
    ];

    const rnd = (a, b) => a + Math.random() * (b - a);

    function particle() {
        return {
            t: Math.random(),
            side: Math.random() < .5 ? -1 : 1,
            spread: Math.pow(Math.random(), 1.55),
            seed: Math.random() * Math.PI * 2,
            speed: rnd(.000035, .00012),
            size: rnd(.45, 1.55),
            alpha: rnd(.3, .95),
            scatter: Math.random() < .13
        };
    }

    function resize() {
        const r = canvas.getBoundingClientRect();
        w = Math.max(1, r.width);
        h = Math.max(1, r.height);
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const count = w < 700 ? 2400 : 6200;
        particles = Array.from({ length: count }, particle);
    }

    function colorAt(t) {
        const x = ((t % 1) + 1) % 1 * (colors.length - 1);
        const i = Math.floor(x);
        const f = x - i;
        const a = colors[i], b = colors[i + 1];
        return [
            Math.round(a[0] + (b[0] - a[0]) * f),
            Math.round(a[1] + (b[1] - a[1]) * f),
            Math.round(a[2] + (b[2] - a[2]) * f)
        ];
    }

    function draw(now) {
        const time = reduced ? 0 : now - start;
        ctx.clearRect(0, 0, w, h);

        // Very subtle atmosphere; the reference stays essentially black.
        const glow = ctx.createRadialGradient(w * .5, h * .5, 0, w * .5, h * .5, h * .62);
        glow.addColorStop(0, 'rgba(30,70,42,.08)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);

        const cx = w * .5;
        const cy = h * .5;
        const scale = Math.min(w, h);
        const cycle = time * .000035;
        const colorFlow = time * .000055;

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            // Continuous movement along the vertical flow.
            let v = (p.t + time * p.speed) % 1;
            const yNorm = v * 2 - 1;

            /*
             * Core shape taken from the reference:
             * narrow vertical column at top/bottom,
             * opening dramatically around the middle,
             * leaving a clean black central void.
             */
            const middle = 1 - Math.abs(yNorm);
            const arm = Math.pow(middle, .82);

            // Width of each luminous arm.
            const centerLine = .025 + arm * .31;
            const thickness = (.006 + .055 * p.spread) * (0.72 + arm);

            let xNorm = p.side * (centerLine + (p.spread - .5) * thickness);

            // Make the stream breathe and rotate very slightly.
            xNorm += Math.sin(time * .00042 + p.seed + v * 8) * .012;
            xNorm += Math.sin(time * .00016 + p.seed * 2) * .018 * arm;

            // Top/bottom columns are dense; outer sides are more dispersed.
            const density = .38 + .62 * Math.pow(1 - p.spread, 1.5);
            const scatter = p.scatter
                ? (Math.sin(p.seed + time * p.speed * 9000) * .22 * arm)
                : 0;

            xNorm += scatter;

            const x = cx + xNorm * scale;
            const y = h * (.09 + v * .82)
                + Math.sin(time * .00055 + p.seed) * h * .012;

            // Empty central hole: remove particles close to the vertical center.
            const holeWidth = .045 + arm * .13;
            const distanceToVoid = Math.abs(xNorm);
            const holeFade = distanceToVoid < holeWidth
                ? Math.pow(distanceToVoid / holeWidth, 2.2)
                : 1;

            // Fade the outermost particles, while keeping a sparse halo.
            const edgeFade = .42 + .58 * Math.pow(1 - p.spread, .55);
            const alpha = p.alpha * holeFade * edgeFade * density;

            if (alpha < .018) continue;

            const rgb = colorAt(p.seed * .08 + colorFlow + v * .36);
            const size = p.size * (.72 + (1 - p.spread) * 1.35);

            ctx.fillStyle =
                'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
            ctx.fillRect(x, y, size, size);

            // Rare bright particles create the granular sparkle visible in the reference.
            if (i % 41 === 0 && size > .9) {
                ctx.globalAlpha = alpha * .25;
                ctx.beginPath();
                ctx.arc(x, y, size * 2.8, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }

        if (!reduced) raf = requestAnimationFrame(draw);
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