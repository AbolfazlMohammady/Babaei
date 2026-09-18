(() => {
    const cards = document.querySelectorAll('[data-product-card]');
    if (!cards.length) return;

    cards.forEach((card) => {
        const slides = Array.from(card.querySelectorAll('[data-card-slide]'));
        const dots = Array.from(card.querySelectorAll('[data-card-dot]'));
        const favorite = card.querySelector('[data-favorite-button]');
        const media = card.querySelector('.product-card__media');

        if (slides.length > 1) {
            let current = 0;
            let timer = null;
            let startX = null;

            const show = (index, animate = true) => {
                current = (index + slides.length) % slides.length;
                slides.forEach((slide, i) => {
                    slide.classList.toggle('is-active', i === current);
                    if (!animate) slide.style.transition = 'none';
                });
                dots.forEach((dot, i) => dot.classList.toggle('is-active', i === current));
                if (!animate) {
                    requestAnimationFrame(() => slides.forEach((slide) => { slide.style.transition = ''; }));
                }
            };

            const next = () => show(current + 1);

            const stop = () => {
                if (timer) {
                    clearInterval(timer);
                    timer = null;
                }
            };

            const start = () => {
                stop();
                timer = setInterval(next, 4200);
            };

            media?.addEventListener('mouseenter', stop);
            media?.addEventListener('mouseleave', start);
            media?.addEventListener('touchstart', (event) => {
                startX = event.touches[0].clientX;
                stop();
            }, { passive: true });
            media?.addEventListener('touchend', (event) => {
                if (startX !== null) {
                    const delta = event.changedTouches[0].clientX - startX;
                    if (Math.abs(delta) > 35) show(current + (delta < 0 ? 1 : -1));
                }
                startX = null;
                start();
            }, { passive: true });

            dots.forEach((dot, i) => {
                dot.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    show(i);
                    start();
                });
            });

            start();
        }

        favorite?.addEventListener('click', () => {
            favorite.classList.remove('is-popping');
            void favorite.offsetWidth;
            favorite.classList.add('is-popping');
        });

        card.querySelectorAll('.product-card__cart').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        });
    });
})();
