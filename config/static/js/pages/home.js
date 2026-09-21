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
        [2, 31, 19],
        [3, 55, 32],
        [5, 82, 45],
        [7, 112, 60],
        [13, 148, 76],
        [35, 190, 101],
        [100, 235, 151]
    ];

    const rand = (a, b) => a + Math.random() * (b - a);

    function makeParticle() {
        const sheet = Math.random() < 0.5 ? -1 : 1;
        const t = Math.random();
        const layer = Math.random();

        return {
            sheet,
            t,
            layer,
            depth: Math.random(),
            phase: rand(0, Math.PI * 2),
            speed: rand(0.000008, 0.000030),
            size: rand(0.22, 1.05),
            alpha: rand(0.14, 0.82),
            side: Math.random() < 0.5 ? -1 : 1,
            atmosphere: Math.random() > 0.93,
            atmosphereX: rand(-0.10, 0.10),
            atmosphereY: rand(-0.07, 0.07)
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
            { length: isMobile() ? 7200 : 18000 },
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
        const cx = width * 0.5 + pointerX * width * 0.012;
        const cy = height * 0.5 + pointerY * height * 0.010;

        const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, unit * 0.95);
        bg.addColorStop(0, 'rgba(5, 34, 22, .46)');
        bg.addColorStop(.32, 'rgba(2, 19, 12, .25)');
        bg.addColorStop(.70, 'rgba(1, 8, 5, .10)');
        bg.addColorStop(1, 'rgba(0, 2, 1, 1)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            const t = (p.t + time * p.speed * (p.atmosphere ? 0.55 : 1)) % 1;

            const arch = Math.sin(Math.PI * t);
            const archEase = Math.pow(arch, 0.72);

            const sheetY = p.sheet * (0.62 - t * 1.24);

            const spread = 0.025 + archEase * 0.47;

            const thickness =
                (0.012 + Math.pow(p.layer, 1.18) * 0.24) *
                (0.45 + archEase * 1.05);

            const lateral = (p.layer - 0.5) * thickness;

            let x = cx + (p.side * spread + lateral) * unit;
            let y = cy + sheetY * unit;

            const slowWave =
                Math.sin(t * 5.3 + p.phase + time * 0.00008) *
                (0.025 + archEase * 0.075);

            const fineWave =
                Math.sin(t * 19.0 - p.phase * 0.65 + time * 0.00015) *
                (0.004 + archEase * 0.024);

            const crossWave =
                Math.cos(t * 11.0 + p.phase * 1.7 - time * 0.00010) *
                (0.006 + archEase * 0.035);

            x += slowWave * unit;
            x += crossWave * unit;
            y += fineWave * unit;

            if (p.atmosphere) {
                x += p.atmosphereX * unit * archEase;
                y += p.atmosphereY * unit * archEase;
            }

            x += pointerX * (5 + p.depth * 24);
            y += pointerY * (4 + p.depth * 18);

            const dx = (x - cx) / unit;
            const dy = (y - cy) / unit;
            const centerRadius = Math.sqrt(
                Math.pow(dx / 0.30, 2) +
                Math.pow(dy / 0.18, 2)
            );

            const centerFade = centerRadius < 1
                ? 0.12 + Math.pow(centerRadius, 1.45) * 0.88
                : 1;

            const edgeX = Math.min(x / width, 1 - x / width);
            const edgeY = Math.min(y / height, 1 - y / height);
            const edgeFade = Math.max(
                0.28,
                Math.min(1, Math.min(edgeX, edgeY) * 7)
            );

            const alpha =
                p.alpha *
                (0.34 + p.depth * 0.66) *
                centerFade *
                (0.68 + edgeFade * 0.32);

            if (alpha < 0.010) continue;

            const rgb = colorAt(
                p.depth * 0.72 +
                archEase * 0.25 +
                time * 0.000004
            );

            const size =
                p.size *
                (0.60 + p.depth * 1.40) *
                (0.72 + archEase * 0.55);

            ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
            ctx.fillRect(x, y, size, size);

            if (p.depth > 0.992 && i % 59 === 0) {
                ctx.globalAlpha = alpha * 0.18;
                ctx.beginPath();
                ctx.arc(x, y, size * 2.8, 0, Math.PI * 2);
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
