import { gsap } from 'gsap';

/* Motion controller:
   - JS-controlled slide scrolling (one screen per gesture)
   - Per-screen GSAP timelines on entry
   - Respects prefers-reduced-motion
*/

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobileLayout = window.matchMedia('(max-width: 768px)').matches ||
  window.matchMedia('(hover: none) and (pointer: coarse)').matches;
const enableGsapAnimations = !reduceMotion && !isMobileLayout;
// DEBUG: expose to console and document for quick diagnosis
try {
  console.log('[motion] prefers-reduced-motion =', reduceMotion);
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-prefers-reduced-motion', reduceMotion ? 'true' : 'false');
    if (enableGsapAnimations) {
      document.documentElement.setAttribute('data-motion-engine', 'gsap');
    }
    if (isMobileLayout) {
      document.documentElement.setAttribute('data-mobile-layout', 'true');
    }
  }
} catch (e) {
  // ignore
}

if (enableGsapAnimations) {
  gsap.set('.hero-top', { autoAlpha: 1 });
  gsap.from('.hero-top-inner > *', {
    y: -8,
    autoAlpha: 0,
    duration: 0.4,
    ease: 'power2.out',
    stagger: 0.05,
    delay: 0.1
  });
}

// 0) JS-controlled slide scrolling (one screen per gesture)
(function initSlideScroll() {
  const screens = Array.from(document.querySelectorAll('[data-screen]'));
  if (!screens.length) return;
  if (reduceMotion) return;
  if (isMobileLayout) return;

  let currentIndex = 0;
  let isAnimating = false;
  let gestureLock = false;
  const lockMs = 850;
  const wheelMinDelta = 14;
  const wheelCooldownMs = 420;
  let lastWheelAt = 0;

  const clampIndex = (idx) => Math.max(0, Math.min(screens.length - 1, idx));

  const syncIndexToScroll = () => {
    const scrollY = window.scrollY;
    let nearest = 0;
    let minDist = Infinity;
    screens.forEach((screen, i) => {
      const dist = Math.abs(scrollY - screen.offsetTop);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    });
    currentIndex = nearest;
  };

  const goTo = (idx, behavior) => {
    if (isAnimating) return;
    const nextIndex = clampIndex(idx);
    currentIndex = nextIndex;
    isAnimating = true;
    screens[currentIndex].scrollIntoView({
      behavior: behavior || 'auto',
      block: 'start'
    });
    window.setTimeout(() => {
      isAnimating = false;
    }, lockMs);
  };

  const getActiveIndex = () => {
    const scrollY = window.scrollY;
    let nearest = 0;
    let minDist = Infinity;
    screens.forEach((screen, i) => {
      const dist = Math.abs(scrollY - screen.offsetTop);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    });
    return nearest;
  };

  const shouldIgnore = (target) => {
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest('input, textarea, select, [contenteditable="true"]');
  };

  const onWheel = (e) => {
    if (shouldIgnore(e.target)) return;
    e.preventDefault();
    if (gestureLock || isAnimating) return;
    const delta = e.deltaY || 0;
    if (Math.abs(delta) < wheelMinDelta) return;
    const now = Date.now();
    if (now - lastWheelAt < wheelCooldownMs) return;
    lastWheelAt = now;
    const dir = delta > 0 ? 1 : -1;
    currentIndex = getActiveIndex();
    gestureLock = true;
    goTo(currentIndex + dir);
    window.setTimeout(() => {
      gestureLock = false;
    }, lockMs);
  };

  window.addEventListener('wheel', onWheel, { passive: false });

  let touchStartY = 0;
  let touchStartX = 0;

  const onTouchStart = (e) => {
    const touch = e.touches[0];
    touchStartY = touch.clientY;
    touchStartX = touch.clientX;
  };

  const onTouchMove = (e) => {
    if (Math.abs(e.touches[0].clientY - touchStartY) > 6) {
      e.preventDefault();
    }
  };

  const onTouchEnd = (e) => {
    const touch = e.changedTouches[0];
    const deltaY = touchStartY - touch.clientY;
    const deltaX = touchStartX - touch.clientX;
    if (Math.abs(deltaY) < 50 || Math.abs(deltaY) < Math.abs(deltaX)) return;
    const dir = deltaY > 0 ? 1 : -1;
    currentIndex = getActiveIndex();
    goTo(currentIndex + dir);
  };

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd, { passive: true });

  const onKeyDown = (e) => {
    if (shouldIgnore(e.target)) return;
    const code = e.code || e.key;
    if (code === 'ArrowDown' || code === 'PageDown' || code === 'Space') {
      e.preventDefault();
      currentIndex = getActiveIndex();
      goTo(currentIndex + 1);
      return;
    }
    if (code === 'ArrowUp' || code === 'PageUp') {
      e.preventDefault();
      currentIndex = getActiveIndex();
      goTo(currentIndex - 1);
      return;
    }
    if (code === 'Home') {
      e.preventDefault();
      goTo(0);
      return;
    }
    if (code === 'End') {
      e.preventDefault();
      goTo(screens.length - 1);
    }
  };

  window.addEventListener('keydown', onKeyDown);

  const onHashChange = () => {
    const target = document.querySelector(window.location.hash);
    if (!target || !target.matches('[data-screen]')) return;
    const idx = screens.indexOf(target);
    if (idx === -1) return;
    goTo(idx);
  };

  window.addEventListener('hashchange', onHashChange);

  window.addEventListener('resize', () => {
    goTo(currentIndex, 'auto');
  });

  syncIndexToScroll();
  if (window.location.hash) {
    onHashChange();
  } else {
    goTo(currentIndex, 'auto');
  }
})();

// 1) Slide activation
(function initSlideReveal() {
  const slides = document.querySelectorAll('[data-screen]');
  if (!slides.length) return;

  const setActive = (el, isActive) => {
    el.classList.toggle('is-active', isActive);
  };

  if (reduceMotion || isMobileLayout) {
    slides.forEach((el) => setActive(el, true));
    return;
  }

  const buildScreenTimelines = (screenList) => {
    if (!enableGsapAnimations) return new Map();
    const map = new Map();

    screenList.forEach((screen) => {
      const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
      const resetters = [];
      const q = (sel) => screen.querySelectorAll(sel);

      const add = (targets, fromVars, toVars, position) => {
        const items = gsap.utils.toArray(targets).filter(Boolean);
        if (!items.length) return;
        const from = { autoAlpha: 0, y: 24, ...fromVars };
        const to = { autoAlpha: 1, y: 0, duration: 0.6, ...toVars };
        gsap.set(items, from);
        resetters.push(() => gsap.set(items, from));
        tl.to(items, to, position);
      };

      const addText = (targets, fromVars, toVars, position) => {
        add(targets, { y: 14, ...fromVars }, { duration: 0.38, ...toVars }, position);
      };

      const addTextInstant = (targets, fromVars, toVars, position) => {
        add(targets, { y: 10, autoAlpha: 1, ...fromVars }, { duration: 0.2, autoAlpha: 1, ...toVars }, position);
      };

      const addObject = (targets, fromVars, toVars, position) => {
        add(
          targets,
          { y: 28, z: -60, rotationX: 6, transformPerspective: 900, filter: 'blur(10px)', ...fromVars },
          { duration: 0.7, filter: 'blur(0px)', ...toVars },
          position
        );
      };

      switch (screen.id) {
        case 'screen-01':
          addText(q('.hero-type .type-ghost'), { y: 10, x: -6 }, { duration: 0.42, stagger: 0.08 }, '-=0.25');
          addObject(q('.hero-figure'), { y: 32, scale: 0.965, rotate: -0.6 }, { duration: 0.75 }, '-=0.15');
          addText(q('.hero-copy > *'), { y: 16 }, { duration: 0.4, stagger: 0.08 }, '-=0.35');
          addText(q('.hero-cta-row'), { y: 10, x: -6 }, { duration: 0.35 }, '-=0.25');
          break;
        case 'screen-02':
          add(q('.screen-02__env'), { y: 0 }, { duration: 0.5 });
          addText(q('.screen-02__ghost'), { y: 8, x: 8 }, { duration: 0.42, stagger: 0.08 }, '-=0.3');
          addText(q('.screen-02__eyebrow'), { y: 10, autoAlpha: 0 }, { duration: 0.35 }, '-=0.3');
          addText(q('.screen-02__headline'), { y: 14, autoAlpha: 0 }, { duration: 0.4 }, '-=0.35');
          addText(q('.screen-02__body p'), { y: 14, autoAlpha: 0 }, { duration: 0.38, stagger: 0.08 }, '-=0.3');
          addText(q('.screen-02__facts .fact'), { y: 16, x: -6 }, { duration: 0.4, stagger: 0.08 }, '-=0.25');
          addObject(q('.screen-02__figure'), { y: 26, scale: 0.98, rotate: 0.6 }, { duration: 0.75 }, '-=0.4');
          addObject(q('.screen-02__quote'), { y: 12, x: 6, z: -40 }, { duration: 0.6 }, '-=0.45');
          break;
        case 'screen-03':
          add(q('.screen-03__env'), { y: 0 }, { duration: 0.5 });
          addText(q('.screen-03__headline'), { y: 14, x: -8 }, { duration: 0.4 }, '-=0.3');
          addText(q('.screen-03__intro'), { y: 14, x: -6 }, { duration: 0.38 }, '-=0.3');
          addText(q('.process-block'), { y: 18, x: -10 }, { duration: 0.45, stagger: 0.1 }, '-=0.25');
          addText(q('.screen-03__footer-note'), { y: 10, x: -6 }, { duration: 0.32 }, '-=0.2');
          addObject(q('.screen-03__figure'), { y: 28, x: 14, scale: 0.98 }, { duration: 0.72 }, '-=0.55');
          break;
        case 'screen-04':
          add(q('.screen-04__env'), { y: 0 }, { duration: 0.5 });
          addText(q('.screen-04__headline'), { y: 14, x: 6 }, { duration: 0.4 }, '-=0.35');
          addText(q('.screen-04__subhead'), { y: 14, x: 6 }, { duration: 0.38 }, '-=0.35');
          addObject(q('.pricing-card'), { y: 24, scale: 0.97, rotate: -0.4 }, { duration: 0.65, stagger: 0.12 }, '-=0.25');
          addObject(q('.screen-04__fig-wrap'), { y: 24, scale: 0.97, rotate: 0.6 }, { duration: 0.7, stagger: 0.1 }, '-=0.45');
          break;
        case 'screen-05':
          add(q('.screen-05__env'), { y: 0 }, { duration: 0.5 });
          addText(q('.screen-05__ghost'), { y: 10, x: 8 }, { duration: 0.4, stagger: 0.08 }, '-=0.25');
          addText(q('.screen-05__headline'), { y: 14, autoAlpha: 0 }, { duration: 0.4 }, '-=0.35');
          addText(q('.screen-05__lead'), { y: 14, autoAlpha: 0 }, { duration: 0.38 }, '-=0.35');
          addText(q('.screen-05__body p'), { y: 14, x: -6 }, { duration: 0.4, stagger: 0.08 }, '-=0.3');
          addText(q('.screen-05__quote .q, .screen-05__quote .a'), { y: 8, x: 6 }, { duration: 0.32, stagger: 0.08 }, '-=0.25');
          addText(q('.screen-05__facts .fact'), { y: 16, x: -6 }, { duration: 0.4, stagger: 0.08 }, '-=0.25');
          addText(q('.screen-05__softcta'), { y: 10, x: -6 }, { duration: 0.32 }, '-=0.2');
          addObject(q('.screen-05__figure'), { y: 28, scale: 0.98, rotate: -0.5 }, { duration: 0.72 }, '-=0.55');
          break;
        case 'screen-06':
          add(q('.contact-screen__env'), { y: 0 }, { duration: 0.5 });
          addTextInstant(q('.contact-screen__header > *'), { y: 10 }, { duration: 0.22, stagger: 0.06 }, '-=0.3');
          addObject(q('.footer__brand'), { y: 18, x: -8 }, { duration: 0.6 }, '-=0.2');
          addText(q('.footer__nav'), { y: 14, x: 8 }, { duration: 0.4, stagger: 0.1 }, '-=0.25');
          addObject(q('.footer__social-link'), { y: 10, scale: 0.96, z: -30 }, { duration: 0.45, stagger: 0.05 }, '-=0.35');
          addTextInstant(q('.footer__bottom'), { y: 6 }, { duration: 0.2 }, '-=0.2');
          break;
        default:
          add(q('[data-layer="env"]'), { y: 0 }, { duration: 0.5 });
          add(q('[data-layer="type"]'), { y: 12 }, { duration: 0.45 }, '-=0.3');
          add(q('[data-layer="text"]'), { y: 16 }, { duration: 0.5 }, '-=0.3');
          add(q('[data-layer="figure"]'), { y: 22, scale: 0.98 }, { duration: 0.6 }, '-=0.3');
          break;
      }

      map.set(screen, {
        tl,
        reset: () => resetters.forEach((fn) => fn())
      });
    });

    return map;
  };

  const timelines = buildScreenTimelines(slides);

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      setActive(e.target, e.isIntersecting);
      if (!enableGsapAnimations) return;
      const entry = timelines.get(e.target);
      if (!entry) return;
      if (e.isIntersecting) {
        entry.tl.restart(true);
      } else {
        entry.tl.pause(0);
        if (e.target.id === 'screen-04') {
          const cards = e.target.querySelectorAll('.pricing-card');
          if (cards.length) {
            gsap.to(cards, {
              autoAlpha: 0,
              y: 26,
              scale: 0.98,
              duration: 0.35,
              stagger: 0.06,
              onComplete: () => entry.reset()
            });
            return;
          }
        }
        entry.reset();
      }
    });
  }, { threshold: 0.55 });

  slides.forEach(s => io.observe(s));
})();

// 2) Subtle parallax (active slide only)
(function initParallax() {
  if (reduceMotion || enableGsapAnimations) return;

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
  if (reduceMotion || enableGsapAnimations) return;

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

// 4) Hero services carousel
(function initHeroServicesCarousel() {
  const heroScreen = document.querySelector('#screen-02');
  if (!heroScreen) return;
  const track = heroScreen.querySelector('.hero-services__track');
  if (!track) return;
  const shape = heroScreen.querySelector('.hero-services__shape-path');
  const shapeImages = Array.from(heroScreen.querySelectorAll('.hero-services__shape-image'));
  const serviceTitle = heroScreen.querySelector('.screen-02__service-title');
  const serviceDesc = heroScreen.querySelector('.screen-02__service-desc');
  const screenHeadline = heroScreen.querySelector('.screen-02__headline');
  const screenSubs = Array.from(heroScreen.querySelectorAll('.screen-02__sub'));
  const defaultHeadline = screenHeadline ? screenHeadline.innerHTML : '';
  const defaultSubs = screenSubs.map((el) => el.textContent || '');
  const prevBtn = heroScreen.querySelector('.hero-services__btn[data-dir="prev"]');
  const nextBtn = heroScreen.querySelector('.hero-services__btn[data-dir="next"]');
  const cards = () => Array.from(track.children);

  let isAnimating = false;
  let shapeIndex = 0;
  const morphState = { t: 0 };
  let morphTween = null;

  const rawShapes = [
    // diamond
    'M49.5511 169.059C74.3326 188.98 109.667 188.98 134.449 169.059C140.75 163.993 146.841 158.536 152.689 152.689C158.536 146.841 163.993 140.75 169.059 134.449C188.98 109.667 188.98 74.3326 169.059 49.5511C163.993 43.2499 158.536 37.1591 152.689 31.3113C146.841 25.4636 140.75 20.0069 134.449 14.9413C109.667 -4.98045 74.3326 -4.98044 49.5511 14.9413C43.2499 20.0069 37.1591 25.4636 31.3113 31.3113C25.4636 37.1591 20.0069 43.2499 14.9413 49.5511C-4.98045 74.3326 -4.98044 109.667 14.9413 134.449C20.0069 140.75 25.4636 146.841 31.3113 152.689C37.1591 158.536 43.2499 163.993 49.5511 169.059Z',
    // pill
    'M153.587 22.4127C183.471 52.2963 183.471 100.747 153.587 130.631L130.631 153.587C100.747 183.471 52.2963 183.471 22.4127 153.587C-7.4709 123.704 -7.4709 75.2528 22.4127 45.3692L45.3692 22.4127C75.2528 -7.4709 123.704 -7.4709 153.587 22.4127Z',
    // clover
    'M92 12C80.568 12 69.9033 6.62805 59.1725 2.68596C54.4428 0.948493 49.3322 0 44 0C19.6995 0 0 19.6995 0 44C0 49.3322 0.948493 54.4428 2.68596 59.1725C6.62806 69.9033 12 80.568 12 92C12 103.432 6.62806 114.097 2.68596 124.828C0.948493 129.557 0 134.668 0 140C0 164.301 19.6995 184 44 184C49.3322 184 54.4428 183.052 59.1724 181.314C69.9033 177.372 80.568 172 92 172C103.432 172 114.097 177.372 124.828 181.314C129.557 183.052 134.668 184 140 184C164.301 184 184 164.301 184 140C184 134.668 183.052 129.557 181.314 124.828C177.372 114.097 172 103.432 172 92C172 80.568 177.372 69.9033 181.314 59.1724C183.052 54.4428 184 49.3322 184 44C184 19.6995 164.301 0 140 0C134.668 0 129.557 0.948493 124.828 2.68596C114.097 6.62806 103.432 12 92 12Z',
    // hive
    'M1200.18 600C1200.18 678.966 1150.09 747.415 1121.75 816.043C1092.16 887.166 1078.07 970.767 1024.42 1024.24C970.766 1077.9 887.344 1091.98 816.221 1121.57C747.594 1150.09 679.144 1200 600.178 1200C521.212 1200 452.763 1149.91 384.135 1121.57C313.012 1091.98 229.412 1077.9 175.936 1024.24C122.282 970.588 108.2 887.166 78.6096 816.043C50.0891 747.415 0 678.966 0 600C0 521.034 50.0891 452.585 78.4314 383.957C108.021 312.834 122.103 229.234 175.758 175.758C229.412 122.103 312.834 108.021 383.957 78.4314C452.585 49.9109 521.034 0 600 0C678.966 0 747.415 50.0891 816.043 78.4314C887.166 108.021 970.766 122.103 1024.24 175.758C1077.9 229.412 1091.98 312.834 1121.57 383.957C1150.27 452.585 1200.18 521.034 1200.18 600Z',
    // scallop
    'M214.517 1.09144C218.079 0.415939 223.099 1.21243 227.367 3.51621C232.185 6.11741 237.245 8.11368 242.103 10.5788C249.867 14.5209 257.722 18.3269 265.986 21.1499C268.155 21.891 270.673 22.0472 272.807 22.1027C277.66 22.2287 282.387 23.5545 287.21 23.3428C292.492 23.1109 297.628 24.3712 302.88 24.593C309.635 24.8803 316.249 26.6296 322.066 30.4709C325.986 33.062 329.154 36.5101 331.818 40.2405C334.597 44.1373 337.332 48.0844 340.036 52.0467C343.487 57.1029 346.841 62.2196 350.383 67.2103C353.415 71.4801 357.158 75.0442 361.573 77.9428C365.442 80.4835 369.15 83.2712 372.959 85.9178C376.889 88.65 380.92 91.2512 384.785 94.0742C391.207 98.7625 397.493 103.693 400.328 111.496C401.635 115.101 402.477 118.836 402.881 122.788C403.365 127.522 403.022 132.331 403.885 136.929C404.51 140.266 403.955 143.668 404.818 146.789C406.251 151.986 404.803 157.446 406.74 162.517C407.891 165.527 409.434 168.4 410.539 171.384C412.668 177.146 415.751 182.444 418.132 188.08C420.13 192.819 422.425 197.522 424.902 202.09C426.269 204.605 426.506 207.499 426.743 210.201C427.147 214.733 427.268 219.375 425.79 223.817C425.301 225.299 424.468 226.665 423.838 228.102C418.929 239.318 413.581 250.323 408.375 261.403C406.851 264.649 405.222 268.264 405.62 272.312C406.17 277.973 404.742 283.579 404.354 289.21C404.102 292.9 404.435 296.776 403.506 300.32C402.528 304.04 402.704 307.836 401.983 311.567C401.307 315.035 400.005 318.055 398.467 321.024C396.005 325.778 392.16 329.321 387.696 332.235C384.512 334.312 381.399 336.5 378.261 338.647C374.109 341.496 369.937 344.344 365.881 347.298C361.542 350.459 356.714 353.176 353.349 357.511C350.464 361.232 347.77 365.118 345.222 369.081C344.052 370.905 342.599 372.498 341.342 374.232C339.057 377.388 337.165 380.791 334.819 383.891C331.969 387.662 329.603 391.801 325.935 394.946C321.667 398.611 316.996 401.243 311.426 402.584C308.5 403.284 305.549 402.851 302.794 403.557C298.566 404.645 294.243 403.778 290.156 404.625C286.817 405.316 283.436 404.807 280.278 405.583C275.072 406.863 269.659 405.941 264.548 407.514C259.539 409.056 254.988 411.647 250.357 414.007C241.437 418.549 232.25 422.521 223.008 426.292C217.797 428.419 212.05 428.127 206.35 426.856C198.928 425.208 192.637 421.165 185.862 418.15C178.108 414.702 170.419 411.098 162.62 407.761C160.935 407.04 158.816 406.571 157.106 406.626C151.471 406.813 145.982 405.618 140.432 405.215C135.372 404.847 130.236 405.018 125.277 404.207C122.129 403.693 118.809 404.197 115.939 403.148C112.559 401.918 109.073 400.744 105.945 398.803C101.828 396.252 98.8214 392.663 95.7742 388.978C92.5909 385.126 90.2147 380.746 87.1373 376.834C85.4674 374.711 83.7773 372.554 82.3294 370.215C80.0743 366.565 77.229 363.283 74.9436 359.644C71.1044 353.529 64.8386 350.544 59.1731 346.698C56.1713 344.661 53.4773 342.141 50.3898 340.195C46.1167 337.503 42.0505 334.489 37.9843 331.529C32.8384 327.784 28.6814 322.944 26.3657 316.794C25.2861 313.926 24.7816 310.977 24.1914 307.983C23.3236 303.577 24.0249 299.085 23.1168 294.846C22.4004 291.493 22.9957 288.131 22.2087 284.965C21.1997 280.902 21.8253 276.803 21.1947 272.821C20.4884 268.39 20.1503 263.671 17.9558 259.724C14.6766 253.811 12.0128 247.631 9.10189 241.561C5.94375 234.983 2.47787 228.505 0.409435 221.462C-0.095061 219.748 0.258086 217.798 0.106737 215.963C-0.473433 208.94 1.55464 202.674 4.71278 196.428C6.8468 192.204 8.61758 187.692 10.5347 183.322C12.6788 178.442 15.2315 173.693 17.4917 168.834C18.8639 165.884 19.661 162.693 20.4934 159.502C21.4772 155.747 20.6498 151.951 21.4721 148.367C22.4458 144.132 21.6437 139.807 22.5366 135.744C23.364 131.978 22.6426 128.182 23.5052 124.613C24.4083 120.878 24.5092 117.046 25.7957 113.291C27.183 109.243 29.1556 105.719 31.6983 102.543C34.0694 99.5741 37.1821 97.1947 40.3453 95.0018C44.2804 92.2695 48.4223 89.8448 52.1959 86.8605C54.4611 85.0709 57.0492 83.6795 59.3194 81.895C62.4473 79.44 66.014 77.6806 69.0763 75.0845C74.0961 70.8298 77.3248 65.2796 81.0732 60.0822C83.7773 56.3266 86.6277 52.6617 89.125 48.7751C91.9502 44.3843 94.9317 40.0792 98.2664 36.1219C101.49 32.2958 105.516 29.1249 110.44 27.3958C116.923 25.1173 123.678 24.9005 130.413 24.1494C134.736 23.6654 139.146 24.099 143.303 23.1764C147.238 22.3043 151.158 22.9445 154.957 22.2237C158.72 21.5078 162.529 20.8172 166.141 19.2343C171.529 16.87 176.594 13.7647 182.063 11.7332C187.29 9.79236 191.82 6.42491 197.254 4.97812C198.585 4.62524 199.932 3.67752 201.108 2.95665C204.947 0.602459 209.028 1.35862 214.522 1.07632L214.517 1.09144Z'
  ];

  const initMorphing = () => {
    if (!shape) return null;
    const svgNS = 'http://www.w3.org/2000/svg';
    const tempSvg = document.createElementNS(svgNS, 'svg');
    const tempPath = document.createElementNS(svgNS, 'path');
    tempSvg.setAttribute('width', '0');
    tempSvg.setAttribute('height', '0');
    tempSvg.style.position = 'absolute';
    tempSvg.style.left = '-9999px';
    tempSvg.style.top = '-9999px';
    tempSvg.style.opacity = '0';
    tempSvg.appendChild(tempPath);
    document.body.appendChild(tempSvg);

    const sampleCount = 72;
    const normalizePoints = (d) => {
      tempPath.setAttribute('d', d);
      const len = tempPath.getTotalLength();
      const bbox = tempPath.getBBox();
      const pts = [];
      for (let i = 0; i < sampleCount; i++) {
        const p = tempPath.getPointAtLength((len * i) / (sampleCount - 1));
        const x = ((p.x - bbox.x) / bbox.width) * 200;
        const y = ((p.y - bbox.y) / bbox.height) * 200;
        pts.push([x, y]);
      }
      return pts;
    };

    const pointsToPath = (pts) => {
      if (!pts.length) return '';
      const parts = [`M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`];
      for (let i = 1; i < pts.length; i++) {
        parts.push(`L${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`);
      }
      parts.push('Z');
      return parts.join(' ');
    };

    const polygonArea = (pts) => {
      let sum = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        sum += (x1 * y2 - x2 * y1);
      }
      return sum / 2;
    };

    const normalizeWinding = (pts, clockwise) => {
      const isClockwise = polygonArea(pts) < 0;
      if (isClockwise === clockwise) return pts;
      return pts.slice().reverse();
    };

    const shapesPoints = rawShapes.map((d) => normalizeWinding(normalizePoints(d), true));
    shape.setAttribute('d', pointsToPath(shapesPoints[0]));

    return { pointsToPath, shapesPoints, tempSvg };
  };

  const morphData = initMorphing();
  const setShapeImage = (card) => {
    if (!shapeImages.length || !card) return;
    const src = card.dataset.shapeImage;
    if (!src) return;
    const active = shapeImages.find((img) => img.classList.contains('is-active')) || shapeImages[0];
    const inactive = shapeImages.find((img) => img !== active) || shapeImages[0];
    inactive.setAttribute('href', src);
    inactive.setAttributeNS('http://www.w3.org/1999/xlink', 'href', src);
    inactive.classList.add('is-active');
    active.classList.remove('is-active');
  };

  const setServiceCopy = (card) => {
    if (!card) return;
    if (serviceTitle) {
      const fallbackTitle = card.querySelector('.hero-service-card__title');
      serviceTitle.textContent = fallbackTitle ? fallbackTitle.textContent : '';
    }
    if (serviceDesc) {
      const desc = card.dataset.desc || '';
      if (desc) {
        serviceDesc.textContent = desc;
      } else {
        const fallbackDesc = card.querySelector('.hero-service-card__desc');
        serviceDesc.textContent = fallbackDesc ? fallbackDesc.textContent : '';
      }
    }

    if (screenHeadline && card.dataset.headline) {
      screenHeadline.innerHTML = card.dataset.headline;
    }
    if (screenSubs.length) {
      screenSubs[0].textContent = card.dataset.sub1 || defaultSubs[0] || '';
      if (screenSubs[1]) {
        screenSubs[1].textContent = card.dataset.sub2 || defaultSubs[1] || '';
      }
    }

    const facts = card.dataset.facts;
    if (facts) {
      const factItems = facts.split('|').map((item) => {
        const parts = item.split(':');
        return { k: parts[0] || '', v: parts.slice(1).join(':') || '' };
      });
      const factEls = heroScreen.querySelectorAll('.screen-02__facts .fact');
      factEls.forEach((el, idx) => {
        const data = factItems[idx];
        if (!data) return;
        const key = el.querySelector('.fact__k');
        const val = el.querySelector('.fact__v');
        if (key) key.textContent = data.k;
        if (val) val.textContent = data.v;
      });
    }
  };

  setShapeImage(track.children[0]);
  setServiceCopy(track.children[0]);

  const dotsContainer = heroScreen.querySelector('.hero-services__dots');

  // Create dots based on initial card count
  if (dotsContainer) {
    const cardCount = track.children.length;
    dotsContainer.innerHTML = '';
    for (let i = 0; i < cardCount; i++) {
      const dot = document.createElement('div');
      dot.className = 'hero-services__dot' + (i === 0 ? ' is-active' : '');
      dotsContainer.appendChild(dot);
    }
  }

  const updateDots = (index) => {
    if (!dotsContainer) return;
    const dots = Array.from(dotsContainer.children);
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === index);
    });
  };

  const morphShape = (dir) => {
    if (!shape || !morphData) return;
    const { pointsToPath, shapesPoints } = morphData;
    const from = shapesPoints[shapeIndex];
    shapeIndex = (shapeIndex + (dir === 'next' ? 1 : -1) + shapesPoints.length) % shapesPoints.length;

    // Update dots with new shapeIndex
    updateDots(shapeIndex);

    let to = shapesPoints[shapeIndex];
    if (!from || !to) return;

    const rotateToMatch = (fromPts, toPts) => {
      const len = fromPts.length;
      let bestOffset = 0;
      let bestScore = Infinity;
      for (let offset = 0; offset < len; offset++) {
        let score = 0;
        for (let i = 0; i < len; i++) {
          const [fx, fy] = fromPts[i];
          const [tx, ty] = toPts[(i + offset) % len];
          const dx = fx - tx;
          const dy = fy - ty;
          score += dx * dx + dy * dy;
        }
        if (score < bestScore) {
          bestScore = score;
          bestOffset = offset;
        }
      }
      return toPts.map((_, i) => toPts[(i + bestOffset) % len]);
    };

    to = rotateToMatch(from, to);

    if (morphTween) morphTween.kill();
    morphState.t = 0;
    morphTween = gsap.to(morphState, {
      t: 1,
      duration: 0.5,
      ease: 'power2.inOut',
      onUpdate: () => {
        const pts = from.map((p, i) => [
          p[0] + (to[i][0] - p[0]) * morphState.t,
          p[1] + (to[i][1] - p[1]) * morphState.t
        ]);
        shape.setAttribute('d', pointsToPath(pts));
      }
    });
  };

  const getOffset = () => {
    const first = track.children[0];
    if (!first) return 0;
    const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || 0);
    return first.getBoundingClientRect().width + gap;
  };

  const shiftNext = () => {
    if (isAnimating) return;
    const first = track.children[0];
    if (!first) return;
    isAnimating = true;
    const offset = getOffset();

    const nextCard = track.children[1] || first;
    setShapeImage(nextCard);
    setServiceCopy(nextCard);
    morphShape('next');
    gsap.to(first, {
      autoAlpha: 0,
      y: 28,
      scale: 0.9,
      rotationX: 12,
      transformPerspective: 800,
      duration: 0.35
    });

    gsap.to(track, {
      x: -offset,
      duration: 0.45,
      ease: 'power2.inOut',
      onComplete: () => {
        track.appendChild(first);
        gsap.set(track, { x: 0 });
        gsap.set(first, { autoAlpha: 1, y: 0, scale: 1, rotationX: 0 });
        isAnimating = false;
      }
    });
  };

  const shiftPrev = () => {
    if (isAnimating) return;
    const items = cards();
    const last = items[items.length - 1];
    if (!last) return;
    isAnimating = true;
    const offset = getOffset();

    setShapeImage(last);
    setServiceCopy(last);
    morphShape('prev');
    track.insertBefore(last, track.firstChild);
    gsap.set(track, { x: -offset });
    gsap.fromTo(last, { autoAlpha: 0, scale: 0.92 }, { autoAlpha: 1, scale: 1, duration: 0.35 });
    gsap.to(track, {
      x: 0,
      duration: 0.45,
      ease: 'power2.inOut',
      onComplete: () => {
        isAnimating = false;
      }
    });
  };

  if (nextBtn) {
    nextBtn.addEventListener('click', shiftNext);
  }
  if (prevBtn) {
    prevBtn.addEventListener('click', shiftPrev);
  }

  const shouldIgnore = (target) => {
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest('input, textarea, select, [contenteditable="true"]');
  };

  const onKeyDown = (e) => {
    if (shouldIgnore(e.target)) return;
    if (heroScreen && !heroScreen.classList.contains('is-active')) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      shiftNext();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      shiftPrev();
    }
  };

  window.addEventListener('keydown', onKeyDown);
})();

// 5) Screen 03/04: Steps -> image + description swap
(function initScreen03Steps() {
  const screens = Array.from(document.querySelectorAll('.screen-03'));
  if (!screens.length) return;

  screens.forEach((screen) => {
    const steps = Array.from(screen.querySelectorAll('.screen-03__step'));
    const photo = screen.querySelector('.screen-03__photo');
    const descTitle = screen.querySelector('.screen-03__desc-title');
    const descBody = screen.querySelector('.screen-03__desc-body');

    if (!steps.length || !photo || !descTitle || !descBody) return;

    const setActive = (step) => {
      if (!step) return;
      steps.forEach((el) => el.classList.toggle('is-active', el === step));
      descTitle.textContent = step.dataset.title || '';
      descBody.textContent = step.dataset.desc || '';
      const img = step.dataset.image;
      if (img) photo.setAttribute('src', img);
      const alt = step.dataset.alt;
      if (alt) photo.setAttribute('alt', alt);
    };

    steps.forEach((step) => {
      step.addEventListener('click', () => setActive(step));
      step.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setActive(step);
        }
      });
    });

    const initial = steps.find((el) => el.classList.contains('is-active')) || steps[0];
    setActive(initial);
  });
})();

// 6) Modal system (Plan a trip + Call me back)
(function initModals() {
  const triggers = Array.from(document.querySelectorAll('[data-modal-open]'));
  if (!triggers.length) return;

  const openModal = (modal) => {
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    const firstInput = modal.querySelector('input, textarea, button');
    if (firstInput) firstInput.focus();
  };

  const closeModal = (modal) => {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal.is-open')) {
      document.body.classList.remove('modal-open');
    }
  };

  triggers.forEach((btn) => {
    const target = btn.getAttribute('data-modal-open');
    if (!target) return;
    const modal = document.querySelector(`#${target}-modal`);
    if (!modal) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(modal);
    });
  });

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches('[data-modal-close]')) {
      const modal = target.closest('.modal');
      closeModal(modal);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const openModalEl = document.querySelector('.modal.is-open');
    if (openModalEl) closeModal(openModalEl);
  });
})();

// 7) Styled calendar for Plan a trip date input
(function initPlanTripCalendar() {
  const modal = document.querySelector('#plan-trip-modal');
  if (!modal) return;

  const input = modal.querySelector('[data-date-picker]');
  const calendar = modal.querySelector('.modal__calendar');
  if (!input || !calendar) return;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  let current = new Date();
  let selected = null;
  let isOpen = false;

  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const parseInput = () => {
    if (!input.value) return null;
    const [y, m, d] = input.value.split('-').map((v) => parseInt(v, 10));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  };

  const render = () => {
    const year = current.getFullYear();
    const month = current.getMonth();
    const first = new Date(year, month, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const selectedValue = selected ? formatDate(selected) : '';

    const header = `
      <div class="modal__calendar-header">
        <button class="modal__calendar-btn" type="button" data-cal="prev">‹</button>
        <div>${monthNames[month]} ${year}</div>
        <button class="modal__calendar-btn" type="button" data-cal="next">›</button>
      </div>
    `;

    let grid = '<div class="modal__calendar-grid">';
    weekDays.forEach((day) => {
      grid += `<div class="modal__calendar-weekday">${day}</div>`;
    });

    for (let i = 0; i < startDay; i++) {
      grid += '<div class="modal__calendar-day is-empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const value = formatDate(date);
      const selectedClass = value === selectedValue ? ' is-selected' : '';
      grid += `<button class="modal__calendar-day${selectedClass}" type="button" data-date="${value}">${day}</button>`;
    }

    grid += '</div>';
    calendar.innerHTML = header + grid;
  };

  const open = () => {
    if (isOpen) return;
    isOpen = true;
    calendar.classList.add('is-open');
    calendar.setAttribute('aria-hidden', 'false');
    const parsed = parseInput();
    if (parsed) {
      selected = parsed;
      current = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
    }
    render();
  };

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    calendar.classList.remove('is-open');
    calendar.setAttribute('aria-hidden', 'true');
  };

  input.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen) {
      close();
    } else {
      open();
    }
  });
  input.addEventListener('focus', open);

  calendar.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    e.preventDefault();
    e.stopPropagation();
    const control = target.getAttribute('data-cal');
    if (control === 'prev') {
      current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
      render();
      return;
    }
    if (control === 'next') {
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      render();
      return;
    }
    const dateValue = target.getAttribute('data-date');
    if (dateValue) {
      input.value = dateValue;
      selected = parseInput();
      close();
    }
  });

  document.addEventListener('pointerdown', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target === input || calendar.contains(target)) return;
    close();
  }, true);
})();

// 8) Team cards flip (screen-04)
(function initTeamCardFlip() {
  const cards = Array.from(document.querySelectorAll('[data-team-card]'));
  if (!cards.length) return;

  const toggleCard = (card) => {
    const isFlipped = card.classList.toggle('is-flipped');
    card.setAttribute('aria-pressed', isFlipped ? 'true' : 'false');
  };

  cards.forEach((card) => {
    card.addEventListener('click', () => toggleCard(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCard(card);
      }
    });
  });
})();
