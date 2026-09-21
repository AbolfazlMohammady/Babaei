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
    let scrollProgress = 0;
    let targetX = 0;
    let targetY = 0;
    let pointerX = 0;
    let pointerY = 0;
    let particles = [];

    const palette = [
        [4, 48, 30],
        [5, 76, 45],
        [7, 108, 61],
        [13, 145, 78],
        [35, 181, 103],
        [101, 225, 153]
    ];

    const random = (min, max) => min + Math.random() * (max - min);

    function particle() {
        return {
            side: Math.random() < 0.5 ? -1 : 1,
            y: Math.random(),
            spread: Math.pow(Math.random(), 1.75),
            speed: random(0.000018, 0.000055),
            phase: random(0, Math.PI * 2),
            depth: Math.random(),
            size: random(0.28, 1.15),
            alpha: random(0.22, 0.92),
            drift: random(0.7, 1.4)
        };
    }

    function resize() {
        const rect = canvas.getBoundingClientRect();
        width = Math.max(1, rect.width);
        height = Math.max(1, rect.height);
        dpr = Math.min(window.devicePixelRatio || 1, 1.75);

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Gemini's real hero uses a single full-viewport Three.js canvas.
        // We keep the same composition but use a lightweight 2D field.
        const count = mobile() ? 5200 : 11800;
        particles = Array.from({ length: count }, particle);
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
        const delta = Math.min(34, now - last);
        last = now;
        time += delta;

        if (!reduced) {
            pointerX += (targetX - pointerX) * 0.035;
            pointerY += (targetY - pointerY) * 0.035;
        }

        ctx.clearRect(0, 0, width, height);

        const centerX = width * 0.5 + pointerX * width * 0.012;
        const centerY = height * 0.5 + pointerY * height * 0.012;
        const unit = Math.min(width, height);

        const background = ctx.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, unit * 0.78
        );
        background.addColorStop(0, 'rgba(3, 26, 17, .26)');
        background.addColorStop(.48, 'rgba(1, 13, 8, .10)');
        background.addColorStop(1, 'rgba(0, 3, 2, 1)');
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            // Vertical travel is deliberately slow. The field never resets.
            let y = (p.y + time * p.speed * p.drift) % 1;

            // Mirror the two clouds around the center.
            const vertical = y - 0.5;
            const absY = Math.abs(vertical);

            // Both clouds are wide at the top/bottom and pinch toward the middle.
            // This is the key difference from the previous X/diamond shape.
            const inward = Math.pow(Math.sin(Math.PI * y), 0.72);
            const baseX = 0.245 + (1 - inward) * 0.115;

            // Dense core + airy outer particles.
            const widthSpread = (0.012 + p.spread * 0.115) * (0.72 + absY * 0.65);

            // Curl-like movement inside each ribbon.
            const wave1 = Math.sin(y * 19 + p.phase + time * 0.00022) * 0.010;
            const wave2 = Math.sin(y * 43 - p.phase + time * 0.00016) * 0.004;
            const breathing = Math.sin(time * 0.00028 + p.phase) * 0.012;

            let x = centerX + p.side * unit * (
                baseX +
                (p.spread - 0.5) * widthSpread +
                wave1 + wave2 + breathing * p.depth
            );

            y = centerY + (y - 0.5) * unit;

            // Gentle parallax, matching the source page's viewport-parallax idea.
            x += pointerX * (7 + p.depth * 24);
            y += pointerY * (5 + p.depth * 18);

            // Soft fade toward the top and bottom edges.
            const edge = Math.sin(Math.PI * y / unit + Math.PI / 2);
            const edgeFade = 0.32 + 0.68 * Math.max(0, Math.min(1, edge));

            // Keep the center as clean negative space.
            const centerDistance = Math.abs((x - centerX) / unit);
            const centerVoid = Math.max(0, 1 - centerDistance / 0.20);
            const voidFade = 1 - Math.pow(centerVoid, 2.4) * 0.93;

            // Scroll subtly tightens the field, rather than moving the content away.
            const scrollTighten = 1 - Math.min(scrollProgress, 1) * 0.08;
            x = centerX + (x - centerX) * scrollTighten;

            const alpha = p.alpha * edgeFade * voidFade * (0.42 + p.depth * 0.58);
            if (alpha < 0.018) continue;

            const rgb = colorAt(p.depth + y * 0.11 + time * 0.000008);
            const size = p.size * (0.72 + p.depth * 1.15);

            ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
            ctx.fillRect(x, y, size, size);

            // Only a tiny percentage get a soft glow.
            if (p.depth > 0.988 && i % 67 === 0) {
                ctx.globalAlpha = alpha * 0.13;
                ctx.beginPath();
                ctx.arc(x, y, size * 2.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }

        if (!reduced) {
            raf = requestAnimationFrame(draw);
        }
    }

    function updateScroll() {
        const rect = hero.getBoundingClientRect();
        const travel = Math.max(1, hero.offsetHeight - window.innerHeight);
        scrollProgress = Math.max(0, Math.min(1, -rect.top / travel));

        // Inspired by Gemini's hero: the scene is a sticky viewport whose
        // visual state is controlled by scroll progress.
        hero.style.setProperty('--hero-progress', scrollProgress.toFixed(4));
    }

    window.addEventListener('scroll', updateScroll, { passive: true });

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
    updateScroll();
    draw(performance.now());

    window.addEventListener('pagehide', () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
    }, { once: true });
})();