(() => {
    const canvas = document.querySelector('[data-particle-field]');
    const hero = document.querySelector('.home-hero');
    if (!canvas || !hero) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = () => window.innerWidth <= 700;

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
        [5, 52, 32],
        [7, 83, 48],
        [9, 118, 64],
        [18, 157, 82],
        [54, 203, 111],
        [132, 242, 170]
    ];

    const rand = (min, max) => min + Math.random() * (max - min);

    /*
     * The reference hero is not a pair of vertical particle columns.
     * It is a large flowing particle volume with four curved arms:
     *
     *             \       //
     *              \     //
     *       --------\   //--------
     *                 VOID
     *       --------//   \\--------
     *              //     \\
     *             //       \\
     *
     * We generate that shape mathematically so it remains responsive
     * without shipping a huge video/image asset.
     */
    function makeParticle() {
        const branch = Math.floor(Math.random() * 4);
        const t = Math.random();
        const depth = Math.pow(Math.random(), 1.7);
        const spread = Math.pow(Math.random(), 1.35);
        return {
            branch,
            t,
            depth,
            spread,
            phase: rand(0, Math.PI * 2),
            speed: rand(0.000010, 0.000032),
            size: rand(0.24, 1.15) * (depth > 0.94 ? 1.45 : 1),
            alpha: rand(0.18, 0.92)
        };
    }

    function resize() {
        const rect = canvas.getBoundingClientRect();
        width = Math.max(1, rect.width);
        height = Math.max(1, rect.height);
        dpr = Math.min(window.devicePixelRatio || 1, 1.6);

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        particles = Array.from(
            { length: mobile() ? 6500 : 14500 },
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
            pointerX += (targetX - pointerX) * 0.028;
            pointerY += (targetY - pointerY) * 0.028;
        }

        ctx.clearRect(0, 0, width, height);

        const unit = Math.min(width, height);
        const cx = width * 0.5 + pointerX * width * 0.012;
        const cy = height * 0.5 + pointerY * height * 0.012;

        // Deep black-green base, with a very subtle luminous center.
        const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, unit * 0.82);
        bg.addColorStop(0, 'rgba(7, 35, 23, .34)');
        bg.addColorStop(.34, 'rgba(2, 17, 10, .18)');
        bg.addColorStop(.72, 'rgba(1, 8, 5, .08)');
        bg.addColorStop(1, 'rgba(0, 2, 1, 1)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        /*
         * Four-arm flow:
         * Each branch starts near the center and travels toward a corner.
         * A sinusoidal curve gives the wide S-shaped ribbons visible
         * in the reference image.
         */
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            let t = (p.t + time * p.speed) % 1;
            if (p.branch >= 2) t = (p.t - time * p.speed * 0.72 + 1) % 1;

            // Non-linear distribution: very dense around the main stream,
            // sparse at its outer atmosphere.
            const radial = Math.pow(t, 0.72);
            const centerPull = 1 - radial;

            let x;
            let y;

            const side = p.branch % 2 === 0 ? -1 : 1;
            const vertical = p.branch < 2 ? -1 : 1;

            /*
             * Main trajectory. At the center it begins around x=0 and
             * quickly bends toward the outside as it travels vertically.
             */
            const verticalDistance = 0.04 + radial * 0.58;
            const curve =
                Math.sin(radial * Math.PI * 1.18 + p.phase * 0.035) *
                (0.055 + radial * 0.15);

            const sweep =
                Math.sin(radial * Math.PI * 2.15 + p.phase) *
                (0.014 + radial * 0.038);

            // Wide outer cloud + thin bright ribbon.
            const ribbonWidth =
                (0.004 + p.spread * 0.105) *
                (0.22 + radial * 0.95);

            // Pull particles toward a curved stream center.
            const streamX =
                side * (0.015 + verticalDistance * 0.82 + curve);

            const outer =
                (p.spread - 0.5) * ribbonWidth +
                sweep +
                Math.sin(time * 0.00017 + p.phase) * 0.008;

            x = cx + (streamX + outer) * unit;

            // Branches mirror around the center.
            y = cy + vertical * (
                (0.015 + radial * 0.64) * unit
            );

            // Give the upper and lower arms their broad horizontal wings.
            // The wing expands strongly near the outside of the viewport.
            const wing = Math.pow(radial, 1.65) * 0.28;
            x += side * wing * unit;

            // Organic turbulent motion, strongest in the outer cloud.
            x += Math.sin(t * 23 + p.phase + time * 0.00016) *
                (0.003 + p.depth * 0.018) * unit;

            y += Math.cos(t * 17 + p.phase - time * 0.00013) *
                (0.002 + p.depth * 0.014) * unit;

            // Mouse parallax.
            x += pointerX * (5 + p.depth * 28);
            y += pointerY * (4 + p.depth * 22);

            /*
             * Create the clean central negative space.
             * Particles near the center of the screen are progressively
             * removed, leaving the same dark breathing room behind text.
             */
            const nx = Math.abs((x - cx) / unit);
            const ny = Math.abs((y - cy) / unit);

            const centerVoid =
                Math.max(0, 1 - Math.sqrt(
                    Math.pow(nx / 0.29, 2) +
                    Math.pow(ny / 0.19, 2)
                ));

            const voidFade = 1 - Math.pow(centerVoid, 2.15) * 0.985;

            // Fade the extreme edges so the field feels atmospheric.
            const edgeX = Math.min(x / width, 1 - x / width);
            const edgeY = Math.min(y / height, 1 - y / height);
            const edgeFade = Math.min(1, Math.max(.18, Math.min(edgeX, edgeY) * 8));

            const alpha =
                p.alpha *
                (.34 + p.depth * .66) *
                voidFade *
                (.58 + edgeFade * .42);

            if (alpha < 0.012) continue;

            const rgb = colorAt(
                p.depth * .8 +
                radial * .22 +
                time * 0.000006
            );

            const size = p.size * (
                0.68 +
                p.depth * 1.65 +
                radial * .32
            );

            ctx.fillStyle =
                `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;

            ctx.fillRect(x, y, size, size);

            // Rare bright particles create the photographic sparkle.
            if (p.depth > .985 && i % 43 === 0) {
                ctx.globalAlpha = alpha * .22;
                ctx.beginPath();
                ctx.arc(x, y, size * 3.4, 0, Math.PI * 2);
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