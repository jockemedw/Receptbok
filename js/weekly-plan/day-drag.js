// Drag & släpp av dagar i matsedeln (Session 131) — långtryck på ett dagkort
// lyfter det (övriga flyttbara kort jigglar kort, iOS-hemskärmskänsla), dra och släpp:
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
// ── PRESTANDA (Session 131, jank-passet) ────────────────────────────────────
// Målet är 60 fps på mobil: NOLL layout-läsningar och noll onödiga DOM-
// skrivningar i steady state. Principerna som håller det:
//   1. MÄT EN GÅNG. Kortens geometri (offsetTop/offsetHeight) cachas vid
//      aktivering. Transformer påverkar aldrig layout → cachen är giltig hela
//      draget. En MutationObserver på dagslistan flaggar för ommätning bara när
//      listan FAKTISKT byts ut (veckobyte, realtime-omrendering).
//   2. STRIKT LÄS→SKRIV per frame. Allt som läser layout sker först (en enda
//      scrollY-läsning i steady state), därefter enbart skrivningar. Ingen
//      write→read→write-cykel som tvingar fram synkron layout.
//   3. SKRIV BARA VID FÖRÄNDRING. Ghost-transform, sömmens läge, kant-etiketter
//      och klasser jämförs mot senast skrivna värde.
//   4. BARA KOMPOSITOR-EGENSKAPER i rörelse (transform/opacity) — aldrig top/
//      left/box-shadow under fingret.
//   5. Den icke-passiva touchmove-lyssnaren registreras BARA under draget, så
//      resten av appen behåller webbläsarens snabba scroll-väg.
//
// Touch-först (Pointer Events): långtryck HOLD_MS utan rörelse aktiverar;
// rörelse innan dess lämnar över till vanlig scroll/veckosvep (samma dödzon,
// 8 px, som installSwipe). Under aktivt drag stängs veckosvepet av
// (window._dlxDragActive läses i installSwipe). prefers-reduced-motion: jiggel
// och flygningar nollas av den globala reduced-motion-regeln i styles.css;
// JS hoppar dessutom över animationsväntetiderna.

import { fmtIso, addDaysIso, isoWeekNumber, retroWindowStartIso } from '../utils.js';

const HOLD_MS = 380;          // långtryck innan draget aktiveras
const HOLD_SLOP = 8;          // px rörelse som bryter hållet (= svepets dödzon)
const EDGE_BAND = 18;         // ± px runt en kortgräns som räknas som "mellan två dagar"
const FLY_MS = 200;           // landnings-/returflygningens längd (= CSS .landing-transition)
const EDGE_W = 26;            // px vid skärmkanten som räknas som "byt vecka"-zon
const DWELL_MS = 550;         // så länge fingret ska vila i zonen innan veckan byts
const EDGE_POLL_MS = 250;     // hur ofta kantindikatorernas status räknas om
const SCROLL_TOP_EDGE = 130;  // autoscroll-zon upptill
const SCROLL_BOT_EDGE = 100;  // autoscroll-zon nedtill

let _hold = null;             // { date, card, x0, y0, timer, pointerId }
let _drag = null;             // aktivt drag — se activateDrag()
let _suppressClickUntil = 0;  // svälj klicket som följer på ett avslutat drag

function reducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function daysContainer() {
  return document.querySelector('#weekDeluxe .dlx-days');
}

// ── Behörighet — speglar modeCls/dlxPickSwapTarget-reglerna i plan-viewer-deluxe ──
// Källa: valfri INNEHÅLLSDAG — aktiva planens receptdagar eller egen planering
// (recept eller anteckning). Aldrig arkiv eller fria dagar.
// Retro-planering: passerade dagar får dras och tas emot — familjen planerar
// ofta om i efterhand — men bara inom retro-fönstret (14 dagar, samma som
// servern). Äldre = historik.
//
// Billig förkoll som körs vid VARJE pointerdown på ett kort (även rena tryck) —
// därför bara map-uppslag, inga loopar över tidslinjen.
function canDragFrom(srcDate) {
  const tl = window._timelineByDate || {};
  const src = tl[srcDate];
  if (!src || src.isArchive || src.blocked || srcDate < retroWindowStartIso()) return null;
  const srcIsPlan = !!src.recipeId && !src.isCustom && src.planId === 'active';
  const srcIsCustom = !!src.isCustom && !!(src.customRecipeId || src.customRecipeTitle || src.customNote);
  return (srcIsPlan || srcIsCustom) ? src : null;
}

// Full kontext — byggs BARA vid aktivering (dlxInsertZones går igenom hela
// tidslinjen; det ska inte belasta vanliga tryck).
// Byt-mål: icke-arkiv, icke-fri dag — recept kräver aktiv plan.
// Kläm in-zoner: före varje innehållsdag oavsett typ (/api/move-day roterar
// fullt innehåll över alla dagtyper; tomma dagar är hål som vandrar).
function dragContext(srcDate) {
  if (!canDragFrom(srcDate)) return null;
  const minIso = retroWindowStartIso();
  const tl = window._timelineByDate || {};

  const canSwap = (date) => {
    if (date === srcDate || date < minIso) return false;
    const d = tl[date];
    if (!d) return true;                                  // tom dag utanför horisonten
    if (d.isArchive || d.blocked) return false;           // arkiv & fria dagar rörs aldrig
    if (d.recipeId && !d.isCustom) return d.planId === 'active';
    return true;                                          // egen dag eller tom dag
  };

  const zones = window.dlxInsertZones?.(srcDate) || { insertBefores: new Set(), endAfter: null };
  return { srcDate, canSwap, insertBefores: zones.insertBefores, endAfter: zones.endAfter };
}

// ── Geometri-cache — mäts en gång, giltig tills listan byts ut ───────────────
// offsetTop/offsetHeight är LAYOUT-position (immun mot transformer) och räknas
// från .dlx-days (position: relative) → samma koordinatrymd som sömmen och
// släpp-linjen. Att luckan öppnas 14 px flyttar alltså aldrig träffytorna.
function measure(d) {
  const c = daysContainer();
  if (!c) return;
  const rect = c.getBoundingClientRect();                  // ENDA rect-läsningen
  d.containerDocTop = rect.top + window.scrollY;
  d.items = [...c.querySelectorAll(':scope > .dlx-day-slot > [data-date]')]
    .map((el) => ({ el, date: el.dataset.date, top: el.offsetTop, h: el.offsetHeight }));
  d.needsMeasure = false;
  applyStaticClasses(d);
}

// Källa/ogiltiga mål märks EN gång per mätning — inte 60 ggr/sek. Eftersom
// ommätning triggas av MutationObserver överlever märkningen alla
// omrenderingar (veckobyte, realtime-eko) precis som förut.
function applyStaticClasses(d) {
  for (const it of d.items) {
    const isSrc = it.date === d.ctx.srcDate;
    it.el.classList.toggle('dlx-drag-src', isSrc);
    it.el.classList.toggle('dlx-drag-off', !isSrc && !d.ctx.canSwap(it.date));
  }
}

// ── Träff-test — smala "mellan två dagar"-band vinner över kort-mitten ───────
// Rent räknearbete på cachad geometri: noll DOM-access, noll layout.
// yc = pekaren i container-koordinater. `seam` returneras i samma rymd.
function hitTest(ctx, items, yc) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!ctx.insertBefores.has(it.date) || !it.h) continue;
    const prev = items[i - 1];
    const seam = prev ? (prev.top + prev.h + it.top) / 2 : it.top;
    if (Math.abs(yc - seam) <= EDGE_BAND) {
      return { kind: 'insert', before: it.date, seam, above: prev?.el || null, below: it.el };
    }
  }
  if (ctx.endAfter) {
    const le = items.find((it) => it.date === ctx.endAfter);
    if (le?.h) {
      const seam = le.top + le.h;
      if (Math.abs(yc - seam) <= EDGE_BAND) {
        return { kind: 'insert', before: null, seam: seam + 3, above: le.el, below: null };
      }
    }
  }
  for (const it of items) {
    if (it.date === ctx.srcDate || !it.h || !ctx.canSwap(it.date)) continue;
    if (yc >= it.top && yc <= it.top + it.h) return { kind: 'swap', date: it.date, el: it.el };
  }
  return null;
}

function sameTarget(a, b) {
  if (!a && !b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind === 'swap' ? a.date === b.date : (a.before || '') === (b.before || '');
}

// ── Flytande kort (ghost) — yttre wrapper följer fingret (ingen transition),
//    inre .dlx-drag-lift bär lyft-skalningen (med transition) ────────────────
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

// Statusen (går steget? vilket veckonummer?) räknas om på intervall — inte per
// frame. dlxDragWeekStep(probe) är numera billig (memoiserad tidslinje), men
// pollningen håller frame-budgeten ren oavsett.
function refreshEdgeState(d) {
  const ws = d.items[0]?.date || null;
  for (const dir of [-1, 1]) {
    const el = d.edges[String(dir)];
    if (!el) continue;
    const can = !window._dlxWeekAnimBusy && !!window.dlxDragWeekStep?.(dir, true);
    if (can !== d.edgeCan[dir]) {
      d.edgeCan[dir] = can;
      el.classList.toggle('visible', can);
    }
    if (ws) {
      const label = `v.${isoWeekNumber(addDaysIso(ws, dir * 7))}`;
      if (label !== d.edgeLabel[dir]) {
        d.edgeLabel[dir] = label;
        el.querySelector('.dlx-edge-week').textContent = label;   // skriv bara vid förändring
      }
    }
  }
}

// Arming-läget måste svara direkt (det ÄR dwell-progressen) — men bara på byte.
function setArming(d, dir) {
  if (d.armedDir === dir) return;
  d.armedDir = dir;
  for (const k of [-1, 1]) d.edges[String(k)]?.classList.toggle('arming', k === dir);
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

  // Jigglet lever tills man släpper (CSS: evig animation på `rotate`, som
  // komponeras oberoende av lucköppningens `translate` och målets `scale`).
  container.classList.add('dlx-drag-mode');

  const line = document.createElement('div');
  line.className = 'dlx-drop-line';
  container.appendChild(line);

  _drag = {
    ctx, container,
    pointerId: h.pointerId,
    x0: h.x0, y0: h.y0,
    x: h.x0, y: h.y0,
    ghost: makeGhost(h.card),
    line,
    edges: makeEdges(),
    edgeCan: { '-1': null, '1': null },
    edgeLabel: { '-1': null, '1': null },
    armedDir: 0,
    edgeDir: 0,               // kantzon fingret vilar i just nu (−1/0/+1)
    dwellStart: 0,            // när vilan i zonen började
    edgeCheckAt: 0,
    hover: null,
    items: [],
    containerDocTop: 0,
    needsMeasure: true,
    lastGX: null, lastGY: null,
    lastSeam: null,
    raf: 0,
    nextSuppress: 0,
  };

  // Ommätning bara när listan FAKTISKT ändras (veckobyte/omrendering) — inte
  // per frame. Attribut observeras inte, så våra egna klass-skrivningar loopar
  // aldrig tillbaka hit.
  _drag.observer = new MutationObserver(() => { if (_drag) _drag.needsMeasure = true; });
  _drag.observer.observe(container, { childList: true, subtree: true });

  // Icke-passiv touchmove BARA under draget → resten av appen behåller
  // webbläsarens snabba scroll-väg. Fingret står stilla vid aktivering
  // (långtryck) så ingen scroll har hunnit starta → preventDefault biter.
  document.addEventListener('touchmove', blockTouchScroll, { passive: false });

  try { h.card.setPointerCapture?.(h.pointerId); } catch { /* capture är bara en optimering */ }
  _drag.raf = requestAnimationFrame(frame);
}

function blockTouchScroll(e) {
  if (_drag) e.preventDefault();
}

// ── Frame-loop: läs-fas → skriv-fas, allt övrigt cachat ──────────────────────
function frame(ts) {
  const d = _drag;
  if (!d) return;

  // ══ LÄS-FAS ══ (allt som kan tvinga fram layout sker här, före skrivningar)
  if (d.needsMeasure) {
    measure(d);              // enda tillfället vi rör layout — vid DOM-ändring
    setHover(null);          // gamla hover-referenser pekar på utbytta noder
  }
  const scrollY = window.scrollY;
  const yc = d.y + scrollY - d.containerDocTop;

  // ══ SKRIV-FAS ══ (härifrån: inga layout-läsningar)

  // Ghosten följer fingret — skriv bara när värdet faktiskt ändrats
  const gx = d.ghost.baseLeft + (d.x - d.x0);
  const gy = d.ghost.baseTop + (d.y - d.y0);
  if (gx !== d.lastGX || gy !== d.lastGY) {
    d.ghost.wrap.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
    d.lastGX = gx; d.lastGY = gy;
  }

  // Kantbläddring: vila fingret i kantzonen DWELL_MS → veckan glider över.
  // Slide-animationen (_dlxWeekAnimBusy) gate:ar takten för upprepade byten.
  const dir = d.x < EDGE_W ? -1 : d.x > window.innerWidth - EDGE_W ? 1 : 0;
  if (ts - d.edgeCheckAt > EDGE_POLL_MS) { refreshEdgeState(d); d.edgeCheckAt = ts; }
  const canStep = dir !== 0 && d.edgeCan[dir] === true;
  if (!canStep || dir !== d.edgeDir) {
    d.edgeDir = canStep ? dir : 0;
    d.dwellStart = ts;
  } else if (ts - d.dwellStart >= DWELL_MS) {
    if (window.dlxDragWeekStep(dir)) {
      navigator.vibrate?.(8);
      setHover(null);              // markeringarna släcks medan panelen glider
      refreshEdgeState(d);         // veckan bytt → status direkt, inte om 250 ms
    }
    d.edgeDir = 0;
  }
  setArming(d, d.edgeDir);

  // Träff-test pausas medan veckopanelen glider (korten är i rörelse).
  setHover(window._dlxWeekAnimBusy ? null : hitTest(d.ctx, d.items, yc));

  // Autoscroll sist i skriv-fasen — nästa frames scrollY-läsning fångar upp den
  let dy = 0;
  if (d.y < SCROLL_TOP_EDGE) dy = -Math.min(14, (SCROLL_TOP_EDGE - d.y) / 5);
  else if (d.y > window.innerHeight - SCROLL_BOT_EDGE) {
    dy = Math.min(14, (d.y - (window.innerHeight - SCROLL_BOT_EDGE)) / 5);
  }
  if (dy) window.scrollBy(0, dy);

  // Dämpa realtime-omhämtningar under hela draget så vyn inte byggs om
  // under fingret (plan-viewer.js kör om-laddningen när dämpningen släpper).
  if (ts > d.nextSuppress) {
    window._planMutateUntil = Date.now() + 4000;
    d.nextSuppress = ts + 1500;
  }

  d.raf = requestAnimationFrame(frame);
}

function setHover(t) {
  const d = _drag;
  if (!d) return;
  if (sameTarget(d.hover, t)) {
    if (t?.kind === 'insert') positionLine(t.seam);   // no-op om sömmen är oförändrad
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
    positionLine(t.seam);
    d.line.classList.add('visible');
    // Grannarna GLIDER isär och öppnar en riktig lucka runt sömmen (iPhone:
    // listan delar på sig för att ge plats). Sömmen ligger fast (mitt emellan
    // grannarnas LAYOUT-positioner) → transformerna påverkar aldrig träffytan.
    t.above?.classList.add('dlx-nudge-up');
    t.below?.classList.add('dlx-nudge-down');
  }
}

// Sömmen flyttas med transform (kompositor) — aldrig `top` (layout).
// Skrivs bara när den faktiskt ändras.
function positionLine(yContainer) {
  const d = _drag;
  if (!d || yContainer === d.lastSeam) return;
  d.lastSeam = yContainer;
  d.line.style.transform = `translate3d(0, ${yContainer}px, 0)`;
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
  d.observer?.disconnect();
  document.removeEventListener('touchmove', blockTouchScroll, { passive: false });
  d.container?.classList.remove('dlx-drag-mode');
  for (const it of d.items) {
    it.el.classList.remove('dlx-drag-src', 'dlx-drag-off', 'dlx-drag-over', 'dlx-nudge-up', 'dlx-nudge-down');
  }
  // Säkerhetsnät om listan bytts ut mellan mätningarna (noder utanför cachen)
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
    // Flyg ghosten in i luckan och LANDA den där (settle) i stället för att
    // tona bort — draget sätter sig innan servern svarat och vyn ritas om.
    const cTop = d.container ? d.container.getBoundingClientRect().top : 0;
    await flyGhost(d.ghost, d.ghost.baseLeft, cTop + t.seam - d.ghost.h / 2);
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
  if (!canDragFrom(date)) return;                               // billig förkoll (rena tryck)
  _hold = {
    date, card,
    x0: e.clientX, y0: e.clientY,
    pointerId: e.pointerId,
    timer: setTimeout(activateDrag, HOLD_MS),
  };
}, { passive: true });

document.addEventListener('pointermove', (e) => {
  if (_hold && e.pointerId === _hold.pointerId) {
    if (Math.hypot(e.clientX - _hold.x0, e.clientY - _hold.y0) > HOLD_SLOP) cancelHold();
    return;
  }
  if (_drag && e.pointerId === _drag.pointerId) {
    // Bara bokföring — all DOM-påverkan sker i rAF-loopen (en skrivning/frame
    // även om pekaren levererar flera events per frame).
    _drag.x = e.clientX;
    _drag.y = e.clientY;
  }
}, { passive: true });

document.addEventListener('pointerup', (e) => {
  if (_hold && e.pointerId === _hold.pointerId) { cancelHold(); return; }
  if (_drag && e.pointerId === _drag.pointerId) endDrag(true);
}, { passive: true });

document.addEventListener('pointercancel', (e) => {
  if (_hold && e.pointerId === _hold.pointerId) { cancelHold(); return; }
  if (_drag && e.pointerId === _drag.pointerId) endDrag(false);
}, { passive: true });

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
