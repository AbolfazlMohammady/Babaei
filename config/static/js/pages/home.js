(() => {
    const canvas = document.querySelector('[data-particle-field]');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, dpr = 1, raf = 0;
    let particles = [];
    let ambient = [];
    let mx = 0, my = 0, tx = 0, ty = 0;
    const started = performance.now();

    const jade = [
        [16, 88, 58],
        [20, 132, 78],
        [37, 177, 104],
        [84, 205, 141],
        [169, 235, 197]
    ];

    const rnd = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    // Four large, sweeping ribbons. Each ribbon is a curved path from an
    // outer edge into the central void and back out to another edge.
    function curvePath(id, t) {
        const side = id % 2 === 0 ? 1 : -1;
        const top = id < 2;
        const x = side * (0.5 - t) * 2;

        if (top) {
            return {
                x: side * (0.045 + Math.pow(t, .82) * .53),
                y: -0.08 + Math.pow(t, .82) * .63
            };
        }

        return {
            x: side * (0.045 + Math.pow(t, .82) * .53),
            y: 1.08 - Math.pow(t, .82) * .63
        };
    }

    function makeRibbon() {
        return {
            path: Math.floor(Math.random() * 4),
            t: Math.random(),
            width: Math.pow(Math.random(), 1.65),
            offset: Math.random() * Math.PI * 2,
            speed: rnd(.000035, .00010),
            size: rnd(.38, 1.55),
            alpha: rnd(.28, .95),
            color: Math.random(),
            depth: Math.random()
        };
    }

    function makeAmbient() {
        return {
            x: Math.random(),
            y: Math.random(),
            size: rnd(.35, 1.25),
            alpha: rnd(.08, .42),
            phase: Math.random() * Math.PI * 2,
            drift: rnd(.000004, .000018)
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

        // Dense enough to look like the reference, with a separate ambient field.
        const count = w < 700 ? 6000 : 15500;
        particles = Array.from({ length: count }, makeRibbon);
        ambient = Array.from({ length: w < 700 ? 900 : 2300 }, makeAmbient);
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

    function ribbonPoint(path, t, time) {
        // Make the ribbons breathe slowly. This is intentionally smooth rather
        // than geometric: the reference feels like flowing particles/smoke.
        const pulse = Math.sin(time * .00024 + path * 1.7) * .035;
        const tt = clamp(t + pulse, 0, 1);
        const base = curvePath(path, tt);

        // A broad S-shaped bow makes the outer portions sweep across the screen.
        const wave = Math.sin(tt * Math.PI * 1.22);
        const bow = wave * .20;

        let x = base.x + (path % 2 === 0 ? bow : -bow);
        let y = base.y;

        // The four ribbons are mirrored around the center.
        if (path === 0) { x += .10 * wave; }
        if (path === 1) { x -= .10 * wave; }
        if (path === 2) { x += .10 * wave; }
        if (path === 3) { x -= .10 * wave; }

        return { x, y };
    }

    function draw(now) {
        const time = reduced ? 0 : now - started;

        mx += (tx - mx) * .045;
        my += (ty - my) * .045;

        ctx.clearRect(0, 0, w, h);

        // Deep black/emerald atmospheric base.
        const atmosphere = ctx.createRadialGradient(
            w * (.5 + mx * .05), h * (.5 + my * .05), 0,
            w * .5, h * .5, Math.max(w, h) * .82
        );
        atmosphere.addColorStop(0, 'rgba(8, 42, 28, .34)');
        atmosphere.addColorStop(.32, 'rgba(4, 27, 18, .20)');
        atmosphere.addColorStop(.7, 'rgba(1, 13, 9, .10)');
        atmosphere.addColorStop(1, 'rgba(0, 3, 2, .95)');
        ctx.fillStyle = atmosphere;
        ctx.fillRect(0, 0, w, h);

        const S = Math.min(w, h);
        const cx = w * .5 + mx * w * .025;
        const cy = h * .5 + my * h * .025;

        // Ambient depth particles first.
        for (let i = 0; i < ambient.length; i++) {
            const p = ambient[i];
            const x = p.x * w + Math.sin(time * p.drift * 8000 + p.phase) * 18 + mx * 20;
            const y = p.y * h + Math.cos(time * p.drift * 7000 + p.phase) * 12 + my * 14;
            const a = p.alpha * (.55 + .45 * Math.sin(time * .001 + p.phase));
            ctx.fillStyle = 'rgba(42,150,91,' + Math.max(.02, a) + ')';
            ctx.fillRect(x, y, p.size, p.size);
        }

        // The main flowing ribbons.
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            let t = (p.t + time * p.speed) % 1;
            // Make particles travel both ways depending on their ribbon.
            if (p.path === 1 || p.path === 3) t = 1 - t;

            const q = ribbonPoint(p.path, t, time);

            // Perpendicular offset creates a thick particle "fabric" around each ribbon.
            const eps = .002;
            const q2 = ribbonPoint(p.path, clamp(t + eps, 0, 1), time);
            let dx = q2.x - q.x;
            let dy = q2.y - q.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;

            const thickness = (.006 + Math.pow(p.width, 1.25) * .15)
                * (0.72 + .28 * Math.sin(t * Math.PI));

            const breathing = 1 + Math.sin(time * .00055 + p.offset) * .10;
            const offset = thickness * breathing;

            let nxp = q.x + nx * offset;
            let nyp = q.y + ny * offset;

            // Add fine turbulence: tiny, layered motion rather than straight lines.
            const turbulence =
                Math.sin(t * 19 + p.offset + time * .00065) * .012 * p.depth +
                Math.sin(t * 43 - p.offset + time * .00031) * .004;

            nxp += turbulence;
            nyp += Math.cos(t * 17 + p.offset + time * .00052) * .009 * p.depth;

            // Mouse moves the entire field and bends it slightly.
            nxp += mx * (.018 + p.depth * .055);
            nyp += my * (.014 + p.depth * .045);

            let x = cx + nxp * S;
            let y = cy + nyp * S;

            // Central void: strongly suppress particles in the diamond-shaped core.
            const vx = Math.abs(nxp) / .16;
            const vy = Math.abs(nyp) / .18;
            const voidShape = Math.max(vx + vy, 0);
            const voidFade = clamp((voidShape - .78) / .34, 0, 1);

            // Fade at extreme ends so the stream feels atmospheric, not clipped.
            const endFade = Math.sin(Math.PI * t);
            const alpha = p.alpha * (.45 + .55 * p.depth) * voidFade
                * (.42 + .58 * endFade);

            if (alpha < .018) continue;

            const rgb = getColor(
                p.color + t * .14 + time * .000012 + p.depth * .08
            );

            // Reference has mostly pin-prick particles, with occasional larger glowing grains.
            let size = p.size * (.65 + p.depth * 1.9);
            if (p.depth > .92 && i % 17 === 0) size *= 2.5;

            ctx.fillStyle =
                'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';

            ctx.fillRect(x, y, size, size);

            if (size > 2.1 && i % 29 === 0) {
                ctx.globalAlpha = alpha * .20;
                ctx.beginPath();
                ctx.arc(x, y, size * 3.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }

        if (!reduced) raf = requestAnimationFrame(draw);
    }

    window.addEventListener('pointermove', (event) => {
        tx = (event.clientX / window.innerWidth - .5) * 2;
        ty = (event.clientY / window.innerHeight - .5) * 2;
    }, { passive: true });

    window.addEventListener('pointerleave', () => {
        tx = 0;
        ty = 0;
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