(() => {
    const canvas = document.querySelector('[data-particle-field]');
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, dpr = 1, raf = 0;
    let particles = [];
    let mouseX = 0, mouseY = 0, targetX = 0, targetY = 0;
    let last = performance.now();

    // Jade / emerald spectrum only. No yellow, blue or purple.
    const palette = [
        [24, 105, 72],
        [34, 143, 94],
        [67, 181, 123],
        [116, 205, 157],
        [186, 224, 198]
    ];

    const rnd = (a, b) => a + Math.random() * (b - a);

    function makeParticle() {
        // u = position along the flowing ribbon, v = distance from its edge.
        return {
            u: Math.random(),
            v: Math.pow(Math.random(), 1.75),
            side: Math.random() < .5 ? -1 : 1,
            phase: Math.random() * Math.PI * 2,
            drift: rnd(.7, 1.3),
            speed: rnd(.000035, .000105),
            size: rnd(.42, 1.35),
            alpha: rnd(.24, .78),
            color: Math.random(),
            depth: Math.random(),
            soft: Math.random() < .055
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

        const count = w < 700 ? 2600 : 7200;
        particles = Array.from({ length: count }, makeParticle);
    }

    function color(t) {
        const x = ((t % 1) + 1) % 1 * (palette.length - 1);
        const i = Math.floor(x);
        const f = x - i;
        const a = palette[i];
        const b = palette[Math.min(i + 1, palette.length - 1)];

        return [
            Math.round(a[0] + (b[0] - a[0]) * f),
            Math.round(a[1] + (b[1] - a[1]) * f),
            Math.round(a[2] + (b[2] - a[2]) * f)
        ];
    }

    function draw(now) {
        const time = reduceMotion ? 0 : now - last;
        last = now;

        mouseX += (targetX - mouseX) * .055;
        mouseY += (targetY - mouseY) * .055;

        ctx.clearRect(0, 0, w, h);

        // Almost-black jade atmosphere.
        const glow = ctx.createRadialGradient(
            w * (.5 + mouseX * .025),
            h * (.5 + mouseY * .025),
            0,
            w * .5,
            h * .5,
            Math.max(w, h) * .7
        );
        glow.addColorStop(0, 'rgba(11, 58, 40, .20)');
        glow.addColorStop(.38, 'rgba(5, 31, 21, .10)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);

        const cx = w * .5 + mouseX * w * .035;
        const cy = h * .5 + mouseY * h * .025;
        const S = Math.min(w, h);

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            // Flow forward continuously, like particles travelling through a soft tunnel.
            const u = (p.u + time * p.speed) % 1;
            const t = u * Math.PI * 2;

            // Broad ribbon: narrow near the top/bottom, expansive around the middle.
            const wave = Math.sin(t);
            const band = Math.pow(Math.abs(wave), .52);

            // Two sweeping arms, deliberately organic rather than a geometric diamond.
            const arm = p.side * (0.10 + band * (.17 + p.v * .44));

            // Organic sideways breathing.
            const curl =
                Math.sin(t * 1.7 + p.phase) * (.018 + band * .045) +
                Math.sin(t * .73 - p.phase) * .025;

            let nx = arm + curl * p.drift;
            let ny = Math.cos(t) * .43 + Math.sin(t * .55 + p.phase) * .035;

            // Give the cloud depth: edge particles sit farther out and softer.
            const depth = p.v;
            nx *= .76 + depth * .48;
            ny *= .92 + depth * .08;

            // Mouse creates a smooth global parallax plus a subtle local flow field.
            nx += mouseX * (.025 + depth * .055);
            ny += mouseY * (.018 + depth * .04);

            // Local cursor influence: particles bend away, not violently.
            const px = cx + nx * S;
            const py = cy + ny * S;
            const dx = px - (w * (.5 + mouseX * .24));
            const dy = py - (h * (.5 + mouseY * .24));
            const dist = Math.sqrt(dx * dx + dy * dy);
            const influence = Math.max(0, 1 - dist / (S * .30));
            const force = influence * influence * .055;

            const x = px + (dx / (dist || 1)) * force * S;
            const y = py + (dy / (dist || 1)) * force * S;

            // Keep a deep, elegant void in the middle.
            const hole = Math.max(0, 1 - Math.abs(nx) / (.105 + band * .07));
            const voidFade = .12 + hole * .88;
            const centerDark = Math.max(0, 1 - Math.abs(nx) / .18);
            const alpha = p.alpha * (.38 + depth * .62) * (1 - centerDark * .72);

            if (alpha < .018) continue;

            const rgb = color(p.color + u * .16 + time * .000018);
            const size = p.size * (.72 + depth * 1.65);

            ctx.fillStyle =
                'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';

            if (p.soft) {
                ctx.beginPath();
                ctx.arc(x, y, size * 2.2, 0, Math.PI * 2);
                ctx.globalAlpha = alpha * .16;
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            ctx.fillRect(x, y, size, size);

            // Tiny secondary grains around the main stream.
            if (i % 31 === 0 && depth > .55) {
                const spread = depth * S * .035;
                ctx.globalAlpha = alpha * .16;
                ctx.fillRect(
                    x + rnd(-spread, spread),
                    y + rnd(-spread, spread),
                    size * .55,
                    size * .55
                );
                ctx.globalAlpha = 1;
            }
        }

        if (!reduceMotion) raf = requestAnimationFrame(draw);
    }

    window.addEventListener('pointermove', (event) => {
        targetX = (event.clientX / window.innerWidth - .5) * 2;
        targetY = (event.clientY / window.innerHeight - .5) * 2;
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