// Premiumvy för matsedeln — en helt alternativ presentation av samma data.
//
// Läser: window._timelineByDate, window._lastPlan, window._lastShop,
//        window.RECIPES, window.planConfirmed, window._planArchive, window._customDays
// Muterar inget eget tillstånd — all backend-logik återanvänds via befintliga
// endpoints och window.*-funktioner. Klassiska vyn lämnas orörd; en segmenterad
// växel styr bara vilken som visas (CSS via body.week-deluxe).
//
// Re-render: vi wrappar window.renderWeeklyPlanData så båda vyerna alltid hålls
// i synk efter generering/byte/bekräftelse.

import { fmtIso, fmtShort, PROTEIN_COLOR, isoWeekNumber, escapeHtml, weekStartOf, addDaysIso, getHolidayName, jsStringAttr } from '../utils.js';

const DAY_NAMES_LONG = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
const MONTH_NAMES_SHORT = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];
const PROTEIN_LABEL = { fisk: 'Fisk', kyckling: 'Kyckling', kött: 'Kött', fläsk: 'Fläsk', vegetarisk: 'Vegetariskt' };

const I = {
  coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"/><path d="M12 7.5v9 M9.5 9.7c.6-.7 1.5-1 2.5-1s2 .3 2.4 1c.5.8 0 1.7-1 2-.7.2-2.7.3-3.4.7-.9.4-1.4 1.3-.9 2.1.5.7 1.6 1 2.5 1s1.9-.3 2.5-1"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h3.5c1.2 0 2.3.6 3 1.6l5 7c.7 1 1.8 1.6 3 1.6H21"/><path d="M18 4l3 3-3 3"/><path d="M3 17h3.5c1.2 0 2.3-.6 3-1.6l.7-1M14.8 9.6l.7-1c.7-1 1.8-1.6 3-1.6H21"/><path d="M18 14l3 3-3 3"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10a2 2 0 0 0-2.8-2.8L5 17v3z"/><path d="M13.5 6.5l4 4"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h13M14 4l3 3-3 3"/><path d="M20 17H7M10 14l-3 3 3 3"/></svg>',
  move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16"/><path d="M4 20h16"/><path d="M12 8v8"/><path d="m8.5 12.5 3.5 3.5 3.5-3.5"/></svg>',
  free: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4 M8 2v4 M3 10h18"/><path d="M9 15l6 0"/></svg>',
  pot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13c0-3.5 3.5-6 8-6s8 2.5 8 6"/><path d="M3 13h18"/><path d="M5.5 13v2c0 1.5 1 2.5 2.5 2.5h8c1.5 0 2.5-1 2.5-2.5v-2"/><path d="M11 4.5c0-.8.5-1.5 1-1.5s1 .7 1 1.5"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5h11l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 11h8 M8 14h8 M8 17h5"/></svg>',
  chef: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5"/><path d="M7 14a4 4 0 0 1-1-7.9A4 4 0 0 1 13 4a4 4 0 0 1 5 8"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg>',
  // Markör för egen planering (ersätter texten "EGEN PLANERING") + plus för tom dag.
  own: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10a2 2 0 0 0-2.8-2.8L5 17v3z"/><path d="M13.5 6.5l4 4"/></svg>',
  // Rester/använd upp-dag (backlog #14): skål med ånga.
  leftovers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16a8 8 0 0 1-16 0z"/><path d="M9 8c0-1.4 1-1.6 1-3 M14 8c0-1.4 1-1.6 1-3"/></svg>',
  // Gaffel + kniv — "vi äter ute" i Ikväll-sheeten (backlog #15).
  fork: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v7c0 1 .7 2 2 2s2-1 2-2V3"/><path d="M7 3v18"/><path d="M17 3c-1.5 1-2.5 3.5-2.5 6 0 2 .8 3 2.5 3v9"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14 M5 12h14"/></svg>',
  // Ren kundvagn (utan intern bock) — "handlat för"-markören sätter en separat
  // grön bock BREDVID (I.tick) så den läses som en tydlig "klar"-status.
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.6 11.2A1.5 1.5 0 0 0 9.06 16.4H18a1.5 1.5 0 0 0 1.46-1.14L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="17.5" cy="20" r="1.4"/></svg>',
  // Bock — grön "klar"-markör bredvid kundvagnen.
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4 4L19 6.5"/></svg>',
  // Soptunna — "ta bort dagen helt" (danger-åtgärd i dag-sheeten).
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12"/><path d="M10 11v6 M14 11v6"/></svg>',
};

// esc = utils.escapeHtml (samma semantik) — en enda implementation i utils.
const esc = escapeHtml;

// Serverns svenska {error}-text flaggas userFacing → catch-blocken visar den.
// Transport-/parsfel (fetch-TypeError 'Failed to fetch', SyntaxError från
// res.json() på icke-JSON) saknar flaggan och faller till svensk fallback, så
// råa engelska tekniska strängar aldrig når användaren.
function dlxServerError(msg) {
  const e = new Error(msg || 'Okänt fel');
  e.userFacing = true;
  return e;
}
function dlxUserMessage(e, fallback) {
  return (e && e.userFacing && e.message && e.message !== 'fel' && e.message !== 'Okänt fel') ? e.message : fallback;
}

// "Rester/använd upp"-dag (backlog #14, lätta varianten): egna anteckningar vars
// text handlar om rester känns igen och får en egen markör — ren rendering,
// samma custom-day-data som förut. (Datan bevisar mönstret: familjen skriver
// redan "Rester"/"Kylskåpstömning" som noteringar.)
const RESTER_RE = /rester|kylskåpstömning|kylskåpsstädning|använd upp|tömma kylen/i;
function customNoteMark(note) {
  if (note && RESTER_RE.test(note)) {
    return `<span class="dlx-own dlx-own-leftovers" title="Rester/använd upp" aria-label="Rester/använd upp">${I.leftovers}</span>`;
  }
  return `<span class="dlx-own" title="Egen notering" aria-label="Egen notering">${I.own}</span>`;
}
// F212: lokal escaper missade backslash (lagrad XSS via recepttitel) — använd
// utils.jsStringAttr (escapar backslash FÖRST, sedan ' och &<>") överallt i filen.
const attr = jsStringAttr;

function fmtKr(value) {
  if (value == null) return '–';
  const r = Math.round(value);
  return `${r} kr`;
}

// ── Injektion av DOM-skal (körs en gång) ─────────────────────────────────────
let _injected = false;
function ensureScaffold() {
  if (_injected) return true;
  const content = document.getElementById('weekContent');
  if (!content) return false;

  // Premiumvyns container — panelen (#weekDeluxe) bor i en pager-wrapper som är
  // svepytan för veckoväxlingen. Bekräfta-rutan (#confirmPlanWrap) ligger UTANFÖR
  // pagern så den aldrig sveps och alltid är nåbar.
  const pager = document.createElement('div');
  pager.className = 'dlx-pager';
  pager.id = 'dlxPager';
  const host = document.createElement('div');
  host.id = 'weekDeluxe';
  host.className = 'dlx-pane';
  pager.appendChild(host);
  const confirmWrap = document.getElementById('confirmPlanWrap');
  if (confirmWrap) confirmWrap.before(pager);
  else content.appendChild(pager);
  installSwipe(pager, host);

  _injected = true;
  // Premium är enda vyn — klassiska tidslinjen avvecklad. body.week-deluxe styr
  // CSS:en som döljer den klassiska markupen och visar premiumvyn.
  document.body.classList.add('week-deluxe');
  return true;
}

// ── Datahämtning ut ur timeline ──────────────────────────────────────────────
function sortedTimeline() {
  const map = window._timelineByDate || {};
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

function recipeById(id) {
  return id ? (window.RECIPES || []).find(r => r.id === id) : null;
}

// ── Veckostate — vyn visar EN kalendervecka (ISO, mån–sön) i taget ───────────
// null = innevarande vecka (default). Sätts bara av stepparen/Idag/Goto och
// nollställs vid flikbyte (wrappedSwitch) — re-renders behåller visad vecka.
let _dlxWeekStart = null;

function currentWeekStart() { return weekStartOf(fmtIso(new Date())); }
function shownWeekStart()   { return _dlxWeekStart || currentWeekStart(); }

// Stepparens klampgränser: veckorna som tidslinjen (plan + arkiv + egna dagar)
// faktiskt täcker — utanför finns inget att visa.
function timelineBounds() {
  const t = sortedTimeline();
  if (!t.length) return null;
  return { min: weekStartOf(t[0].date), max: weekStartOf(t[t.length - 1].date) };
}

// Går det att kliva `dir` veckor från visad vecka utan att lämna tidslinjen?
function dlxCanStep(dir) {
  const b = timelineBounds();
  if (!b) return false;
  const next = addDaysIso(shownWeekStart(), dir * 7);
  return next >= b.min && next <= b.max;
}

// "Slide-through": panelen (#weekDeluxe) glider ut i svep-riktningen, veckan
// byts + renderas om, panelen glider in från andra hållet. Transformen bor på
// panel-elementet som överlever setSec-omrenderingen, så innehållet byts inuti.
let _dlxAnimBusy = false;
function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function animateWeekChange(dir, apply) {
  const pane = document.getElementById('weekDeluxe');
  if (!pane || prefersReducedMotion()) { apply(); renderDeluxe(); return; }
  if (_dlxAnimBusy) return;
  _dlxAnimBusy = true;
  pane.style.transition = 'transform 0.14s ease-in, opacity 0.14s ease-in';
  pane.style.transform = `translateX(${dir * -56}px)`;
  pane.style.opacity = '0';
  setTimeout(() => {
    apply();
    renderDeluxe();
    pane.style.transition = 'none';
    pane.style.transform = `translateX(${dir * 56}px)`;
    void pane.offsetWidth;                                  // force reflow
    pane.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
    pane.style.transform = 'translateX(0)';
    pane.style.opacity = '1';
    setTimeout(() => { _dlxAnimBusy = false; }, 210);
  }, 145);
}

window.dlxWeekStep = function (dir) {
  if (_dlxAnimBusy || !dlxCanStep(dir)) return;
  const next = addDaysIso(shownWeekStart(), dir * 7);
  animateWeekChange(dir, () => { _dlxWeekStart = next === currentWeekStart() ? null : next; });
};

window.dlxWeekToday = function () {
  if (_dlxAnimBusy || shownWeekStart() === currentWeekStart()) return;
  const dir = shownWeekStart() > currentWeekStart() ? -1 : 1;   // glid mot idag
  animateWeekChange(dir, () => { _dlxWeekStart = null; });
};

// Direkt hopp (autohopp vid färsk generering + notis-bannern) — ingen svep-anim.
window.dlxWeekGoto = function (dateIso) {
  const ws = weekStartOf(dateIso);
  _dlxWeekStart = ws === currentWeekStart() ? null : ws;
  renderDeluxe();
};

// Nollställ visad vecka (anropas från wrappedSwitch — modulintern state).
function resetShownWeek() { _dlxWeekStart = null; }

// ── Svep-/scroll-växling ─────────────────────────────────────────────────────
// Hela veckovyn (hero + dagslista) är svepytan. Horisontell avsikt skiljs från
// vertikal scroll (avsikts-lås) så sidans vertikala scroll aldrig kapas.
function installSwipe(pager, pane) {
  let x0 = 0, y0 = 0, t0 = 0, mode = null;   // mode: null | 'h' | 'v'

  pager.addEventListener('touchstart', (e) => {
    if (_dlxAnimBusy || e.touches.length !== 1) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); mode = null;
  }, { passive: true });

  pager.addEventListener('touchmove', (e) => {
    if (_dlxAnimBusy || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
    if (mode === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;                 // dödzon
      mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';             // avsikts-lås
    }
    if (mode !== 'h') return;                                            // vertikal scroll får leva
    e.preventDefault();
    const resist = dlxCanStep(dx < 0 ? 1 : -1) ? 0.55 : 0.18;           // gummiband vid kant
    pane.style.transition = 'none';
    pane.style.transform = `translateX(${dx * resist}px)`;
    pane.style.opacity = String(1 - Math.min(Math.abs(dx) / 900, 0.25));
  }, { passive: false });

  pager.addEventListener('touchend', (e) => {
    if (mode !== 'h') { mode = null; return; }
    const dx = e.changedTouches[0].clientX - x0;
    const vx = Math.abs(dx) / Math.max(Date.now() - t0, 1);             // px/ms
    const dir = dx < 0 ? 1 : -1;
    mode = null;
    if ((Math.abs(dx) > 70 || vx > 0.5) && dlxCanStep(dir)) { window.dlxWeekStep(dir); return; }
    pane.style.transition = 'transform 0.18s ease-out, opacity 0.18s ease-out';   // fjädra tillbaka
    pane.style.transform = 'translateX(0)';
    pane.style.opacity = '1';
  }, { passive: true });

  // Desktop: horisontellt scrollhjul/trackpad.
  let wheelAcc = 0, wheelLock = 0;
  pager.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;               // vertikal scroll orörd
    e.preventDefault();
    const now = Date.now();
    if (now < wheelLock) return;                                        // svälj tröghetssvans
    wheelAcc += e.deltaX;
    if (Math.abs(wheelAcc) > 60) {
      const dir = wheelAcc > 0 ? 1 : -1;
      wheelAcc = 0; wheelLock = now + 450;
      window.dlxWeekStep(dir);
    }
  }, { passive: false });
}

// Blank dag utanför tidslinjens horisont — samma fält som buildTimeline-rader
// (plan-viewer.js) så kort och sheet kan behandla den som vilken dag som helst.
function synthDay(iso) {
  const d = new Date(iso + 'T12:00:00');
  const dow = d.getDay();
  const todayIso = fmtIso(new Date());
  return {
    date: iso, day: DAY_NAMES_LONG[dow], dayShort: DAY_NAMES_LONG[dow].slice(0, 3),
    dayNum: d.getDate(), month: d.getMonth(), weekNumber: isoWeekNumber(iso),
    isPast: iso < todayIso, isToday: iso === todayIso,
    isWeekend: dow === 0 || dow === 6, holiday: getHolidayName(iso),
    recipe: null, recipeId: null, saving: null, savingMatches: null, blocked: false,
    planId: null, planLabel: null, planColorIndex: null, isArchive: false,
    isCustom: false, customNote: '', customRecipeId: null, customRecipeTitle: '',
  };
}

// Den visade veckans 7 dagar (mån–sön) — luckor utanför horisonten syntetiseras.
function shownWeekDays() {
  const map = window._timelineByDate || {};
  const start = shownWeekStart();
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addDaysIso(start, i);
    return map[iso] || synthDay(iso);
  });
}

// Inköpsrundor (migration 009): riktig per-dag-data i stället för den gamla
// heuristiken "bekräftad plan ⇒ allt handlat".
//   Inhandlad (shopped_at satt)  → grön kundvagn+bock, dagen är klar-handlad.
//   På listan (pekar på aktiva listan, ej inhandlad) → neutral kundvagn.
function isShoppedDay(d) {
  return !!d.shoppedAt;
}

function isOnListDay(d) {
  return !!d.onList && !d.shoppedAt;
}

function shoppedChip() {
  return `<span class="dlx-shopped" role="img" title="Inhandlad — dagens ingredienser är köpta"
    aria-label="Inhandlad"><span class="dlx-shopped-cart">${I.cart}</span><span class="dlx-shopped-tick">${I.tick}</span></span>`;
}

function onListChip() {
  return `<span class="dlx-shopped onlist" role="img" title="På inköpslistan — dagens ingredienser ligger på listan"
    aria-label="På inköpslistan"><span class="dlx-shopped-cart">${I.cart}</span></span>`;
}

// Rätt chip för dagen (eller tom sträng) — används av kort, Ikväll och sheeten.
function dayShopChip(d) {
  if (isShoppedDay(d)) return shoppedChip();
  if (isOnListDay(d)) return onListChip();
  return '';
}

// ── "Ikväll"-kort — svarar på familjens vanligaste fråga direkt i heron ──────
// ERSÄTTER dagens kort i listan (ingen dubblering): visar datum, öppnar
// snabbåtgärds-sheeten vid tryck och deltar i byt dag-flödet som vanliga kort.
function buildTonight(timeline) {
  const todayIso = fmtIso(new Date());
  const d = timeline.find(t => t.date === todayIso);
  if (!d) return '';

  // Markör-ikon för egen planering (ersätter undertexten): gryta = recept ur
  // receptboken, penna = egen notering.
  const recipeMark = `<span class="dlx-own dlx-own-recipe" title="Recept ur receptboken" aria-label="Recept ur receptboken">${I.pot}</span>`;
  const noteMark = customNoteMark(d.customNote);
  let label, sub = '', mark = '', kind = '', mkind = 'custom';
  if (d.recipeId && !d.isCustom) {
    const r = recipeById(d.recipeId);
    label = d.recipe || '';
    sub = [r?.time ? `${r.time} min` : null, r ? PROTEIN_LABEL[r.protein] : null].filter(Boolean).join(' · ');
    kind = 'recipe';
    mkind = 'recipe';
  } else if (d.isCustom && d.customRecipeId) {
    const r = recipeById(d.customRecipeId);
    label = d.customRecipeTitle || '';
    // Text-komplement till proteinfärgen (a11y — färg får inte bära ensam)
    sub = [r?.time ? `${r.time} min` : null, r ? PROTEIN_LABEL[r.protein] : null].filter(Boolean).join(' · ');
    mark = recipeMark;
  } else if (d.isCustom && (d.customRecipeTitle || d.customNote)) {
    label = d.customRecipeTitle || d.customNote;
    mark = noteMark;
  } else if (d.blocked) {
    label = 'Fri dag';
    sub = 'Ingen middag planerad';
    mkind = 'free';
  } else {
    return '';
  }

  return `
    <article class="dlx-tonight${modeCls(d, mkind)}" data-date="${d.date}"${kind ? ` data-kind="${kind}"` : ''}
             role="button" tabindex="0" onclick="dlxDayClick('${d.date}', '${attr(d.day)}')"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();dlxDayClick('${d.date}', '${attr(d.day)}')}">
      <span class="dlx-tonight-eyebrow">${I.pot} Ikväll</span>
      <div class="dlx-tonight-head">
        <div class="dlx-day-when">
          <span class="dlx-day-dow">${esc(d.day)}</span>
          <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
        </div>
        <div class="dlx-tonight-main">
          <span class="dlx-tonight-title">${mark}${esc(label)}</span>
          ${sub ? `<span class="dlx-tonight-sub">${esc(sub)}${dayShopChip(d) ? ' ' + dayShopChip(d) : ''}</span>`
                : (dayShopChip(d) ? `<span class="dlx-tonight-sub">${dayShopChip(d)}</span>` : '')}
        </div>
      </div>
      <span class="dlx-tonight-chev" aria-hidden="true">›</span>
    </article>`;
}

// ── Hero-statistik — räknas på den VISADE veckan, inte planens spann ─────────
// En måltid = genererad receptdag eller egen dag med recept ur receptboken.
function heroMealId(d) {
  if (d.recipeId && !d.isCustom) return d.recipeId;
  if (d.isCustom && d.customRecipeId) return d.customRecipeId;
  return null;
}

function buildHero(weekDays, weekStart, plan, pending) {
  const planned = weekDays.filter(d => heroMealId(d)).length;
  const totalSaving = weekDays.reduce((s, d) => s + (d.saving || 0), 0);
  const hasActiveDays = weekDays.some(d => d.planId === 'active');
  const isCurrentWeek = weekStart === currentWeekStart();

  // Proteinfördelning
  const counts = {};
  for (const d of weekDays) {
    const r = recipeById(heroMealId(d));
    if (!r) continue;
    counts[r.protein] = (counts[r.protein] || 0) + 1;
  }
  const order = ['fisk', 'kyckling', 'kött', 'fläsk', 'vegetarisk'];
  const segs = order.filter(p => counts[p]).map(p => {
    const pct = planned ? (counts[p] / planned * 100) : 0;
    return `<span class="dlx-bar-seg" style="flex:${counts[p]};background:${PROTEIN_COLOR[p] || 'var(--birch)'}"
              title="${PROTEIN_LABEL[p]}: ${counts[p]}"></span>`;
  }).join('');
  const legend = order.filter(p => counts[p]).map(p =>
    `<span class="dlx-legend-item"><span class="dlx-legend-dot" style="background:${PROTEIN_COLOR[p] || 'var(--birch)'}"></span>${PROTEIN_LABEL[p]} ${counts[p]}</span>`
  ).join('');

  const vegCount = counts['vegetarisk'] || 0;

  // Rubrik: den visade veckan mån–sön, kompakt ("6–12 juli" / "29 juni – 5 juli").
  const weekEnd = addDaysIso(weekStart, 6);
  const title = heroDateRange(weekStart, weekEnd);

  // Sparat-statistiken är plan-scopad och öppnar "Veckans fynd" när sådana finns.
  const hasDeals = hasActiveDays && !!(window._weeklyDeals?.candidates?.length);
  const savingStat = totalSaving >= 1 ? (
    hasDeals
      ? `<button type="button" class="dlx-stat dlx-stat-saving has-deals" onclick="openDealsPopup()" title="Se veckans fynd">
          <div class="dlx-stat-num">${fmtKr(totalSaving)}</div>
          <div class="dlx-stat-lbl">sparat · fynd ›</div>
        </button>`
      : `<div class="dlx-stat dlx-stat-saving">
          <div class="dlx-stat-num">${fmtKr(totalSaving)}</div>
          <div class="dlx-stat-lbl">sparat</div>
        </div>`
  ) : (hasDeals
      ? `<button type="button" class="dlx-stat dlx-stat-saving has-deals" onclick="openDealsPopup()" title="Se veckans fynd">
          <div class="dlx-stat-num">${I.coin}</div>
          <div class="dlx-stat-lbl">se fynd ›</div>
        </button>`
      : '');

  const barBlock = planned ? `
      <div class="dlx-bar">${segs}</div>
      <div class="dlx-legend">${legend}</div>` : '';

  // ── Veckorail (botten av heron) — ersätter ‹ ›-raden ──────────────────────
  // Statusmärke gäller den visade veckan: "Förslag" bara när förslagets dagar
  // syns här, "Bekräftad" bara i veckor med den bekräftade planens dagar.
  const badge = (pending && hasActiveDays)
    ? `<span class="dlx-rail-badge pending">Förslag</span>`
    : ((hasActiveDays && plan?.confirmedAt) ? `<span class="dlx-rail-badge">Bekräftad</span>` : '');

  // Grann-veckor i kanterna (diskret svep-affordans + tapbara). Sidan som pekar
  // mot idag ersätts av en rust "Idag"-pill när man svept bort från nuvarande vecka.
  const b = timelineBounds();
  const atMin = b ? weekStart <= b.min : true;
  const atMax = b ? weekStart >= b.max : true;
  const prevNo = isoWeekNumber(addDaysIso(weekStart, -7));
  const nextNo = isoWeekNumber(addDaysIso(weekStart, 7));
  const leftSlot = (!isCurrentWeek && weekStart > currentWeekStart())
    ? `<button type="button" class="dlx-week-today" onclick="dlxWeekToday()">‹ Idag</button>`
    : `<button type="button" class="dlx-rail-side" onclick="dlxWeekStep(-1)"${atMin ? ' disabled' : ''} aria-label="Föregående vecka"><span class="dlx-rail-chev">‹</span>v.${prevNo}</button>`;
  const rightSlot = (!isCurrentWeek && weekStart < currentWeekStart())
    ? `<button type="button" class="dlx-week-today" onclick="dlxWeekToday()">Idag ›</button>`
    : `<button type="button" class="dlx-rail-side" onclick="dlxWeekStep(1)"${atMax ? ' disabled' : ''} aria-label="Nästa vecka">v.${nextNo}<span class="dlx-rail-chev">›</span></button>`;

  return `
    <div class="dlx-hero">
      <div class="dlx-hero-glow"></div>
      <h2 class="dlx-hero-title">${esc(title)}</h2>
      <div class="dlx-stats">
        <div class="dlx-stat">
          <div class="dlx-stat-num">${planned}</div>
          <div class="dlx-stat-lbl">${planned === 1 ? 'måltid' : 'måltider'}</div>
        </div>
        <div class="dlx-stat">
          <div class="dlx-stat-num">${vegCount}</div>
          <div class="dlx-stat-lbl">${vegCount === 1 ? 'vegetarisk dag' : 'veg. dagar'}</div>
        </div>
        ${savingStat}
      </div>
      ${barBlock}
      <nav class="dlx-week-rail" aria-label="Byt vecka">
        ${leftSlot}
        <div class="dlx-rail-mid">
          <span class="dlx-rail-week">Vecka ${isoWeekNumber(weekStart)}</span>
          ${badge}
        </div>
        ${rightSlot}
      </nav>
    </div>`;
}

// "6–12 juli" (samma månad) / "29 juni – 5 juli" (över månadsskifte).
function heroDateRange(startIso, endIso) {
  const s = new Date(startIso + 'T12:00:00'), e = new Date(endIso + 'T12:00:00');
  const long = (d) => d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });
  if (s.getMonth() === e.getMonth()) {
    return `${s.getDate()}–${e.getDate()} ${e.toLocaleDateString('sv-SE', { month: 'long' })}`;
  }
  return `${long(s)} – ${long(e)}`;
}

// ── Dagskort ──────────────────────────────────────────────────────────────────

// Tilläggsklasser under pågående byt/flytta-läge: källa, giltigt mål eller
// nedtonad. Beräknas i renderingen (state-driven) så markeringarna alltid
// stämmer — även efter en re-render mitt i flödet.
function modeCls(d, kind) {
  const mode = window._dlxSwap || window._dlxMove;
  if (!mode) return '';
  if (d.date === mode.from) return ' dlx-swap-source' + (mode.pending ? ' dlx-busy' : '');
  if (window._dlxMove) return ' dlx-dim';   // i flytta-läge är bara släppzonerna mål
  const eligible =
    kind === 'recipe' ? (d.planId === 'active' && !d.isArchive) :
    // F024 (QC-natt): egen planering = bytbar (byter datum), men INTE om den
    // ligger i det förflutna — annars kan ett byte mot en gammal, aldrig
    // arkiverad anteckning dra tillbaka aktiva planens datumspann i historien.
    kind === 'custom' ? (!d.isArchive && !d.isPast) :
    kind === 'gap'    ? !d.isPast :
    false;                                  // fri dag kan aldrig bytas
  if (!eligible) return ' dlx-dim';
  return ' dlx-swap-target' + (window._dlxSwap.pending === d.date ? ' dlx-busy' : '');
}

function dayBadges(d) {
  const out = [];
  if (d.isToday) out.push('<span class="dlx-day-flag today">Idag</span>');
  // Helg markeras med en dovare kort-bakgrund (.dlx-day.is-weekend) — inte med en pill.
  // Helgdag (midsommar m.fl.) renderas som en högerställd chip vid chevronen
  // (injiceras i renderDayCard), så den aldrig trängs in i den smala datumkolumnen
  // och knuffar dagens innehåll. Båda hålls utanför flödet → jämn korthöjd.
  return out.join('');
}

function recipeDayCard(d, opts) {
  const r = recipeById(d.recipeId);
  const color = r ? (PROTEIN_COLOR[r.protein] || 'var(--lichen)') : 'var(--lichen)';
  const time = r?.time ? `${r.time} min` : '';
  const protLabel = r ? (PROTEIN_LABEL[r.protein] || r.protein) : '';

  const savingPill = (d.saving && d.saving >= 10) ? (
    d.savingMatches?.length
      ? `<button type="button" class="dlx-saving has-details" onclick="event.stopPropagation();openSavingPopover('${d.date}')">${I.coin}${d.saving} kr</button>`
      : `<span class="dlx-saving">${I.coin}${d.saving} kr</span>`
  ) : '';

  const metaParts = [];
  if (protLabel) metaParts.push(`<span class="dlx-chip" style="--chip:${color}">${esc(protLabel)}</span>`);
  if (time) metaParts.push(`<span class="dlx-meta-time">${I.clock}${time}</span>`);

  return `
    <article class="dlx-day${opts.cls}${modeCls(d, 'recipe')}" data-date="${d.date}"
             style="--rail:${color}" onclick="dlxDayClick('${d.date}', '${attr(d.day)}')">
      <span class="dlx-rail"></span>
      <div class="dlx-day-head">
        <div class="dlx-day-when">
          <span class="dlx-day-dow">${esc(d.day)}</span>
          <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
          <span class="dlx-day-flags">${dayBadges(d)}</span>
        </div>
        <div class="dlx-day-main">
          <h3 class="dlx-day-recipe">${esc(d.recipe || '')}</h3>
          <div class="dlx-day-meta">${metaParts.join('')}${savingPill}${dayShopChip(d)}</div>
        </div>
        <span class="dlx-day-chev" aria-hidden="true">›</span>
      </div>
    </article>`;
}

function emptyDayCard(d) {
  // Gap, fri dag, eller tom custom-dag — alla öppnar sheeten vid tryck.
  if (d.isCustom) {
    if (d.customRecipeId) {
      const r = recipeById(d.customRecipeId);
      const color = r ? (PROTEIN_COLOR[r.protein] || 'var(--lichen)') : 'var(--lichen)';
      // Text-komplement till proteinfärgen (a11y) — samma chips som recipeDayCard
      const metaParts = [];
      if (r) metaParts.push(`<span class="dlx-chip" style="--chip:${color}">${esc(PROTEIN_LABEL[r.protein] || r.protein)}</span>`);
      if (r?.time) metaParts.push(`<span class="dlx-meta-time">${I.clock}${r.time} min</span>`);
      return `
        <article class="dlx-day custom${modeCls(d, 'custom')}" data-date="${d.date}" style="--rail:${color}"
                 onclick="dlxDayClick('${d.date}', '${attr(d.day)}')">
          <span class="dlx-rail"></span>
          <div class="dlx-day-head">
            <div class="dlx-day-when"><span class="dlx-day-dow">${esc(d.day)}</span>
              <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
              <span class="dlx-day-flags">${dayBadges(d)}</span></div>
            <div class="dlx-day-main">
              <h3 class="dlx-day-recipe"><span class="dlx-own dlx-own-recipe" title="Recept ur receptboken" aria-label="Recept ur receptboken">${I.pot}</span>${esc(d.customRecipeTitle || '')}</h3>
              ${(metaParts.length || dayShopChip(d)) ? `<div class="dlx-day-meta">${metaParts.join('')}${dayShopChip(d)}</div>` : ''}
            </div>
            <span class="dlx-day-chev" aria-hidden="true">›</span>
          </div>
        </article>`;
    }
    return `
      <article class="dlx-day custom slim${modeCls(d, 'custom')}" data-date="${d.date}" onclick="dlxDayClick('${d.date}', '${attr(d.day)}')">
        <span class="dlx-rail" style="background:var(--birch)"></span>
        <div class="dlx-day-head">
          <div class="dlx-day-when"><span class="dlx-day-dow">${esc(d.day)}</span>
            <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
            <span class="dlx-day-flags">${dayBadges(d)}</span></div>
          <div class="dlx-day-main">
            <h3 class="dlx-day-recipe">${customNoteMark(d.customNote)}${d.customNote ? esc(d.customNote) : 'Lägg till en notering'}</h3>
          </div>
          <span class="dlx-day-chev" aria-hidden="true">›</span>
        </div>
      </article>`;
  }

  if (d.blocked) {
    return `
      <article class="dlx-day free slim${modeCls(d, 'free')}" data-date="${d.date}" onclick="dlxDayClick('${d.date}', '${attr(d.day)}')">
        <span class="dlx-rail" style="background:var(--birch-soft)"></span>
        <div class="dlx-day-head">
          <div class="dlx-day-when"><span class="dlx-day-dow">${esc(d.day)}</span>
            <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
            <span class="dlx-day-flags">${dayBadges(d)}</span></div>
          <div class="dlx-day-main"><p class="dlx-day-note">${I.free} Fri dag</p></div>
          <span class="dlx-day-chev" aria-hidden="true">›</span>
        </div>
      </article>`;
  }

  // Tom dag (gap) — bara framtida är klickbar. dlxDayClick routar: i byt
  // dag-läge väljs dagen som mål (receptet flyttas dit), annars öppnas
  // sheeten med egen-planering-editorn.
  const clickable = !d.isPast;
  const click = clickable ? `onclick="dlxDayClick('${d.date}', '${attr(d.day)}')"` : '';
  return `
    <article class="dlx-day gap slim${clickable ? '' : ' inert'}${modeCls(d, 'gap')}" data-date="${d.date}" ${click}>
      <span class="dlx-rail" style="background:transparent"></span>
      <div class="dlx-day-head">
        <div class="dlx-day-when"><span class="dlx-day-dow">${esc(d.day)}</span>
          <span class="dlx-day-date"><span class="dlx-day-num">${d.dayNum}</span><span class="dlx-day-mon">${MONTH_NAMES_SHORT[d.month]}</span></span>
          <span class="dlx-day-flags">${dayBadges(d)}</span></div>
        <div class="dlx-day-main"><p class="dlx-day-note muted">${clickable ? `<span class="dlx-add" title="Planera dagen" aria-label="Planera dagen">${I.plus}</span>` : '—'}</p></div>
        ${clickable ? '<span class="dlx-day-chev" aria-hidden="true">›</span>' : ''}
      </div>
    </article>`;
}

function renderDayCard(d) {
  const isRecipe = d.recipeId && !d.isCustom;
  const cls = (d.isToday ? ' is-today' : '') + (d.isPast ? ' is-past' : '') + (d.isArchive ? ' is-archive' : '');
  let html = isRecipe ? recipeDayCard(d, { active: d.planId === 'active', cls }) : emptyDayCard(d);
  // recipeDayCard får is-today/is-past/is-archive via opts; emptyDayCard (egen dag,
  // fri dag, tom dag) gör inte det — injicera samma tillståndsklasser här så att
  // dämpningen av passerade dagar gäller ALLA korttyper, inte bara receptdagar.
  if (!isRecipe && cls) html = html.replace('class="dlx-day', 'class="dlx-day' + cls);
  // Helg → dovare kort-bakgrund. Klassen injiceras på ett ställe så att alla
  // korttyper täcks utan att röra varje mall. Suppr. på "idag" (rust-ramen räcker).
  if (d.isWeekend && !d.isToday) html = html.replace('class="dlx-day', 'class="dlx-day is-weekend');
  // Helgdag (midsommar m.fl.) → chip-markering med EN placering på alla korttyper:
  // strax före chevronen (höger). Bara icke-klickbara kort (förfluten gap utan
  // chevron) faller tillbaka på main. Aldrig i den smala datumkolumnen (radbryts).
  if (d.holiday) {
    const chip = `<span class="dlx-day-holiday">${esc(d.holiday)}</span>`;
    if (html.includes('dlx-day-chev')) {
      html = html.replace('<span class="dlx-day-chev"', `${chip}<span class="dlx-day-chev"`);
    } else {
      html = html.replace('<div class="dlx-day-main">', `<div class="dlx-day-main">${chip}`);
    }
  }
  return html;
}

// ── Huvudrendering ────────────────────────────────────────────────────────────
// Sektionsvis diff-rendering: varje del (historik/hero/banner/ikväll/dagar)
// bor i en egen wrapper (display: contents → påverkar inte layouten) och får
// sin innerHTML utbytt BARA när innehållet faktiskt ändrats. Det gör att t.ex.
// heron aldrig byggs om när man expanderar ett kort eller när realtime-ekot
// från ens egen skrivning kommer — inget blink, ingen fladder.
function setSec(host, name, html) {
  let el = host.querySelector(`:scope > .dlx-sec[data-sec="${name}"]`);
  if (!el) {
    el = document.createElement('div');
    el.className = 'dlx-sec';
    el.dataset.sec = name;
    host.appendChild(el);
  }
  if (el._dlxHtml !== html) { el.innerHTML = html; el._dlxHtml = html; }
}

// Per-dag diff-rendering av dagslistan. Varje dag bor i en egen keyed slot
// (display:contents → påverkar inte flex-layouten i .dlx-days). Bara den dag
// vars innehåll FAKTISKT ändrats får sin innerHTML utbytt — så ett realtime-eko
// som rör en enda dag inte längre bygger om hela veckan (mindre fladder, bevarar
// övriga korts state). Vid veckobyte omordnas slotarna med appendChild (flyttar
// noden, bygger inte om). Ikväll-kortet ersätter dagens kort inline; släppzoner
// (flytta-läge) bäddas in i berörd dags slot. Keyas på data-slot (INTE data-date)
// för att inte krocka med befintliga #weekDeluxe [data-date]-queries.
function renderDaysDiff(host, days, { tonightHtml = '', tonightDate = null } = {}) {
  let sec = host.querySelector(':scope > .dlx-sec[data-sec="days"]');
  if (!sec) {
    sec = document.createElement('div');
    sec.className = 'dlx-sec';
    sec.dataset.sec = 'days';
    host.appendChild(sec);
  }
  let container = sec.querySelector(':scope > .dlx-days');
  if (!container) {
    sec.innerHTML = '';                       // rensa ev. gammalt helblock
    container = document.createElement('div');
    container.className = 'dlx-days';
    sec.appendChild(container);
  }

  const zones = moveZoneCtx();                 // släppzoner i flytta-läge (annars null)
  const existing = new Map();
  container.querySelectorAll(':scope > .dlx-day-slot').forEach(el => existing.set(el.dataset.slot, el));

  const keep = new Set();
  let cursor = container.firstChild;           // markör: förväntad nod i denna position
  for (const d of days) {
    let html = '';
    if (zones?.set.has(d.date)) html += dropZone(d.date);
    html += (tonightHtml && d.date === tonightDate) ? tonightHtml : renderDayCard(d);
    if (zones?.endAfter === d.date) html += dropZone(null);

    let slot = existing.get(d.date);
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'dlx-day-slot';
      slot.dataset.slot = d.date;
    }
    if (slot._dlxHtml !== html) { slot.innerHTML = html; slot._dlxHtml = html; }
    // Flytta BARA om noden inte redan står på rätt plats → noll DOM-rörelser när
    // ordningen är oförändrad (samma-vecka-omrender, t.ex. realtime-eko).
    if (slot === cursor) {
      cursor = cursor.nextSibling;
    } else {
      container.insertBefore(slot, cursor);
    }
    keep.add(d.date);
  }
  existing.forEach((el, date) => { if (!keep.has(date)) el.remove(); });
}

// Banner för pågående byt/flytta-läge — state-driven så den överlever re-renders.
function modeBannerHtml() {
  if (window._dlxSwap) {
    const busy = !!window._dlxSwap.pending;
    return `<div class="dlx-swap-banner${busy ? ' busy' : ''}">
      <span>${busy ? `${I.swap} Byter dag…` : `${I.swap} Välj dagen att byta med — recept, egen planering eller tom dag`}</span>
      ${busy ? '' : '<button onclick="dlxCancelSwap()">Avbryt</button>'}</div>`;
  }
  if (window._dlxMove) {
    const busy = !!window._dlxMove.pending;
    return `<div class="dlx-swap-banner${busy ? ' busy' : ''}">
      <span>${busy ? `${I.move} Flyttar dag…` : `${I.move} Tryck på platsen dit dagen ska flyttas`}</span>
      ${busy ? '' : '<button onclick="dlxCancelMove()">Avbryt</button>'}</div>`;
  }
  return '';
}

// Notis när ett obekräftat förslag ligger helt utanför den visade veckan —
// wayfinding till förslagets dagar. Själva bekräfta-knapparna (#confirmPlanWrap)
// ligger utanför #weekDeluxe och syns oavsett visad vecka.
function weekNoticeHtml(plan, pending, weekStart) {
  if (!pending || !plan?.startDate || !plan?.endDate) return '';
  const weekEnd = addDaysIso(weekStart, 6);
  const overlaps = plan.startDate <= weekEnd && plan.endDate >= weekStart;
  if (overlaps) return '';
  return `<button type="button" class="dlx-plan-notice" onclick="dlxWeekGoto('${plan.startDate}')">
    ${I.free}<span>Förslag väntar ${fmtShort(plan.startDate)} – ${fmtShort(plan.endDate)} — visa veckan</span><span class="dlx-plan-notice-chev" aria-hidden="true">›</span>
  </button>`;
}

export function renderDeluxe() {
  if (!ensureScaffold()) return;
  const host = document.getElementById('weekDeluxe');
  if (!host) return;

  const timeline = sortedTimeline();
  if (!timeline.length) { host.innerHTML = ''; return; }

  const plan = window._lastPlan || null;
  const pending = !!(plan?.days?.length) && !plan?.confirmedAt && !window.planConfirmed;
  const todayIso = fmtIso(new Date());

  // EN kalendervecka i taget (mån–sön), default innevarande. Passerade veckor
  // är ett ‹-tryck bort (ersätter det gamla historik-dragspelet). Ikväll-kortet
  // ersätter dagens kort inline i listan när innevarande vecka visas — bara om
  // dagen är helt oplanerad (gap) ligger vanliga kortet kvar ("+ Planera dagen").
  const weekStart = shownWeekStart();
  const weekDays = shownWeekDays();
  const isCurrentWeek = weekStart === currentWeekStart();

  const hero = buildHero(weekDays, weekStart, plan, pending);
  const tonight = isCurrentWeek ? buildTonight(weekDays) : '';

  // Tömda sektioner (history/today) behålls så sektionsordningen är stabil och
  // gammal DOM från tidigare renderingar rensas — setSec tar aldrig bort element.
  setSec(host, 'history', '');
  setSec(host, 'hero', hero);
  setSec(host, 'banner', weekNoticeHtml(plan, pending, weekStart) + modeBannerHtml());
  setSec(host, 'today', '');
  renderDaysDiff(host, weekDays, { tonightHtml: tonight, tonightDate: todayIso });
}

// ── Interaktion ───────────────────────────────────────────────────────────────
// All daginteraktion går via snabbåtgärds-sheeten (dlxDayClick, definierad i
// sheet-sektionen nedan) — inga inline-utfällningar som knuffar layouten.

function weekRecipeIds() {
  return (window._lastPlan?.days || []).map(d => d.recipeId).filter(id => id != null);
}

function rerender(plan, shop) {
  window.renderWeeklyPlanData(plan, shop, false, window._planArchive, window._customDays);
  if (shop && window.renderShoppingData) window.renderShoppingData(shop);
}

window.dlxShuffle = async function (date, btn) {
  if (window._opBusy) return;
  window._opBusy = true;
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  const day = window._lastPlan?.days?.find(d => d.date === date);
  suppressEcho();
  try {
    const res = await window.apiFetch('/api/replace-recipe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        currentRecipeId: day?.recipeId || undefined,
        weekRecipeIds: weekRecipeIds(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'fel');
    window.updateLastPlanDay(date, data.recipeId, data.recipe);
    suppressEcho();
    rerender(window._lastPlan, data.shoppingList || window._lastShop);
    dlxFlashDates([date]);
  } catch {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    dlxFlashError(date, 'Kunde inte byta recept — prova igen.');
  } finally {
    window._opBusy = false;
  }
};

window.dlxFreeDay = async function (date, btn) {
  if (window._opBusy) return;
  window._opBusy = true;
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  suppressEcho();
  try {
    const res = await window.apiFetch('/api/skip-day', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, action: 'free' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'fel');
    suppressEcho();
    rerender(data.weeklyPlan, data.shoppingList || window._lastShop);
    dlxFlashDates([date]);
    return true;   // sheeten (#15) toastar sitt eget kvitto vid lyckat resultat
  } catch {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    dlxFlashError(date, 'Kunde inte göra dagen fri — prova igen.');
    return false;
  } finally {
    window._opBusy = false;
  }
};

function dlxFlashError(date, msg) {
  // [data-date] (inte .dlx-day) så även Ikväll-kortet träffas; utan utfälld
  // detalj (t.ex. åtgärd från sheeten) faller felet tillbaka på en toast.
  const detail = document.querySelector(`#weekDeluxe [data-date="${date}"] .dlx-detail`);
  if (!detail) { window.showToast?.(msg, { type: 'error' }); return; }
  let el = detail.querySelector('.dlx-err');
  if (!el) { el = document.createElement('p'); el.className = 'dlx-err'; detail.appendChild(el); }
  el.textContent = msg;
}

// ── Byt dag (swap) ────────────────────────────────────────────────────────────
// State-driven: _dlxSwap = { from, pending } styr banner, mål-markeringar och
// nedtonade kort via renderDeluxe/modeCls — inga imperativa DOM-patchar som
// kan tappas vid re-render. window._opBusy spärrar parallella åtgärder (dubbel-tryck
// eller två ändringar samtidigt = klassisk källa till trasiga planer).
// Bor på window (state.js) så custom-days-vägen i plan-viewer.js delar
// samma spärr (backlog #10) — inte två oberoende guards som kan korsa varandra.

// Eko-dämpning: våra egna skrivningar triggar realtime-events som annars
// orsakar en onödig full omhämtning sekunden efter (blinket). Svaret från
// API:t är redan sanningen — be realtime-lyssnaren ignorera ekot en stund.
function suppressEcho() {
  window._planMutateUntil = Date.now() + 4000;
}

// Kort glöd-markering på berörda dagar efter en lyckad åtgärd — kvitto för ögat.
function dlxFlashDates(dates) {
  requestAnimationFrame(() => {
    for (const date of dates) {
      document.querySelectorAll(`#weekDeluxe [data-date="${date}"]`).forEach(el => {
        el.classList.add('dlx-flash');
        setTimeout(() => el.classList.remove('dlx-flash'), 1400);
      });
    }
  });
}

window.dlxStartSwap = function (fromDate) {
  if (window._opBusy) return;
  window._dlxMove = null;
  window._dlxSwap = { from: fromDate, pending: null };
  renderDeluxe();
};

window.dlxCancelSwap = function () {
  if (window._dlxSwap?.pending) return;   // mitt i en skrivning — låt den landa
  window._dlxSwap = null;
  renderDeluxe();
};

// Avbryt pågående läge med Escape (mobil har Avbryt-knappen i bannern)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (window._dlxSheet) { window.dlxCloseSheet(); return; }
  if (window._dlxSwap && !window._dlxSwap.pending) window.dlxCancelSwap();
  if (window._dlxMove && !window._dlxMove.pending) window.dlxCancelMove();
});

// ── Flytta dag (kläm in mellan två dagar) ─────────────────────────────────────
// Källdagen lyfts ur och kläms in på vald position; mellanliggande recept
// roteras (datumen ligger fast). Släppzoner renderas mellan korten av
// renderDaysDiff när _dlxMove är satt.

// Zon-kontext för pågående flytt: vilka "före"-datum som får en släppzon,
// och efter vilket kort slutzonen ("sist i planen") ligger.
function moveZoneCtx() {
  const from = window._dlxMove?.from;
  if (!from) return null;
  const todayIso = fmtIso(new Date());
  const movable = (window._lastPlan?.days || []).filter(d => !d.blocked && d.recipeId);
  const srcIdx = movable.findIndex(d => d.date === from);
  if (srcIdx === -1) return null;
  const successor = movable[srcIdx + 1]?.date || null;

  const set = new Set();
  for (const d of movable) {
    if (d.date < todayIso) continue;       // inga flytt till passerade positioner
    if (d.date === from) continue;         // zonen före källan = no-op
    if (d.date === successor) continue;    // zonen direkt efter källan = no-op
    set.add(d.date);
  }
  // Slutzon efter sista flyttbara dagen — utom när källan redan ligger sist
  const last = movable[movable.length - 1]?.date || null;
  const endAfter = (last && last !== from) ? last : null;
  return { set, endAfter };
}

function dropZone(before) {
  return `<button type="button" class="dlx-drop-zone" onclick="dlxPickMoveTarget('${before || ''}')">
    <span>${I.move} Flytta hit</span>
  </button>`;
}

window.dlxStartMove = function (fromDate) {
  if (window._opBusy) return;
  window._dlxSwap = null;
  window._dlxMove = { from: fromDate, pending: null };
  renderDeluxe();
};

window.dlxCancelMove = function () {
  if (window._dlxMove?.pending) return;   // mitt i en skrivning — låt den landa
  window._dlxMove = null;
  renderDeluxe();
};

window.dlxPickMoveTarget = async function (before) {
  const move = window._dlxMove;
  if (!move || move.pending || window._opBusy) return;
  const from = move.from;

  // Omedelbar feedback: banner växlar till "Flyttar dag…", källan får spinner
  window._opBusy = true;
  move.pending = before || '__end__';
  renderDeluxe();
  suppressEcho();

  // Receptet som flyttas — för glöd-kvittot på landningsdagen efteråt
  const movedId = (window._lastPlan?.days || []).find(x => x.date === from)?.recipeId ?? null;

  try {
    const res = await window.apiFetch('/api/move-day', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: from, before: before || null }),
    });
    const data = await res.json();
    if (!res.ok) throw dlxServerError(data.error);
    window._dlxMove = null;
    suppressEcho();
    rerender(data.weeklyPlan, window._lastShop);
    const landed = movedId != null
      ? (data.weeklyPlan?.days || []).find(x => x.recipeId === movedId && x.date !== from)?.date
      : null;
    dlxFlashDates(landed ? [landed] : [from]);
  } catch (e) {
    move.pending = null;
    renderDeluxe();   // läget kvar — användaren kan välja en annan plats eller avbryta
    window.showToast?.(dlxUserMessage(e, 'Kunde inte flytta dagen — prova igen.'), { type: 'error' });
  } finally {
    window._opBusy = false;
  }
};

async function dlxPickSwapTarget(toDate) {
  const swap = window._dlxSwap;
  if (!swap || swap.pending || window._opBusy) return;
  if (toDate === swap.from) return;

  // Förvalidera mot tidslinjen — begripligt besked direkt, ingen server-tur
  const t = (window._timelineByDate || {})[toDate];
  if (t) {
    if (t.isArchive) { window.showToast?.('Arkiverade veckor är historik och kan inte ändras — bara dagar i aktuella matsedeln går att byta.', { type: 'info' }); return; }
    if (t.blocked)   { window.showToast?.('Fria dagar kan inte bytas — ångra fri dag först.', { type: 'info' }); return; }
    // F024 (QC-natt): blockera passerade dagar oavsett isCustom — tidigare
    // slapp egen-planering-dagar (t.isCustom=true) igenom kollen helt, vilket
    // lät ett byte mot en gammal anteckning dra tillbaka planens spann.
    if (!t.recipeId && t.isPast) { window.showToast?.('Passerade dagar kan inte väljas som mål.', { type: 'info' }); return; }
  }

  // Omedelbar feedback: banner växlar till "Byter dag…", båda korten markeras
  window._opBusy = true;
  swap.pending = toDate;
  renderDeluxe();
  suppressEcho();

  try {
    const res = await window.apiFetch('/api/swap-days', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date1: swap.from, date2: toDate }),
    });
    const data = await res.json();
    if (!res.ok) throw dlxServerError(data.error);
    window._dlxSwap = null;
    suppressEcho();
    // Egna anteckningar kan ha bytt datum → spegla det innan re-render.
    if (data.customDays) window._customDays = data.customDays;
    rerender(data.weeklyPlan || window._lastPlan, data.shoppingList || window._lastShop);
    dlxFlashDates([swap.from, toDate]);
  } catch (e) {
    swap.pending = null;
    renderDeluxe();   // läget kvar — användaren kan välja ett annat mål eller avbryta
    window.showToast?.(dlxUserMessage(e, 'Kunde inte byta dagarna — prova igen.'), { type: 'error' });
  } finally {
    window._opBusy = false;
  }
}

// ── Dag-sheeten (backlog #15, variant B — universellt interaktionsmönster) ───
// Bottensheet som är ENDA vägen in i daginteraktionen: alla dagkort (recept,
// egen planering, fri dag, tom dag, arkiv) öppnar sheeten vid tryck — inga
// inline-utfällningar som knuffar layouten. Ren INRAMNING — all mutations-
// logik återanvänds från befintliga, säkra flöden:
//   Byt middag      → swap-days (byt plats, ok även på bekräftad plan) eller
//                     replace-recipe (slumpa/välj själv, bara obekräftad plan)
//   Äter ute/rester/fri dag → skip-day 'free' ("skjut planen →", receptet
//                     sparas, inköpslistan rörs aldrig) + Ångra via unfreeDay
//   Byt/Flytta dag  → befintliga swap-/move-lägena (banner + mål-markering)
//   Editorer        → customDayEditorHtml/blockedDayEditorHtml renderas i
//                     sheeten; deras spara-flöden stänger den via dlxCloseSheet
//   Lägg till       → addManualItem (delade inköpslistan, kategori Övrigt)

let _sheetAdded = [];   // varor tillagda i denna sheet-session (kvitto-chips)

function ensureSheetHost() {
  if (document.getElementById('dlxSheet')) return;
  const back = document.createElement('div');
  back.id = 'dlxSheetBackdrop';
  back.className = 'dlx-sheet-backdrop';
  back.addEventListener('click', () => window.dlxCloseSheet());
  const sheet = document.createElement('div');
  sheet.id = 'dlxSheet';
  sheet.className = 'dlx-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Dagens åtgärder');
  document.body.appendChild(back);
  document.body.appendChild(sheet);
}

// Universell klick-router för ALLA dagkort: i byt dag-läge väljs dagen som mål
// (dlxPickSwapTarget förvaliderar med begripliga besked), i flytta-läge är bara
// släppzonerna klickbara — annars öppnas sheeten för dagen.
window.dlxDayClick = function (date, dayName) {
  if (window._dlxSwap) { dlxPickSwapTarget(date); return; }
  if (window._dlxMove) return;
  openDaySheet(date, dayName);
};

function openDaySheet(date, day) {
  // Syntetiska dagar (kantvecka utanför horisonten) får samma sheet — en
  // sparad egen planering utökar horisonten vid nästa laddning.
  const d = (window._timelineByDate || {})[date] || synthDay(date);
  ensureSheetHost();
  _sheetAdded = [];
  // Startvy per dagtyp: receptdagar → meny (arkiv direkt till läsläget),
  // egen planering med recept → meny, övriga (notering/fri/tom) → editorn.
  let view;
  if ((d.recipeId && !d.isCustom) || (d.isCustom && d.customRecipeId)) {
    view = d.isArchive ? 'recept' : 'meny';
  } else if (d.isCustom || d.blocked || !d.isPast) {
    view = 'editor';
  } else {
    return;   // passerad tom dag — inget att göra
  }
  window._dlxSheet = { date, day, view };
  renderSheet();
  requestAnimationFrame(() => {
    document.getElementById('dlxSheetBackdrop')?.classList.add('open');
    document.getElementById('dlxSheet')?.classList.add('open');
  });
  window.pushSheetHistory?.();   // F196: Android/PWA-bakåtknapp ska stänga sheeten
}

window.dlxCloseSheet = function () {
  const wasOpen = !!window._dlxSheet;
  window._dlxSheet = null;
  document.getElementById('dlxSheetBackdrop')?.classList.remove('open');
  document.getElementById('dlxSheet')?.classList.remove('open');
  if (wasOpen) window.popSheetHistory?.();
};

function sheetRow(onclick, iconCls, icon, title, subText) {
  return `<button type="button" class="dlx-sheet-row" onclick="${onclick}">
      <span class="dlx-sheet-ic${iconCls ? ' ' + iconCls : ''}">${icon}</span>
      <span class="dlx-sheet-txt"><span class="dlx-sheet-t">${title}</span><span class="dlx-sheet-d">${subText}</span></span>
    </button>`;
}

// Rubrikrad för dagen ("Ikväll · 3 juli" / "Lördag · 4 juli")
function sheetWhen(d) {
  return `${d.isToday ? 'Ikväll' : esc(d.day)} · ${d.dayNum} ${MONTH_NAMES_SHORT[d.month]}`;
}

// Receptdetalj i sheeten (ersätter den gamla inline-utfällningen). Läsvänlig,
// scrollar i sheeten; åtgärderna bor i meny-vyn.
function sheetRecipeHtml(d) {
  const rid = d.isCustom ? d.customRecipeId : d.recipeId;
  const title = d.isCustom ? d.customRecipeTitle : d.recipe;
  const r = recipeById(rid);
  const backClick = d.isArchive ? 'dlxCloseSheet()' : "dlxSheetView('meny')";
  const back = `<button type="button" class="dlx-sheet-back" onclick="${backClick}">‹ ${d.isArchive ? 'Stäng' : 'Tillbaka'}</button>`;
  if (!r) {
    return `${back}
      <p class="dlx-sheet-title">${esc(title || 'Recept')}</p>
      <p class="dlx-sheet-empty">Receptet finns inte längre i receptboken.</p>
      <button class="dlx-mini-btn" onclick="dlxCloseSheet();jumpToRecipe('${attr(title)}')">Sök i receptboken</button>`;
  }
  const ings = (r.ingredients || []).map(i => `<li>${esc(i)}</li>`).join('');
  const steps = (r.instructions || []).map((st, i) =>
    `<li><span class="dlx-step-num">${i + 1}</span><span>${esc(st)}</span></li>`).join('');
  const notes = r.notes ? `<div class="dlx-notes">💡 ${esc(r.notes)}</div>` : '';
  return `${back}
    <p class="dlx-sheet-sub">${sheetWhen(d)}${d.isArchive ? ' · 📜 Historisk plan — bara för referens' : ''}</p>
    <p class="dlx-sheet-title">${esc(r.title)}</p>
    <div class="dlx-detail-head">
      <span class="dlx-status ${r.tested ? 'tested' : 'untested'}">${r.tested ? '✓ Provat' : 'Ej provat'}</span>
      <span class="dlx-detail-portions">${r.servings} portioner</span>
      <button type="button" class="dlx-cook-btn" onclick="dlxCloseSheet();openCookMode(${r.id})">${I.pot}<span>Börja laga</span></button>
    </div>
    <div class="dlx-detail-cols">
      <section class="dlx-detail-block">
        <h4>Ingredienser</h4>
        <ul class="dlx-ings">${ings}</ul>
      </section>
      <section class="dlx-detail-block">
        <h4>Gör så här</h4>
        <ol class="dlx-steps">${steps}</ol>
      </section>
    </div>
    ${notes}`;
}

// Meny-vyn: dagens åtgärder — raduppsättningen följer samma regler som den
// gamla kortutfällningen (canReplace/canMove/isPast), plus Ikväll-extran.
function sheetMenuHtml(d, s) {
  const isCustomRecipe = d.isCustom && d.customRecipeId;
  const r = recipeById(isCustomRecipe ? d.customRecipeId : d.recipeId);
  const title = isCustomRecipe ? d.customRecipeTitle : d.recipe;
  const sub = [r?.time ? `${r.time} min` : null, r ? PROTEIN_LABEL[r.protein] : null].filter(Boolean).join(' · ');

  let rows = sheetRow("dlxSheetView('recept')", '', I.pot, 'Visa receptet', 'Ingredienser och steg — börja laga');

  if (isCustomRecipe) {
    // Egen planering med recept: redigera (byt recept/notering) + byt dag
    rows += sheetRow("dlxSheetView('editor')", '', I.pencil, 'Redigera dagen', 'Byt recept, skriv notering eller ta bort');
    if (!d.isArchive) rows += sheetRow('dlxSheetStartSwap()', '', I.swap, 'Byt dag', 'Låt dagen byta plats med en annan dag');
  } else {
    const active = d.planId === 'active' && !d.isArchive;
    const canReplace = active && !window.planConfirmed;
    const targets = sheetSwapTargets(s.date);
    if (canReplace || targets.length) {
      rows += sheetRow("dlxSheetView('byt')", 'rust', I.shuffle, 'Byt middag',
        canReplace ? 'Ta en annan dag i veckan — eller ett nytt recept' : 'Ta en annan dag i veckan — listan påverkas inte');
    }
    if (active) {
      rows += sheetRow('dlxSheetStartSwap()', '', I.swap, 'Byt dag', 'Låt dagen byta plats med en annan dag');
      if (!d.isPast) {
        rows += sheetRow('dlxSheetStartMove()', '', I.move, 'Flytta dag', 'Kläm in dagen mellan två andra dagar');
        if (d.isToday) {
          rows += sheetRow("dlxSheetFree('ute')", '', I.fork, 'Vi äter ute', 'Ingen matlagning — receptet sparas till senare');
          rows += sheetRow("dlxSheetFree('rester')", 'ochre', I.leftovers, 'Rester ikväll', 'Töm kylskåpet — receptet sparas till senare');
        } else {
          rows += sheetRow("dlxSheetFree('fri')", '', I.free, 'Fri dag — skjut planen', 'Ingen middag den här dagen — receptet sparas till senare');
        }
      }
    }
  }
  // Inköpsrundor: lägg dagens ingredienser på listan / lägg tillbaka / ta bort.
  // Gäller receptdagar (egna och aktiva planens) som inte är arkiv/passerade.
  const hasListRecipe = isCustomRecipe || (d.planId === 'active' && !!d.recipeId);
  if (hasListRecipe && !d.isArchive && !d.isPast) {
    if (isShoppedDay(d)) {
      rows += sheetRow('dlxSheetAddToList()', '', I.cart, 'Lägg tillbaka på inköpslistan',
        'Behöver ni handla för dagen igen? Varorna läggs på listan på nytt');
    } else if (isOnListDay(d)) {
      if (isCustomRecipe) {
        rows += sheetRow('dlxSheetRemoveFromList()', '', I.cart, 'Ta bort från inköpslistan',
          'Dagens ingredienser plockas bort från listan');
      }
    } else if (isCustomRecipe || window.planConfirmed) {
      rows += sheetRow('dlxSheetAddToList()', '', I.cart, 'Lägg ingredienser på inköpslistan',
        'Varorna hamnar på familjens gemensamma lista');
    }
  }
  if (d.isToday) {
    rows += sheetRow("dlxSheetView('lista')", '', I.plus, 'Lägg till på listan', 'Något som saknas hemma?');
  }
  // Ta bort dagen HELT — gäller både genererade plandagar och egna dagar.
  // Danger-åtgärd sist i menyn; bekräftelsedialog i dlxSheetDeleteDay.
  if (!d.isArchive && (isCustomRecipe || d.planId === 'active')) {
    rows += sheetRow('dlxSheetDeleteDay()', 'rust', I.trash, 'Ta bort dagen helt',
      'Dagen försvinner ur matsedeln — varor som inte är inhandlade tas bort från listan');
  }

  return `
    <p class="dlx-sheet-sub">${sheetWhen(d)}${sub ? ` · ${esc(sub)}` : ''}${dayShopChip(d) ? ` ${dayShopChip(d)}` : ''}</p>
    <p class="dlx-sheet-title">${d.isToday ? `${I.pot}<span>` : '<span>'}${esc(title || '')}</span></p>
    ${rows}`;
}

function sheetSwapTargets(fromDate) {
  const todayIso = fmtIso(new Date());
  return (window._lastPlan?.days || []).filter(x =>
    x.recipeId && !x.blocked && x.date !== fromDate && x.date >= todayIso);
}

function renderSheet() {
  const s = window._dlxSheet;
  const el = document.getElementById('dlxSheet');
  if (!s || !el) return;
  const d = (window._timelineByDate || {})[s.date] || synthDay(s.date);
  let body = '';

  if (s.view === 'meny') {
    body = sheetMenuHtml(d, s);
  } else if (s.view === 'recept') {
    body = sheetRecipeHtml(d);
  } else if (s.view === 'byt') {
    const active = d.planId === 'active' && !d.isArchive;
    const canReplace = active && !window.planConfirmed;
    const targets = sheetSwapTargets(s.date);
    const withWhom = d.isToday ? 'ikväll' : `den ${d.dayNum} ${MONTH_NAMES_SHORT[d.month]}`;
    let rows = '';
    if (canReplace) {
      rows += sheetRow('dlxSheetShuffle()', 'rust', I.shuffle, 'Slumpa nytt recept', 'Appen väljer — de senaste veckornas rätter undviks');
      rows += sheetRow('dlxSheetPick()', '', I.pencil, 'Välj själv i receptboken', 'Bläddra bland alla recept');
    }
    if (targets.length) {
      rows += `<p class="dlx-sheet-cap">${canReplace ? 'Eller ta en annan dags middag' : 'Ta en annan dags middag — inköpslistan påverkas inte'}</p>`;
      rows += targets.map(t => {
        const tl = (window._timelineByDate || {})[t.date];
        const when = tl ? `${tl.day} ${tl.dayNum} ${MONTH_NAMES_SHORT[tl.month]}` : t.date;
        return sheetRow(`dlxSheetSwap('${t.date}')`, '', I.swap, esc(t.recipe || ''), `${esc(when)} · byter plats med ${withWhom}`);
      }).join('');
    }
    if (!rows) rows = `<p class="dlx-sheet-empty">Matsedeln är bekräftad och har inga fler receptdagar att byta med.</p>`;
    body = `
      <button type="button" class="dlx-sheet-back" onclick="dlxSheetView('meny')">‹ Tillbaka</button>
      <p class="dlx-sheet-title">Byt middag</p>
      ${rows}`;
  } else if (s.view === 'editor') {
    // Egen planering-/fri dag-/tom dag-editorn — samma editor-HTML som förut,
    // nu i sheeten. Spara-flödena i plan-viewer.js stänger sheeten vid lyckat
    // resultat (dlxCloseSheet-anrop i success-vägarna).
    const isCustomRecipe = d.isCustom && d.customRecipeId;
    const inner = (d.blocked && !d.isCustom)
      ? window.blockedDayEditorHtml(d.date, d.day)
      : window.customDayEditorHtml(d.date, d.day);
    const backBtn = isCustomRecipe
      ? `<button type="button" class="dlx-sheet-back" onclick="dlxSheetView('meny')">‹ Tillbaka</button>`
      : '';
    const swapBtn = (d.isCustom && !isCustomRecipe && d.customNote && !d.isArchive)
      ? `<div class="dlx-actions"><button class="dlx-act" onclick="dlxSheetStartSwap()">${I.swap}<span>Byt dag</span></button></div>`
      : '';
    body = `${backBtn}<div class="dlx-sheet-editor">${inner}</div>${swapBtn}`;
  } else if (s.view === 'lista') {
    const chips = _sheetAdded.length
      ? `<div class="dlx-sheet-added">${_sheetAdded.map(x => `<span>${esc(x)}</span>`).join('')}</div>`
      : '';
    body = `
      <button type="button" class="dlx-sheet-back" onclick="dlxSheetView('meny')">‹ Tillbaka</button>
      <p class="dlx-sheet-title">Lägg till på listan</p>
      <p class="dlx-sheet-sub">Varan hamnar under Övrigt i den delade inköpslistan.</p>
      <div class="dlx-sheet-addrow">
        <input type="text" id="dlxSheetItemInput" class="custom-note-input" maxlength="80"
               placeholder="T.ex. mjölk, bananer…"
               onkeydown="if(event.key==='Enter'){event.preventDefault();dlxSheetAdd()}">
        <button type="button" id="dlxSheetItemBtn" class="dlx-sheet-addbtn" onclick="dlxSheetAdd()">Lägg till</button>
      </div>
      ${chips}`;
  }

  el.innerHTML = `<div class="dlx-sheet-grip" aria-hidden="true"></div>${body}`;
}

window.dlxSheetView = function (view) {
  if (!window._dlxSheet) return;
  window._dlxSheet.view = view;
  renderSheet();
  if (view === 'lista') document.getElementById('dlxSheetItemInput')?.focus();
};

// Byt dag / Flytta dag — stäng sheeten och gå in i befintligt läge (banner +
// mål-markeringar). Samma flöden som förut, bara ny ingång.
window.dlxSheetStartSwap = function () {
  const s = window._dlxSheet;
  if (!s) return;
  window.dlxCloseSheet();
  window.dlxStartSwap(s.date);
};

window.dlxSheetStartMove = function () {
  const s = window._dlxSheet;
  if (!s) return;
  window.dlxCloseSheet();
  window.dlxStartMove(s.date);
};

window.dlxSheetShuffle = function () {
  const s = window._dlxSheet;
  if (!s) return;
  window.dlxCloseSheet();
  window.dlxShuffle(s.date, null);
};

window.dlxSheetPick = function () {
  const s = window._dlxSheet;
  if (!s) return;
  window.dlxCloseSheet();
  window.enterReplaceMode(s.date, s.day);
};

// Byt plats med en annan receptdag — samma väg som "Byt dag"-flödet, men målet
// är redan valt så swap-läget aldrig syns. Vid fel städas läget (toast visas
// av dlxPickSwapTarget) så användaren inte lämnas i ett oväntat byt dag-läge.
window.dlxSheetSwap = async function (toDate) {
  const s = window._dlxSheet;
  if (!s || window._opBusy) return;
  window.dlxCloseSheet();
  window._dlxMove = null;
  window._dlxSwap = { from: s.date, pending: null };
  await dlxPickSwapTarget(toDate);
  if (!window._dlxSwap) {
    window.showToast?.('Middagarna har bytt plats.', { type: 'success' });
  } else if (!window._dlxSwap.pending) {
    window._dlxSwap = null;
    renderDeluxe();
  }
};

// Vi äter ute / Rester ikväll / Fri dag → skip-day free ("skjut planen →"):
// receptet flyttas till slutet av matsedeln, inköpslistan rörs inte.
// Ångra-knapp i kvitto-toasten.
window.dlxSheetFree = async function (kind) {
  const s = window._dlxSheet;
  if (!s || window._opBusy) return;
  const recipeTitle = (window._lastPlan?.days || []).find(x => x.date === s.date)?.recipe || 'Receptet';
  window.dlxCloseSheet();
  const ok = await window.dlxFreeDay(s.date, null);
  if (ok) {
    const msg = kind === 'rester'
      ? `Rester ikväll — ${recipeTitle} flyttas till slutet av matsedeln.`
      : kind === 'ute'
        ? `Ni äter ute ikväll — ${recipeTitle} flyttas till slutet av matsedeln.`
        : `Dagen är fri — ${recipeTitle} flyttas till slutet av matsedeln.`;
    window.showToast?.(msg, { type: 'success', action: { label: 'Ångra', onClick: () => window.unfreeDay(s.date) } });
  }
};

// Inköpsrundor: lägg dagens ingredienser på listan (custom-dag eller
// återläggning av inhandlad dag — servern nollar spärren) respektive ta bort
// en dags ingredienser. Servern bygger om listan; vi hämtar om båda vyerna.
async function sheetListAction(action, successMsg) {
  const s = window._dlxSheet;
  if (!s || window._opBusy) return;
  window._opBusy = true;
  try {
    const res = await window.apiFetch('/api/shopping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, date: s.date }),
    });
    let data = {};
    try { data = await res.json(); } catch { /* ingen JSON */ }
    if (!res.ok) throw Object.assign(new Error(data.error || ''), { serverMsg: data.error });
    window.dlxCloseSheet();
    window._planMutateUntil = Date.now() + 4000;   // dämpa realtids-ekot
    window._preserveChecked = false;
    window.loadShoppingTab?.();      // Inköp-fliken: nya listan + täckningsrad
    await window.loadWeeklyPlan();   // Matsedeln: chips + rundstatus
    window.showToast?.(successMsg, { type: 'success' });
  } catch (e) {
    window.showToast?.(e?.serverMsg || 'Kunde inte uppdatera inköpslistan — prova igen.', { type: 'error' });
  } finally {
    window._opBusy = false;
  }
}

window.dlxSheetAddToList = function () {
  const s = window._dlxSheet;
  if (!s) return;
  sheetListAction('add_day', `${s.day}ens ingredienser ligger nu på inköpslistan.`);
};

window.dlxSheetRemoveFromList = function () {
  const s = window._dlxSheet;
  if (!s) return;
  sheetListAction('remove_day', `${s.day}ens ingredienser togs bort från inköpslistan.`);
};

// Ta bort dagen HELT (även genererade plandagar) — danger-bekräftelse, sedan
// /api/skip-day action:delete. Servern städar inköpslistan (o-inhandlade
// varor) och räknar om planens datumspann; tömd plan deaktiveras.
window.dlxSheetDeleteDay = async function () {
  const s = window._dlxSheet;
  if (!s || window._opBusy) return;
  const d = (window._timelineByDate || {})[s.date] || {};
  const what = d.recipe || d.customRecipeTitle || d.customNote || null;
  const ok = await window.confirmDialog({
    title: 'Ta bort dagen helt?',
    message: `${s.day}${what ? ` (${what})` : ''} försvinner ur matsedeln. Varor som inte är inhandlade tas bort från inköpslistan.`,
    confirmLabel: 'Ta bort dagen',
    danger: true,
  });
  if (!ok) return;
  window._opBusy = true;
  try {
    const res = await window.apiFetch('/api/skip-day', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: s.date, action: 'delete' }),
    });
    let data = {};
    try { data = await res.json(); } catch { /* ingen JSON */ }
    if (!res.ok) throw Object.assign(new Error(data.error || ''), { serverMsg: data.error });
    window.dlxCloseSheet();
    window._planMutateUntil = Date.now() + 4000;   // dämpa realtids-ekot
    if (data.shoppingList) {
      window._preserveChecked = false;
      window.loadShoppingTab?.();
    }
    await window.loadWeeklyPlan();
    if (data.listStale) {
      window.showToast?.('Dagen är borttagen, men inköpslistan kunde inte uppdateras — ladda om och prova igen.', { type: 'error' });
    } else {
      window.showToast?.('Dagen är borttagen ur matsedeln.', { type: 'success' });
    }
  } catch (e) {
    window.showToast?.(e?.serverMsg || 'Kunde inte ta bort dagen — prova igen.', { type: 'error' });
  } finally {
    window._opBusy = false;
  }
};

// Lägg till på listan — återanvänder addManualItem (som toastar sina egna fel
// och tömmer fältet BARA vid lyckad skrivning → tomt fält = kvitto).
window.dlxSheetAdd = async function () {
  if (!window._dlxSheet) return;
  const input = document.getElementById('dlxSheetItemInput');
  const item = input?.value.trim();
  if (!item) { input?.focus(); return; }
  // Inköpsfliken kanske aldrig öppnats denna session → ladda listan först
  // så addManualItem har ett list-id att skriva mot.
  try {
    if (!window._shopListId && window.loadShoppingTab) await window.loadShoppingTab();
  } catch { /* addManualItem ger begripligt fel nedan */ }
  await window.addManualItem('dlxSheetItemInput', 'dlxSheetItemBtn');
  if (input && input.value === '') {
    _sheetAdded.push(item);
    window.showToast?.(`${item} ligger nu på inköpslistan.`, { type: 'success' });
    if (window._dlxSheet) {
      renderSheet();
      document.getElementById('dlxSheetItemInput')?.focus();
    }
  }
};

// ── Håll båda vyerna i synk ───────────────────────────────────────────────────
// Vi wrappar flera ingångar eftersom plan-viewer.js internt anropar sin LOKALA
// renderWeeklyPlanData (inte window.*), så det räcker inte att bara wrappa den.
// - renderWeeklyPlanData: genereringsväg + våra egna deluxe-åtgärder (window.*)
// - loadWeeklyPlan: första laddning (boot) + realtime-omladdning
// - switchTab: säkerhetsnät när man öppnar fliken Matsedeln
function wrapSync(name, { async = false } = {}) {
  const orig = window[name];
  if (typeof orig !== 'function' || orig.__dlxWrapped) return;
  let wrapped;
  if (async) {
    wrapped = async function (...args) {
      const r = await orig.apply(this, args);
      try { renderDeluxe(); } catch (e) { console.error('renderDeluxe', e); }
      return r;
    };
  } else {
    wrapped = function (...args) {
      const r = orig.apply(this, args);
      try { renderDeluxe(); } catch (e) { console.error('renderDeluxe', e); }
      return r;
    };
  }
  wrapped.__dlxWrapped = true;
  window[name] = wrapped;
}

function installHooks() {
  wrapSync('renderWeeklyPlanData');
  wrapSync('loadWeeklyPlan', { async: true });
  // switchTab: rendera bara när vi faktiskt landar på veckofliken.
  const origSwitch = window.switchTab;
  if (typeof origSwitch === 'function' && !origSwitch.__dlxWrapped) {
    const wrappedSwitch = function (tab) {
      // Nollställ visad vecka vid flikbyte → Matsedeln öppnas alltid på
      // innevarande vecka (switchTab scrollar redan till toppen i navigation.js).
      resetShownWeek();
      const r = origSwitch.apply(this, arguments);
      if (tab === 'vecka') {
        try { renderDeluxe(); } catch (e) { console.error('renderDeluxe', e); }
      }
      return r;
    };
    wrappedSwitch.__dlxWrapped = true;
    window.switchTab = wrappedSwitch;
  }
}

// Modulerna ovan importeras före denna → window.*-funktionerna finns redan.
installHooks();
// Säkerställ skal + läge så snart DOM finns.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { ensureScaffold(); });
} else {
  ensureScaffold();
}

window.renderDeluxe = renderDeluxe;
