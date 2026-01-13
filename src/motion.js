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
  const track = document.querySelector('.hero-services__track');
  if (!track) return;
  const prevBtn = document.querySelector('.hero-services__btn[data-dir="prev"]');
  const nextBtn = document.querySelector('.hero-services__btn[data-dir="next"]');
  const cards = () => Array.from(track.children);

  let isAnimating = false;

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
})();
