// Scroll-hantering: header show/hide, scroll-to-top, smooth scroll, steg-toggle.

export const headerEl  = document.querySelector('header');
export const scrollBtn = document.getElementById('scrolltop');

const HEADER_SHOW_THRESHOLD = 80;

// Justera body-padding när header ändrar storlek
new ResizeObserver(() => {
  document.body.style.paddingTop = headerEl.offsetHeight + 'px';
}).observe(headerEl);

window.addEventListener('scroll', () => {
  const y = window.scrollY;
  scrollBtn.classList.toggle('visible', y > 400);

  if (!window.isSnapping) {
    if (y > window.lastScrollY) {
      window.scrollUpAccum = 0;
      if (y > headerEl.offsetHeight) headerEl.classList.add('header-hidden');
    } else {
      window.scrollUpAccum += window.lastScrollY - y;
      if (window.scrollUpAccum >= HEADER_SHOW_THRESHOLD) headerEl.classList.remove('header-hidden');
    }
  }
  window.lastScrollY = y;
}, { passive: true });

scrollBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

export function smoothScrollTo(target, duration) {
  const start = window.scrollY;
  const dist  = target - start;
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
