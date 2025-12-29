/* Motion controller (restrained):
   - Adds .is-active to slides when 60% in view
   - Optional subtle parallax for elements with [data-parallax="figure"]
   - Respects prefers-reduced-motion
   - Enhanced scroll snap for slide switching
*/

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 0) Enhanced scroll snap for reliable slide switching
(function initScrollSnap() {
  if (reduceMotion) return;

  const screens = document.querySelectorAll('[data-screen]');
  if (!screens.length) return;

  let isScrolling = false;
  let scrollTimeout = null;

  const snapToScreen = () => {
    if (isScrolling) return;
    isScrolling = true;

    const viewportHeight = window.innerHeight;
    const scrollY = window.scrollY;
    const currentScreenIndex = Math.round(scrollY / viewportHeight);
    const targetScreen = screens[currentScreenIndex] || screens[0];

    if (targetScreen) {
      const targetTop = targetScreen.offsetTop;
      const distance = Math.abs(scrollY - targetTop);

      // Snap if we're close enough (within 30% of viewport)
      if (distance < viewportHeight * 0.3) {
        window.scrollTo({
          top: targetTop,
          behavior: 'smooth'
        });
      }
    }

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      isScrolling = false;
    }, 150);
  };

  // Handle wheel events for better control
  let wheelTimeout = null;
  let lastWheelTime = 0;

  window.addEventListener('wheel', (e) => {
    if (reduceMotion) return;

    const now = Date.now();
    if (now - lastWheelTime < 100) return; // Throttle
    lastWheelTime = now;

    clearTimeout(wheelTimeout);
    wheelTimeout = setTimeout(() => {
      snapToScreen();
    }, 150);
  }, { passive: true });

  // Handle scroll events
  window.addEventListener('scroll', () => {
    if (reduceMotion) return;
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(snapToScreen, 100);
  }, { passive: true });

  // Handle touch events for mobile
  let touchStartY = 0;
  let touchEndY = 0;

  document.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY - touchEndY;

    // If significant swipe (more than 50px), snap to next/prev screen
    if (Math.abs(diff) > 50) {
      setTimeout(snapToScreen, 200);
    }
  }, { passive: true });
})();

// 1) Slide activation
(function initSlideReveal() {
  const slides = document.querySelectorAll('[data-screen]');
  if (!slides.length) return;

  const activate = (el) => el.classList.add('is-active');

  if (reduceMotion) {
    slides.forEach(activate);
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) activate(e.target);
    });
  }, { threshold: 0.6 });

  slides.forEach(s => io.observe(s));
})();

// 2) Subtle parallax (active slide only)
(function initParallax() {
  if (reduceMotion) return;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  let raf = null;
  let lastY = window.scrollY;

  const onScroll = () => {
    lastY = window.scrollY;
    if (raf) return;

    raf = requestAnimationFrame(() => {
      raf = null;
      const active = document.querySelector('[data-screen].is-active');
      if (!active) return;

      const figs = active.querySelectorAll('[data-parallax="figure"]');
      if (!figs.length) return;

      const rect = active.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const viewportCenter = window.innerHeight / 2;
      const delta = (viewportCenter - center) / window.innerHeight; // ~[-0.5..0.5]

      const y = clamp(delta * 18, -14, 14);

      figs.forEach((el) => {
        el.style.transform = `translate3d(0, ${y}px, 0)`;
      });
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// 3) Scroll-driven fade for Screen 2 Figure
(function initScrollFade() {
  if (reduceMotion) return;

  const screen2 = document.querySelector('.screen-02');
  if (!screen2) return;
  const figures = screen2.querySelectorAll('[data-layer="figure"]');
  if (!figures.length) return;

  // Set initial state
  figures.forEach(f => f.style.opacity = '0');

  let raf = null;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;

      const rect = screen2.getBoundingClientRect();
      const viewH = window.innerHeight;

      // Calculate progress: 
      // 0 when top of screen is at bottom of viewport
      // 1 when top of screen is at top of viewport (scrolled fully in)
      // We want it to be fully visible slightly earlier, say when it's 50% in view

      // Distance from bottom of viewport
      const distFromBottom = viewH - rect.top;

      // Reveal range: start when it enters, finish when 60% of screen is visible
      const start = 0;
      const end = viewH * 0.8;

      let progress = (distFromBottom - start) / (end - start);
      progress = Math.max(0, Math.min(1, progress));

      figures.forEach(f => {
        f.style.opacity = progress.toFixed(3);
      });
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
