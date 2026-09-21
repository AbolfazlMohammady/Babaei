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
        [2, 24, 15],
        [3, 48, 28],
        [5, 76, 43],
        [7, 108, 59],
        [15, 145, 78],
        [37, 188, 105],
        [108, 238, 157]
    ];

    const rand = (a, b) => a + Math.random() * (b - a);

    /*
     * Gemini-like volumetric dust:
     * particles live on a soft, warped 3D shell around a central void.
     * There are no fixed left/right sheets and no straight diagonals.
     * Perspective makes the shell expand toward the viewport edges.
     */
    function makeParticle() {
        const arm = Math.random() * Math.PI * 2;
        const radius = Math.pow(Math.random(), 0.72);
        const depth = Math.random();
        const ribbon = Math.random();

        return {
            angle: arm,
            radius,
            depth,
            ribbon,
            phase: rand(0, Math.PI * 2),
            speed: rand(0.00045, 0.00115),
            size: rand(0.20, 0.92),
            alpha: rand(0.10, 0.66),
            drift: rand(0.6, 1.4),
            seedX: rand(-1, 1),
            seedY: rand(-1, 1),
            seedZ: rand(-1, 1)
        };
    }

    function resize() {
        const rect = canvas.getBoundingClientRect();
        width = Math.max(1, rect.width);
        height = Math.max(1, rect.height);
        dpr = Math.min(window.devicePixelRatio || 1, 1.5);

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        particles = Array.from(
            { length: isMobile() ? 6200 : 15000 },
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
            pointerX += (targetX - pointerX) * 0.018;
            pointerY += (targetY - pointerY) * 0.018;
        }

        ctx.clearRect(0, 0, width, height);

        const unit = Math.min(width, height);
        const cx = width * 0.5 + pointerX * width * 0.018;
        const cy = height * 0.5 + pointerY * height * 0.014;

        const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, unit * 0.92);
        bg.addColorStop(0, 'rgba(4, 29, 19, .34)');
        bg.addColorStop(.30, 'rgba(2, 15, 10, .20)');
        bg.addColorStop(.68, 'rgba(1, 7, 4, .08)');
        bg.addColorStop(1, 'rgba(0, 2, 1, 1)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            const a = p.angle
                + time * p.speed
                + Math.sin(time * 0.00018 + p.phase) * 0.045;

            /*
             * A broad asymmetric shell. The four large lobes create
             * the reference's sweeping volumetric arms without drawing
             * visible geometric lines.
             */
            const lobe =
                0.62 +
                0.22 * Math.sin(a * 2.0 + p.phase * 0.55) +
                0.11 * Math.sin(a * 4.0 - p.phase * 0.35);

            const shell =
                0.31 +
                p.radius * lobe +
                Math.sin(a * 3.0 + p.phase) * 0.035;

            const tube =
                (p.ribbon - 0.5) *
                (0.16 + p.radius * 0.16);

            let x3 = Math.cos(a) * (shell + tube);
            let y3 = Math.sin(a) * (shell * 0.74 + tube * 0.60);

            /*
             * Warp the shell into a flowing cloth-like surface.
             * The center stays empty while the outer volume becomes dense.
             */
            const wave =
                Math.sin(a * 3.0 + p.phase + time * 0.00022) *
                (0.025 + p.radius * 0.055);

            x3 += Math.sin(a * 1.7 + p.phase) * wave;
            y3 += Math.cos(a * 2.3 - p.phase) * wave;

            /*
             * Fake depth: the front of the cloud is larger/brighter,
             * the rear recedes and becomes fine dust.
             */
            const z =
                0.5 +
                0.5 * Math.sin(a * 2.0 + p.phase) +
                p.seedZ * 0.16;

            const perspective = 1.0 + z * 0.72;

            let x = cx + x3 * unit * perspective;
            let y = cy + y3 * unit * perspective;

            /*
             * Add a second atmospheric layer around the shell.
             * These particles break the silhouette so it feels like
             * a volumetric field instead of a ring.
             */
            if (p.depth > 0.78) {
                const atmosphere = (p.depth - 0.78) / 0.22;
                x += p.seedX * atmosphere * unit * 0.22;
                y += p.seedY * atmosphere * unit * 0.18;
            }

            x += pointerX * (8 + p.depth * 22);
            y += pointerY * (6 + p.depth * 18);

            /*
             * Keep the typography readable with a soft central void.
             * There is no hard mask: density simply falls off near center.
             */
            const nx = (x - cx) / unit;
            const ny = (y - cy) / unit;
            const centerDistance = Math.sqrt(
                Math.pow(nx / 0.25, 2) +
                Math.pow(ny / 0.19, 2)
            );

            const centerFade = centerDistance < 1
                ? 0.025 + Math.pow(centerDistance, 1.85) * 0.975
                : 1;

            const edgeDistance = Math.min(
                Math.max(x / width, 0),
                Math.max(1 - x / width, 0),
                Math.max(y / height, 0),
                Math.max(1 - y / height, 0)
            );

            const edgeFade = 0.45 + Math.min(1, edgeDistance * 5.0) * 0.55;

            const depthFade = 0.38 + z * 0.62;
            const alpha = p.alpha * centerFade * edgeFade * depthFade;

            if (alpha < 0.008) continue;

            const rgb = colorAt(
                0.14 +
                z * 0.54 +
                p.depth * 0.26 +
                time * 0.000003
            );

            const size =
                p.size *
                (0.62 + z * 1.18) *
                (0.78 + p.radius * 0.38);

            ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
            ctx.fillRect(x, y, size, size);

            if (p.depth > 0.985 && i % 71 === 0) {
                ctx.globalAlpha = alpha * 0.14;
                ctx.beginPath();
                ctx.arc(x, y, size * 2.4, 0, Math.PI * 2);
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
