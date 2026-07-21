// Drag & släpp av dagar i matsedeln (Session 131) — långtryck på ett dagkort
// lyfter det (övriga flyttbara kort wigglar kort, iOS-hemskärmskänsla), dra och släpp:
//   • på ett annat kort  → dagarna byter plats (samma väg som "Byt dag" → /api/swap-days)
//   • mellan två kort    → dagen kläms in där (samma väg som "Flytta dag" → /api/move-day)
//   • vid skärmkanten    → vila fingret där → veckan glider över (iPhone-hemskärmen:
//                          dra en app till kanten för att byta sida) och dagen kan
//                          släppas i föregående/nästa vecka.
//
// Rent GESTLAGER — all mutationslogik återanvänds via window.dlxPerformSwap/
// window.dlxPerformMove (plan-viewer-deluxe.js): samma spärrar (_opBusy), samma
// felhantering, samma pending-banner och glöd-kvitto. Inga nya endpoints, ingen
// egen serverkod. Tryck-flödena i dag-sheeten ("Byt dag"/"Flytta dag") finns
// kvar som tangentbordsnåbar väg — draget är ett snabbare alternativ, inte en
// ersättning.
//
// Touch-först (Pointer Events): långtryck HOLD_MS utan rörelse aktiverar;
// rörelse innan dess lämnar över till vanlig scroll/veckosvep (samma dödzon,
// 8 px, som installSwipe). Under aktivt drag stängs veckosvepet av
// (window._dlxDragActive läses i installSwipe) och sidscroll förhindras via en
// icke-passiv touchmove-preventDefault. prefers-reduced-motion: wiggle och
// flygningar nollas av den globala reduced-motion-regeln i styles.css;
// JS hoppar dessutom över animationsväntetiderna.

import { fmtIso, addDaysIso, isoWeekNumber } from '../utils.js';

const HOLD_MS = 380;          // långtryck innan draget aktiveras
const HOLD_SLOP = 8;          // px rörelse som bryter hållet (= svepets dödzon)
const EDGE_BAND = 16;         // ± px runt en kortgräns som räknas som "mellan två dagar"
const FLY_MS = 190;           // landnings-/returflygningens längd
const EDGE_W = 26;            // px vid skärmkanten som räknas som "byt vecka"-zon
const DWELL_MS = 550;         // så länge fingret ska vila i zonen innan veckan byts

let _hold = null;             // { date, card, x0, y0, timer, pointerId }
let _drag = null;             // aktivt drag — se activateDrag()
let _suppressClickUntil = 0;  // svälj klicket som följer på ett avslutat drag

function reducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function daysContainer() {
  return document.querySelector('#weekDeluxe .dlx-days');
}

function collectEntries() {
  const c = daysContainer();
  if (!c) return [];
  return [...c.querySelectorAll(':scope > .dlx-day-slot > [data-date]')]
    .map((el) => ({ el, date: el.dataset.date }));
}

// ── Behörighet — speglar modeCls/dlxPickSwapTarget-reglerna i plan-viewer-deluxe ──
// Källa: aktiva planens receptdagar eller egen planering (ej arkiv/fri).
// Byt-mål: icke-arkiv, icke-fri dag — recept kräver aktiv plan.
// Retro-planering (Session 131): passerade dagar får dras och tas emot —
// familjen planerar ofta om i efterhand — men bara 14 dagar bakåt (samma
// fönster som recepthistoriken och servern i swap-days.js). Äldre = historik.
// Kläm in-zoner: bara när källan är en aktiv plan-receptdag (move-day roterar
// planens rader) — samma zonregler som moveZoneCtx (inga no-op-positioner).
function dragContext(srcDate) {
  const minIso = addDaysIso(fmtIso(new Date()), -14);
  const tl = window._timelineByDate || {};
  const src = tl[srcDate];
  if (!src || src.isArchive || src.blocked || srcDate < minIso) return null;

  const srcIsPlan = !!src.recipeId && !src.isCustom && src.planId === 'active';
  const srcIsCustom = !!src.isCustom && !!(src.customRecipeId || src.customRecipeTitle || src.customNote);
  if (!srcIsPlan && !srcIsCustom) return null;

  const canSwap = (date) => {
    if (date === srcDate || date < minIso) return false;
    const d = tl[date];
    if (!d) return true;                                  // tom dag utanför horisonten
    if (d.isArchive || d.blocked) return false;           // arkiv & fria dagar rörs aldrig
    if (d.recipeId && !d.isCustom) return d.planId === 'active';
    return true;                                          // egen dag eller tom dag
  };

  const insertBefores = new Set();
  let endAfter = null;
  if (srcIsPlan) {
    const movable = (window._lastPlan?.days || []).filter((d) => !d.blocked && d.recipeId);
    const i = movable.findIndex((d) => d.date === srcDate);
    if (i !== -1) {
      const successor = movable[i + 1]?.date || null;
      for (const d of movable) {
        if (d.date === srcDate || d.date === successor) continue;
        insertBefores.add(d.date);
      }
      const last = movable[movable.length - 1]?.date || null;
      endAfter = last && last !== srcDate ? last : null;
    }
  }
  return { srcDate, canSwap, insertBefores, endAfter };
}

// ── Träff-test — smala "mellan två dagar"-band vinner över kort-mitten ───────
// entries samlas EN gång per frame i loopen (delas med klass-uppdateringen).
function hitTest(ctx, entries, x, y) {
  for (let i = 0; i < entries.length; i++) {
    const { el, date } = entries[i];
    if (!ctx.insertBefores.has(date)) continue;
    const r = el.getBoundingClientRect();
    if (!r.height) continue;
    const prev = entries[i - 1]?.el.getBoundingClientRect();
    const yBound = prev?.height ? (prev.bottom + r.top) / 2 : r.top;
    if (Math.abs(y - yBound) <= EDGE_BAND) {
      return { kind: 'insert', before: date, y: yBound, above: entries[i - 1]?.el || null, below: el };
    }
  }
  if (ctx.endAfter) {
    const lastEntry = entries.find((en) => en.date === ctx.endAfter);
    const r = lastEntry?.el.getBoundingClientRect();
    if (r?.height && Math.abs(y - r.bottom) <= EDGE_BAND) {
      return { kind: 'insert', before: null, y: r.bottom + 3, above: lastEntry.el, below: null };
    }
  }
  for (const { el, date } of entries) {
    if (date === ctx.srcDate || !ctx.canSwap(date)) continue;
    const r = el.getBoundingClientRect();
    if (r.height && y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) {
      return { kind: 'swap', date, el };
    }
  }
  return null;
}

function sameTarget(a, b) {
  if (!a && !b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind === 'swap' ? a.date === b.date : a.before === b.before;
}

// ── Flytande kort (ghost) — yttre wrapper följer fingret (ingen transition),
//    inre .dlx-drag-lift bär lyft-skalningen/rotationen (med transition) ──────
function makeGhost(card) {
  const r = card.getBoundingClientRect();
  const w = card.offsetWidth || r.width;
  const h = card.offsetHeight || r.height;
  const wrap = document.createElement('div');
  wrap.className = 'dlx-drag-float';
  wrap.style.width = `${w}px`;
  const lift = document.createElement('div');
  lift.className = 'dlx-drag-lift';
  const clone = card.cloneNode(true);
  clone.removeAttribute('onclick');
  clone.removeAttribute('onkeydown');
  clone.removeAttribute('tabindex');
  clone.setAttribute('aria-hidden', 'true');
  clone.removeAttribute('data-date');           // ghosten får aldrig träffas av [data-date]-queries
  lift.appendChild(clone);
  wrap.appendChild(lift);
  const left = r.left + r.width / 2 - w / 2;
  const top = r.top + r.height / 2 - h / 2;
  wrap.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('lifted'));
  return { wrap, baseLeft: left, baseTop: top, w, h };
}

// ── Kantbläddring (iPhone-hemskärmen) — indikatorer vid vänster/höger kant ───
// Synlig-dämpad när steget är möjligt (upptäckbarhet), "arming" fylls medan
// fingret vilar i zonen (CSS-transition ≈ dwell-tiden = progresskänsla).
function makeEdges() {
  const mk = (dir) => {
    const el = document.createElement('div');
    el.className = 'dlx-drag-edge ' + (dir < 0 ? 'left' : 'right');
    el.innerHTML = `<span class="dlx-edge-chev" aria-hidden="true">${dir < 0 ? '‹' : '›'}</span><span class="dlx-edge-week"></span>`;
    document.body.appendChild(el);
    return el;
  };
  return { '-1': mk(-1), '1': mk(1) };
}

// Visad veckas måndag läses ur DOM (första dagslottens datum) — ingen ny export.
function shownWeekStartFromDom() {
  return daysContainer()?.querySelector(':scope > .dlx-day-slot')?.dataset.slot || null;
}

function updateEdges(d) {
  const ws = shownWeekStartFromDom();
  for (const dir of [-1, 1]) {
    const el = d.edges[String(dir)];
    if (!el) continue;
    const can = !window._dlxWeekAnimBusy && !!window.dlxDragWeekStep?.(dir, true);
    el.classList.toggle('visible', can);
    el.classList.toggle('arming', can && d.edgeDir === dir);
    if (ws) {
      const label = el.querySelector('.dlx-edge-week');
      if (label) label.textContent = `v.${isoWeekNumber(addDaysIso(ws, dir * 7))}`;
    }
  }
}

// ── Aktivering (långtrycket gick i mål) ───────────────────────────────────────
function activateDrag() {
  const h = _hold;
  _hold = null;
  if (!h || !h.card.isConnected) return;   // kortet kan ha renderats om under hållet
  const ctx = dragContext(h.date);
  const container = daysContainer();
  if (!ctx || !container) return;

  window._dlxDragActive = true;
  navigator.vibrate?.(12);

  container.classList.add('dlx-drag-mode');

  const line = document.createElement('div');
  line.className = 'dlx-drop-line';
  container.appendChild(line);

  _drag = {
    ctx,
    pointerId: h.pointerId,
    x0: h.x0, y0: h.y0,
    x: h.x0, y: h.y0,
    ghost: makeGhost(h.card),
    line,
    edges: makeEdges(),
    edgeDir: 0,               // kantzon fingret vilar i just nu (−1/0/+1)
    dwellStart: 0,            // när vilan i zonen började
    hover: null,
    raf: 0,
    nextSuppress: 0,
  };
  try { h.card.setPointerCapture?.(h.pointerId); } catch { /* capture är bara en optimering */ }
  startLoop();
}

// ── rAF-loop: ghost följer fingret, kant-autoscroll, kantbläddring, träff-test,
//    idempotenta drag-klasser (överlever omrenderingar), eko-dämpning ─────────
function startLoop() {
  const step = () => {
    const d = _drag;
    if (!d) return;
    const now = Date.now();

    // Kant-autoscroll — dra mot topp/botten scrollar sidan mjukt med
    const topEdge = 130, botEdge = 100;
    let dy = 0;
    if (d.y < topEdge) dy = -Math.min(14, (topEdge - d.y) / 5);
    else if (d.y > window.innerHeight - botEdge) dy = Math.min(14, (d.y - (window.innerHeight - botEdge)) / 5);
    if (dy) window.scrollBy(0, dy);

    d.ghost.wrap.style.transform =
      `translate3d(${d.ghost.baseLeft + (d.x - d.x0)}px, ${d.ghost.baseTop + (d.y - d.y0)}px, 0)`;

    const entries = collectEntries();

    // Drag-lägets kort-klasser hålls färska IDEMPOTENT varje frame — så de
    // överlever ALLA omrenderingar (veckobyte, realtime-eko) utan hooks.
    for (const { el, date } of entries) {
      const isSrc = date === d.ctx.srcDate;
      el.classList.toggle('dlx-drag-src', isSrc);
      el.classList.toggle('dlx-drag-off', !isSrc && !d.ctx.canSwap(date));
    }

    // Kantbläddring: vila fingret i kantzonen DWELL_MS → veckan glider över
    // (iPhone-hemskärmen). Efter bytet krävs en ny vila — slide-animationen
    // (window._dlxWeekAnimBusy) gate:ar naturligt takten för upprepade byten.
    const dir = d.x < EDGE_W ? -1 : d.x > window.innerWidth - EDGE_W ? 1 : 0;
    const canStep = dir !== 0 && !window._dlxWeekAnimBusy && !!window.dlxDragWeekStep?.(dir, true);
    if (!canStep || dir !== d.edgeDir) {
      d.edgeDir = canStep ? dir : 0;
      d.dwellStart = now;
    } else if (now - d.dwellStart >= DWELL_MS) {
      if (window.dlxDragWeekStep(dir)) {
        navigator.vibrate?.(8);
        setHover(null);        // markeringarna släcks medan panelen glider
      }
      d.edgeDir = 0;
    }
    updateEdges(d);

    // Träff-test pausas medan veckopanelen glider (korten är i rörelse).
    if (window._dlxWeekAnimBusy) setHover(null);
    else setHover(hitTest(d.ctx, entries, d.x, d.y));

    // Dämpa realtime-omhämtningar under hela draget så vyn inte byggs om
    // under fingret (plan-viewer.js kör om-laddningen när dämpningen släpper).
    if (now > d.nextSuppress) {
      window._planMutateUntil = now + 4000;
      d.nextSuppress = now + 1500;
    }
    d.raf = requestAnimationFrame(step);
  };
  _drag.raf = requestAnimationFrame(step);
}

function setHover(t) {
  const d = _drag;
  if (!d) return;
  if (sameTarget(d.hover, t)) {
    // Samma kläm in-zon men sidan kan ha scrollat → håll linjen i rätt läge
    if (t?.kind === 'insert') positionLine(t.y);
    return;
  }
  if (d.hover?.kind === 'swap') d.hover.el.classList.remove('dlx-drag-over');
  if (d.hover?.kind === 'insert') {
    d.line.classList.remove('visible');
    d.hover.above?.classList.remove('dlx-nudge-up');
    d.hover.below?.classList.remove('dlx-nudge-down');
  }
  d.hover = t;
  // Över ett giltigt mål tonas ghosten ned så mål-markeringen (ring/insert-linje)
  // läses IGENOM det lyfta kortet i stället för att skymmas av det.
  d.ghost.wrap.classList.toggle('over', !!t);
  if (!t) return;
  if (t.kind === 'swap') {
    t.el.classList.add('dlx-drag-over');
  } else {
    positionLine(t.y);
    d.line.classList.add('visible');
    t.above?.classList.add('dlx-nudge-up');
    t.below?.classList.add('dlx-nudge-down');
  }
}

function positionLine(yViewport) {
  const d = _drag;
  const c = daysContainer();
  if (!d || !c) return;
  const r = c.getBoundingClientRect();
  d.line.style.top = `${yViewport - r.top}px`;
}

// ── Avslut: släpp på mål, släpp utanför eller avbrott ─────────────────────────
function flyGhost(ghost, toLeft, toTop, { fade = false } = {}) {
  if (reducedMotion()) return Promise.resolve();
  ghost.wrap.classList.remove('lifted');
  ghost.wrap.classList.add('landing');
  ghost.wrap.style.transform = `translate3d(${toLeft}px, ${toTop}px, 0)`;
  if (fade) ghost.wrap.style.opacity = '0';
  return new Promise((resolve) => setTimeout(resolve, FLY_MS));
}

function teardownVisuals(d) {
  daysContainer()?.classList.remove('dlx-drag-mode');
  document.querySelectorAll('#weekDeluxe .dlx-drag-src, #weekDeluxe .dlx-drag-off, #weekDeluxe .dlx-drag-over, #weekDeluxe .dlx-nudge-up, #weekDeluxe .dlx-nudge-down')
    .forEach((el) => el.classList.remove('dlx-drag-src', 'dlx-drag-off', 'dlx-drag-over', 'dlx-nudge-up', 'dlx-nudge-down'));
  d.line?.remove();
  if (d.edges) Object.values(d.edges).forEach((el) => el.remove());
}

async function endDrag(commit) {
  const d = _drag;
  if (!d) return;
  _drag = null;
  cancelAnimationFrame(d.raf);
  _suppressClickUntil = Date.now() + 500;
  window._dlxDragActive = false;

  const t = commit ? d.hover : null;
  teardownVisuals(d);

  if (t?.kind === 'swap') {
    const r = t.el.getBoundingClientRect();
    await flyGhost(d.ghost, r.left + r.width / 2 - d.ghost.w / 2, r.top + r.height / 2 - d.ghost.h / 2);
    d.ghost.wrap.remove();
    window.dlxPerformSwap?.(d.ctx.srcDate, t.date);
  } else if (t?.kind === 'insert') {
    await flyGhost(d.ghost, d.ghost.baseLeft, t.y - d.ghost.h / 2, { fade: true });
    d.ghost.wrap.remove();
    window.dlxPerformMove?.(d.ctx.srcDate, t.before);
  } else {
    // Inget mål → fjädra tillbaka till källkortet (om det finns kvar i DOM)
    const src = document.querySelector(`#weekDeluxe .dlx-day-slot > [data-date="${d.ctx.srcDate}"]`);
    const r = src?.getBoundingClientRect();
    if (r?.height) await flyGhost(d.ghost, r.left + r.width / 2 - d.ghost.w / 2, r.top + r.height / 2 - d.ghost.h / 2);
    d.ghost.wrap.remove();
  }
}

function cancelHold() {
  if (!_hold) return;
  clearTimeout(_hold.timer);
  _hold = null;
}

// ── Lyssnare ──────────────────────────────────────────────────────────────────
document.addEventListener('pointerdown', (e) => {
  if (_drag || _hold) return;                                   // en gest i taget
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (window._opBusy || window._dlxSwap || window._dlxMove || window._dlxSheet) return;
  if (window._dlxWeekAnimBusy) return;                          // mitt i veckoglid
  if (e.target.closest('button, a, input, textarea, select')) return;
  const card = e.target.closest('#weekDeluxe .dlx-day-slot > [data-date]');
  if (!card) return;
  const date = card.dataset.date;
  if (!dragContext(date)) return;                               // dagen är inte flyttbar
  _hold = {
    date, card,
    x0: e.clientX, y0: e.clientY,
    pointerId: e.pointerId,
    timer: setTimeout(activateDrag, HOLD_MS),
  };
});

document.addEventListener('pointermove', (e) => {
  if (_hold && e.pointerId === _hold.pointerId) {
    if (Math.hypot(e.clientX - _hold.x0, e.clientY - _hold.y0) > HOLD_SLOP) cancelHold();
    return;
  }
  if (_drag && e.pointerId === _drag.pointerId) {
    _drag.x = e.clientX;
    _drag.y = e.clientY;
  }
});

document.addEventListener('pointerup', (e) => {
  if (_hold && e.pointerId === _hold.pointerId) { cancelHold(); return; }
  if (_drag && e.pointerId === _drag.pointerId) endDrag(true);
});

document.addEventListener('pointercancel', (e) => {
  if (_hold && e.pointerId === _hold.pointerId) { cancelHold(); return; }
  if (_drag && e.pointerId === _drag.pointerId) endDrag(false);
});

// Sidscroll får inte kapa draget (icke-passiv → preventDefault fungerar).
document.addEventListener('touchmove', (e) => {
  if (_drag) e.preventDefault();
}, { passive: false });

// Långtryck ska inte öppna webbläsarens kontextmeny/textmarkering.
document.addEventListener('contextmenu', (e) => {
  if (_drag || _hold) e.preventDefault();
});

// Native drag (desktop, text/bilder) stör pointer-flödet.
document.addEventListener('dragstart', (e) => {
  if (_drag) e.preventDefault();
});

// Klicket som webbläsaren syntetiserar efter pointerup skulle öppna dag-sheeten
// — svälj det när det kommer från ett just avslutat drag.
document.addEventListener('click', (e) => {
  if (Date.now() < _suppressClickUntil) {
    e.stopPropagation();
    e.preventDefault();
  }
}, { capture: true });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _drag) endDrag(false);
});

// Flikbyte/appväxling mitt i ett drag → avbryt snyggt.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelHold(); if (_drag) endDrag(false); }
});
