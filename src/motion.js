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
  const shapeImages = Array.from(heroScreen.querySelectorAll('.hero-services__shape-image'));
  const serviceTitle = heroScreen.querySelector('.screen-02__service-title');
  const serviceDesc = heroScreen.querySelector('.screen-02__service-desc');
  const screenHeadline = heroScreen.querySelector('.screen-02__headline');
  const screenSubs = Array.from(heroScreen.querySelectorAll('.screen-02__sub'));
  const priceValue = heroScreen.querySelector('.screen-02__price-value');
  const tabs = Array.from(heroScreen.querySelectorAll('.screen-02__tab'));
  const defaultHeadline = screenHeadline ? screenHeadline.innerHTML : '';
  const defaultSubs = screenSubs.map((el) => el.textContent || '');
  const prevBtn = heroScreen.querySelector('.hero-services__btn[data-dir="prev"]');
  const nextBtn = heroScreen.querySelector('.hero-services__btn[data-dir="next"]');
  const cards = () => Array.from(track.children);

  let isAnimating = false;
  const setShapeImage = (card) => {
    if (!shapeImages.length || !card) return;
    const src = card.dataset.shapeImage;
    if (!src) return;
    const active = shapeImages.find((img) => img.classList.contains('is-active')) || shapeImages[0];
    const inactive = shapeImages.find((img) => img !== active) || shapeImages[0];
    inactive.setAttribute('src', src);
    inactive.classList.add('is-active');
    active.classList.remove('is-active');
  };

  const setServiceCopy = (card) => {
    if (!card) return;
    const activeKey = card.dataset.serviceKey || '';
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

    if (priceValue) {
      priceValue.textContent = card.dataset.price || priceValue.textContent;
    }

    if (tabs.length && activeKey) {
      tabs.forEach((tab) => {
        tab.classList.toggle('is-active', tab.dataset.serviceTab === activeKey);
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

  let activeIndex = 0;

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
    activeIndex = (activeIndex + 1) % track.children.length;
    updateDots(activeIndex);
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
    activeIndex = (activeIndex - 1 + track.children.length) % track.children.length;
    updateDots(activeIndex);
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
