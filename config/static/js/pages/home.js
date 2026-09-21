(() => {
    const canvas = document.querySelector('[data-particle-field]');
    const hero = document.querySelector('.home-hero');
    if (!canvas || !hero) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = () => window.innerWidth <= 700;

    let width = 1;
    let height = 1;
    let dpr = 1;
    let raf = 0;
    let time = 0;
    let last = performance.now();
    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;
    let particles = [];

    const palette = [
        [3, 38, 24],
        [4, 66, 39],
        [6, 96, 53],
        [9, 132, 69],
        [20, 174, 91],
        [62, 214, 123],
        [145, 245, 176]
    ];

    const rand = (a, b) => a + Math.random() * (b - a);

    /*
     * Gemini-like composition:
     * This is intentionally a PARTICLE VOLUME, not four thin curves.
     *
     * Particles originate around the center and flow toward the four
     * corners. The further they travel, the wider and more atmospheric
     * the cloud becomes. This makes the scene feel like a luminous fabric
     * or smoke volume coming toward the viewer instead of a geometric X.
     */
    function makeParticle() {
        const arm = Math.floor(Math.random() * 4);
        const t = Math.pow(Math.random(), 0.72);
        const cloud = Math.pow(Math.random(), 1.05);

        return {
            arm,
            t,
            cloud,
            depth: Math.random(),
            phase: rand(0, Math.PI * 2),
            speed: rand(0.000007, 0.000026),
            size: rand(0.22, 1.25),
            alpha: rand(0.16, 0.82),
            // Gives a small number of particles photographic scale.
            large: Math.random() > 0.985
        };
    }

    function resize() {
        const rect = canvas.getBoundingClientRect();
        width = Math.max(1, rect.width);
        height = Math.max(1, rect.height);
        dpr = Math.min(window.devicePixelRatio || 1, 1.55);

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        particles = Array.from(
            { length: isMobile() ? 7200 : 17000 },
            makeParticle
        );
    }

    function colorAt(value) {
        const p = ((value % 1) + 1) % 1 * (palette.length - 1);
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

    function draw(now) {
        const delta = Math.min(40, now - last);
        last = now;
        time += delta;

        if (!reduced) {
            pointerX += (targetX - pointerX) * 0.025;
            pointerY += (targetY - pointerY) * 0.025;
        }

        ctx.clearRect(0, 0, width, height);

        const unit = Math.min(width, height);
        const cx = width * 0.5 + pointerX * width * 0.018;
        const cy = height * 0.5 + pointerY * height * 0.014;

        const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, unit * 0.9);
        bg.addColorStop(0, 'rgba(7, 39, 25, .38)');
        bg.addColorStop(.28, 'rgba(3, 22, 14, .22)');
        bg.addColorStop(.68, 'rgba(1, 9, 5, .10)');
        bg.addColorStop(1, 'rgba(0, 2, 1, 1)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            let t = (p.t + time * p.speed) % 1;

            // Four directions: top-left, top-right, bottom-left, bottom-right.
            const sx = p.arm % 2 === 0 ? -1 : 1;
            const sy = p.arm < 2 ? -1 : 1;

            /*
             * Radius grows almost to the viewport edges. Unlike the
             * previous version, the stream has no single visible spine.
             */
            const radius = (0.04 + t * 0.84) * unit;

            /*
             * A broad Gaussian-ish cloud around each arm.
             * The farther from the center, the wider it becomes.
             * A small core remains denser, creating the layered look
             * visible in the reference.
             */
            const broadWidth =
                (0.012 + Math.pow(t, 0.78) * 0.27) * unit;

            const u = (p.cloud - 0.5) * broadWidth;

            // Tangential direction around the diagonal flow.
            const diagonal = Math.SQRT1_2;
            let x = cx + sx * radius * diagonal;
            let y = cy + sy * radius * diagonal;

            x += u * diagonal;
            y -= u * diagonal;

            /*
             * Large-scale waves make the cloud bend organically.
             * Multiple frequencies avoid the obvious mathematical curve
             * from the previous implementation.
             */
            const wave =
                Math.sin(t * 7.0 + p.phase + time * 0.00010) *
                    (0.018 + t * 0.065) * unit +
                Math.sin(t * 16.0 - p.phase * 0.7 + time * 0.00007) *
                    (0.006 + t * 0.026) * unit;

            const crossWave =
                Math.cos(t * 11.0 + p.phase * 1.4 - time * 0.00008) *
                (0.004 + t * 0.024) * unit;

            x += sx * wave * 0.72;
            y += sy * wave * 0.72;
            x += crossWave;
            y -= crossWave;

            // Deep, slow parallax following the cursor.
            x += pointerX * (8 + p.depth * 34);
            y += pointerY * (6 + p.depth * 28);

            /*
             * The reference has a dark breathing hole around the text,
             * but the particle field still exists around it. We only
             * reduce opacity here; we do NOT cut a hard geometric hole.
             */
            const dx = (x - cx) / unit;
            const dy = (y - cy) / unit;
            const centerDistance = Math.sqrt(
                Math.pow(dx / 0.29, 2) +
                Math.pow(dy / 0.22, 2)
            );

            const centerFade =
                centerDistance < 1
                    ? 0.10 + centerDistance * 0.90
                    : 1;

            // Keep the extreme viewport corners alive but atmospheric.
            const edgeDistance = Math.min(
                x / width,
                1 - x / width,
                y / height,
                1 - y / height
            );
            const edgeFade = Math.max(0.30, Math.min(1, edgeDistance * 6));

            const depthFade = 0.34 + p.depth * 0.66;

            const alpha =
                p.alpha *
                depthFade *
                centerFade *
                (0.72 + edgeFade * 0.28);

            if (alpha < 0.012) continue;

            const rgb = colorAt(
                p.depth * 0.72 +
                t * 0.26 +
                time * 0.000004
            );

            const size =
                p.size *
                (0.65 + p.depth * 1.35) *
                (p.large ? 2.6 : 1);

            ctx.fillStyle =
                `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;

            if (p.large) {
                ctx.globalAlpha = alpha * 0.22;
                ctx.beginPath();
                ctx.arc(x, y, size * 3.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            ctx.fillRect(x, y, size, size);
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