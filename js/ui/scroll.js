// Scroll-hantering: header show/hide, scroll-to-top, smooth scroll, steg-toggle.

export const headerEl  = document.querySelector('header');
export const scrollBtn = document.getElementById('scrolltop');

const HEADER_SHOW_THRESHOLD = 80;

// Cacha header-höjden så scroll-handlern slipper läsa offsetHeight (tvingad reflow)
// på varje frame. ResizeObserver håller värdet aktuellt när headern ändrar storlek.
let headerHeight = headerEl.offsetHeight;
new ResizeObserver(() => {
  headerHeight = headerEl.offsetHeight;
  document.body.style.paddingTop = headerHeight + 'px';
  // Exponeras för CSS (t.ex. scroll-margin-top på snap-ankare i premiumvyn)
  document.documentElement.style.setProperty('--header-h', headerHeight + 'px');
}).observe(headerEl);

window.addEventListener('scroll', () => {
  const y = window.scrollY;
  scrollBtn.classList.toggle('visible', y > 400);

  if (!window.isSnapping) {
    if (y > window.lastScrollY) {
      window.scrollUpAccum = 0;
      if (y > headerHeight) headerEl.classList.add('header-hidden');
    } else {
      window.scrollUpAccum += window.lastScrollY - y;
      if (window.scrollUpAccum >= HEADER_SHOW_THRESHOLD) headerEl.classList.remove('header-hidden');
    }
  }
  window.lastScrollY = y;
}, { passive: true });

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

scrollBtn.addEventListener('click', () => {
  if (prefersReducedMotion()) window.scrollTo(0, 0);
  else window.scrollTo({ top: 0, behavior: 'smooth' });
});

export function smoothScrollTo(target, duration) {
  const start = window.scrollY;
  const dist  = target - start;
  // Respektera OS-inställningen — den globala CSS-regeln täcker bara
  // scroll-behavior/transitions, inte den här manuella rAF-scrollen.
  if (prefersReducedMotion()) {
    window.scrollTo(0, target);
    window.isSnapping = false;
    window.lastScrollY = window.scrollY;
    return;
  }
  let startTime = null;
  function step(ts) {
    if (!startTime) startTime = ts;
    const elapsed = ts - startTime;
    const t    = Math.min(elapsed / duration, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    window.scrollTo(0, start + dist * ease);
    if (elapsed < duration) {
      requestAnimationFrame(step);
    } else {
      window.isSnapping = false;
      window.lastScrollY = window.scrollY;
    }
  }
  requestAnimationFrame(step);
}

// Tillagningssteg — klicka för bock + genomstrykning
export function toggleStep(li) {
  li.classList.toggle('done');
}

window.smoothScrollTo = smoothScrollTo;
window.toggleStep     = toggleStep;

// ── Avaktivera pinch-zoom ────────────────────────────────────────────────────
// Viewporten (index.html: maximum-scale=1, user-scalable=no) stänger av zoom på
// Android/Chrome, men iOS Safari ignorerar user-scalable=no → blockera WebKits
// pinch-gest-event explicit. Bara den 2-fingers-pinch-gesten rörs; enfingers-
// scroll och veckovyns svep (single-touch) är helt opåverkade.
['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) =>
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })
);
