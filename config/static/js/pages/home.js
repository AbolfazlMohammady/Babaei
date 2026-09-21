(() => {
    const canvas = document.querySelector('[data-particle-field]');
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, dpr = 1, raf = 0;
    let particles = [];
    let mouseX = 0, mouseY = 0, targetX = 0, targetY = 0;
    let clock = 0;
    let previous = performance.now();

    // The reference is monochromatic: deep emerald / jade particles on black.
    const palette = [
        [7, 57, 38],
        [10, 92, 59],
        [15, 132, 78],
        [35, 176, 104],
        [90, 216, 147],
        [175, 239, 201]
    ];

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const rnd = (a, b) => a + Math.random() * (b - a);

    /*
     * Four continuous Bézier streams:
     *
     *             TOP
     *              /\
     *             /  \
     * LEFT -------    ------- RIGHT
     *             \  //
     *              \/
     *            BOTTOM
     *
     * This is deliberately a flowing fabric, not a ring/diamond.
     */
    function curve(path, t, time) {
        const center = { x: 0.50, y: 0.50 };
        const edge = {
            0: { x: 0.50, y: -0.10 }, // top -> center-left
            1: { x: 0.50, y: -0.10 }, // top -> center-right
            2: { x: 0.50, y: 1.10 },  // bottom -> center-left
            3: { x: 0.50, y: 1.10 }   // bottom -> center-right
        }[path];

        const target = {
            0: { x: -0.12, y: 0.50 },
            1: { x: 1.12, y: 0.50 },
            2: { x: -0.12, y: 0.50 },
            3: { x: 1.12, y: 0.50 }
        }[path];

        // Start/end are deliberately wide enough to fill the viewport.
        const p0 = edge;
        const p3 = target;

        let p1, p2;
        if (path === 0) {
            p1 = { x: 0.47, y: 0.20 };
            p2 = { x: 0.15, y: 0.36 };
        } else if (path === 1) {
            p1 = { x: 0.53, y: 0.20 };
            p2 = { x: 0.85, y: 0.36 };
        } else if (path === 2) {
            p1 = { x: 0.47, y: 0.80 };
            p2 = { x: 0.15, y: 0.64 };
        } else {
            p1 = { x: 0.53, y: 0.80 };
            p2 = { x: 0.85, y: 0.64 };
        }

        // Slow breathing of the whole fabric, not individual jitter.
        const breath = Math.sin(time * 0.00023 + path * 1.7) * 0.018;
        const s = Math.sin(t * Math.PI);

        const mt = 1 - t;
        let x = mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x;
        let y = mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y;

        // Organic bow: strongest around the middle of each stream.
        const bow = Math.sin(t * Math.PI) * Math.sin(t * Math.PI * 0.7) * 0.055;
        if (path === 0 || path === 2) x += bow;
        else x -= bow;

        y += breath * s;

        // Derivative for a stable perpendicular.
        let dx =
            3*mt*mt*(p1.x-p0.x) +
            6*mt*t*(p2.x-p1.x) +
            3*t*t*(p3.x-p2.x);
        let dy =
            3*mt*mt*(p1.y-p0.y) +
            6*mt*t*(p2.y-p1.y) +
            3*t*t*(p3.y-p2.y);

        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;

        return { x, y, nx: -dy, ny: dx };
    }

    function makeParticle() {
        const path = Math.floor(Math.random() * 4);
        return {
            path,
            t: Math.random(),
            offset: Math.random() * Math.PI * 2,
            spread: Math.pow(Math.random(), 1.55),
            speed: rnd(0.000022, 0.000065),
            size: rnd(0.32, 1.18),
            alpha: rnd(0.20, 0.86),
            depth: Math.random(),
            color: Math.random()
        };
    }

    function resize() {
        const r = canvas.getBoundingClientRect();
        w = Math.max(1, r.width);
        h = Math.max(1, r.height);
        dpr = Math.min(window.devicePixelRatio || 1, 1.75);

        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Dense but smooth. Stable particle count prevents animation stutter.
        const count = w < 700 ? 4200 : 10500;
        particles = Array.from({ length: count }, makeParticle);
    }

    function getColor(v) {
        const p = ((v % 1) + 1) % 1 * (palette.length - 1);
        const i = Math.floor(p);
        const f = p - i;
        const a = palette[i];
        const b = palette[Math.min(i + 1, palette.length - 1)];
        return [
            Math.round(a[0] + (b[0] - a[0]) * f),
            Math.round(a[1] + (b[1] - a[1]) * f),
            Math.round(a[2] + (b[2] - a[2]) * f)
        ];
    }

    function render(now) {
        const dt = Math.min(32, now - previous);
        previous = now;

        if (!reduced) {
            clock += dt;
            mouseX += (targetX - mouseX) * 0.045;
            mouseY += (targetY - mouseY) * 0.045;
        }

        ctx.clearRect(0, 0, w, h);

        // Nearly black green atmosphere.
        const bg = ctx.createRadialGradient(
            w * (0.5 + mouseX * 0.025),
            h * (0.5 + mouseY * 0.025),
            0,
            w * 0.5,
            h * 0.5,
            Math.max(w, h) * 0.78
        );
        bg.addColorStop(0, 'rgba(4, 35, 23, .28)');
        bg.addColorStop(.45, 'rgba(2, 18, 12, .12)');
        bg.addColorStop(1, 'rgba(0, 4, 3, 1)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        const S = Math.min(w, h);
        const cx = w * 0.5 + mouseX * w * 0.020;
        const cy = h * 0.5 + mouseY * h * 0.018;

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            // Continuous motion along a fixed stream. No respawning and no jumps.
            let t = (p.t + clock * p.speed) % 1;

            // Opposite streams travel in the opposite direction so the center feels alive.
            if (p.path === 1 || p.path === 2) t = 1 - t;

            const q = curve(p.path, t, clock);

            // Stream thickness: very thin at the central source, broadens outward.
            const edgeWidth = 0.004 + Math.pow(p.spread, 1.12) * 0.115;
            const turbulence =
                Math.sin(t * 22 + p.offset + clock * 0.00042) * 0.008 +
                Math.sin(t * 47 - p.offset + clock * 0.00024) * 0.0035;

            let offset = (edgeWidth * (0.72 + p.depth * 0.72)) + turbulence * p.spread;

            // Soft breathing around the fabric.
            offset *= 1 + Math.sin(clock * 0.00032 + p.offset) * 0.055;

            let nx = q.nx * offset;
            let ny = q.ny * offset;

            // Fine flow noise along the stream.
            nx += Math.sin(t * 31 + p.offset + clock * 0.00031) * 0.004 * p.depth;
            ny += Math.cos(t * 27 + p.offset + clock * 0.00029) * 0.004 * p.depth;

            let x = cx + (q.x - 0.5 + nx) * S;
            let y = cy + (q.y - 0.5 + ny) * S;

            // Mouse: a broad, elegant parallax field, never a violent repulsion.
            x += mouseX * (10 + p.depth * 28);
            y += mouseY * (8 + p.depth * 22);

            // The center remains a deep black negative-space window.
            const centerX = Math.abs((x - cx) / S);
            const centerY = Math.abs((y - cy) / S);
            const centralVoid = Math.max(0, 1 - (centerX / 0.17 + centerY / 0.12));
            const voidFade = 1 - Math.pow(centralVoid, 2.2) * 0.92;

            // Soft falloff at the viewport edges and around the source.
            const edgeFade = 0.35 + 0.65 * Math.sin(Math.PI * t);
            const alpha = p.alpha * (0.45 + p.depth * 0.55) * voidFade * edgeFade;

            if (alpha < 0.015) continue;

            const rgb = getColor(
                p.color + t * 0.12 + clock * 0.000010 + p.depth * 0.05
            );

            const size = p.size * (0.72 + p.depth * 1.35);

            ctx.fillStyle =
                'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
            ctx.fillRect(x, y, size, size);

            // Sparse luminous grains give depth without the previous "bubble" look.
            if (p.depth > 0.985 && i % 83 === 0) {
                ctx.globalAlpha = alpha * 0.16;
                ctx.beginPath();
                ctx.arc(x, y, size * 2.8, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }

        if (!reduced) raf = requestAnimationFrame(render);
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
    render(performance.now());

    window.addEventListener('pagehide', () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
    }, { once: true });
})();