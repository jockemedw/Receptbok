// Matlagningsläge — fullskärmsvy för att laga ett recept vid spisen.
// Standard: ETT steg i taget med stor text och fast fotrad (Föregående/Nästa).
// Ingredienser (bockbara, portionsskalning) och "Visa alla steg" (hellistan)
// är två andra vyer i samma overlay — bockar och aktuellt steg bor i DOM:en
// och i _cookStep och överlever växlingarna. Wake Lock så att skärmen inte
// släcks. Ren presentationsvy — muterar ingen data.

import { escapeHtml, timeStr } from '../utils.js';

let _wakeLock = null;
let _overlay  = null;
let _scrollY  = 0;

async function acquireWakeLock() {
  try {
    if (!('wakeLock' in navigator)) return;
    const lock = await navigator.wakeLock.request('screen');
    if (!_overlay) { try { lock.release(); } catch { /* redan släppt */ } return; } // stängdes medan request väntade
    try { _wakeLock?.release(); } catch { /* redan släppt */ }                       // läck inte föregående lås
    _wakeLock = lock;
  } catch { /* batterisparläge m.m. — appen funkar ändå */ }
}
function releaseWakeLock() {
  try { _wakeLock?.release(); } catch { /* redan släppt */ }
  _wakeLock = null;
}
// Wake lock släpps av OS:et när fliken hamnar i bakgrunden — ta tillbaka det
function onVisibility() {
  if (document.visibilityState === 'visible' && _overlay) acquireWakeLock();
}
document.addEventListener('visibilitychange', onVisibility);

function lockScroll() {
  _scrollY = window.scrollY;
  document.body.classList.add('cook-open');
}
function unlockScroll() {
  document.body.classList.remove('cook-open');
  window.scrollTo(0, _scrollY);
}

function progressLabel(done, total) {
  if (!total) return '';
  return done >= total ? 'Allt klart — smaklig måltid! 🎉' : `Steg ${Math.min(done + 1, total)} av ${total}`;
}

// ── Vy-tillstånd (per lagningssession) ──────────────────────────────────────
let _cookSteps = [];        // stegtexter
let _cookStep  = 0;         // aktuellt steg (0-baserat)
let _cookView  = 'step';    // 'step' | 'ings' | 'all'
let _cookPrev  = 'step';    // vyn att gå tillbaka till från ingredienser
let _cookKeyHandler = null;

// ── Portionsskalning (#28, designförslag 2026-07 steg 6) ────────────────────
// Ren visningsskalning: raden i receptet rörs aldrig, bara siffran på skärmen.
// Rader utan tolkbar mängd (skafferivaror, "salt och peppar") lämnas orörda.
const QTY_UNITS = 'kg|hg|g|l|dl|cl|ml|msk|tsk|krm|st|påsar|påse|burkar|burk|klyftor|klyfta|kvistar|kvist|skivor|skiva|bitar|bit|krukor|kruka|förp\\.?';
const FRAC_VAL = { '¼': 0.25, '½': 0.5, '¾': 0.75 };
const LEAD_RE  = new RegExp(`^(\\d+(?:[.,]\\d+)?)?\\s*([¼½¾])?\\s*(${QTY_UNITS})?(?=\\s)\\s+(.+)$`, 'i');
const PAREN_RE = new RegExp(`^(.+?)\\s*\\((\\d+(?:[.,]\\d+)?)\\s*(${QTY_UNITS})?\\)$`, 'i');

export function parseQty(raw) {
  const t = String(raw || '').trim();
  let m = t.match(LEAD_RE);
  if (m && (m[1] || m[2])) {
    const whole = m[1] ? parseFloat(m[1].replace(',', '.')) : 0;
    const frac = m[2] ? FRAC_VAL[m[2]] : 0;
    // qtyText = mängden exakt som den står i receptet — visas orörd vid faktor 1
    return { kind: 'lead', num: whole + frac, unit: m[3] || '', rest: m[4], qtyText: t.slice(0, t.length - m[4].length).trim() };
  }
  m = t.match(PAREN_RE);
  if (m) return { kind: 'paren', num: parseFloat(m[2].replace(',', '.')), unit: m[3] || '', rest: m[1], qtyText: `${m[2]}${m[3] ? ' ' + m[3] : ''}` };
  return null;
}

// Vänlig avrundning (samma anda som inköpslistans #12): mängd-/volymenheter
// (kg/l/dl/cl/ml/g) visas exakt skalade (upp till två decimaler, sv-SE,
// utan onödiga nollor) — inget kvarts-golv. Övriga (msk/tsk/krm) behåller
// kvartsprecision. Styck-artade enheter visas som blandat bråk (1½).
const FRAC = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
const EXACT_UNITS = new Set(['kg', 'l', 'dl', 'cl', 'ml', 'g']);
export function fmtQty(value, unit) {
  const u = unit.toLowerCase();
  if (EXACT_UNITS.has(u)) {
    const s = Number(value.toFixed(2)).toLocaleString('sv-SE', { maximumFractionDigits: 2 });
    return `${s} ${unit}`;
  }
  const q = Math.max(0.25, Math.round(value * 4) / 4);
  if (u === 'msk' || u === 'tsk' || u === 'krm') {
    const s = (Math.round(q * 100) / 100).toLocaleString('sv-SE');
    return `${s} ${unit}`;
  }
  // styck-artade enheter (eller ingen enhet): blandat bråk
  const whole = Math.floor(q), frac = FRAC[Math.round((q - whole) * 100) / 100] || '';
  const numStr = whole === 0 ? frac : `${whole}${frac}`;
  return unit ? `${numStr} ${unit}` : numStr;
}

let _cookIngs = [];   // [{raw, parsed}] — indexmatchad mot li[data-i]
let _cookBase = 4;
let _cookServings = 4;

function servNoteText() {
  return _cookServings === _cookBase
    ? `receptet är för ${_cookBase}`
    : `mängderna skalade från ${_cookBase}`;
}

function ingLineHtml(entry, factor) {
  const { raw, parsed } = entry;
  if (!parsed) return escapeHtml(raw);
  // Faktor 1: receptets egen mängdtext, oförändrad (R10) — men fortfarande fetstilt.
  const qtyStr = factor === 1 ? parsed.qtyText : fmtQty(parsed.num * factor, parsed.unit);
  const qty = `<b class="cook-qty${factor !== 1 ? ' scaled' : ''}">${escapeHtml(qtyStr)}</b>`;
  return parsed.kind === 'lead'
    ? `${qty} ${escapeHtml(parsed.rest)}`
    : `${escapeHtml(parsed.rest)} (${qty})`;
}

function renderServings() {
  if (!_overlay) return;
  const factor = _cookServings / _cookBase;
  const val = _overlay.querySelector('.cook-serv-val');
  if (val) val.textContent = `${_cookServings} port.`;
  const note = _overlay.querySelector('.cook-serv-note');
  if (note) note.textContent = servNoteText();
  _overlay.querySelectorAll('.cook-ing > span:last-child').forEach((el, i) => {
    if (_cookIngs[i]) el.innerHTML = ingLineHtml(_cookIngs[i], factor);
  });
}

window._cookServStep = function (delta) {
  _cookServings = Math.min(12, Math.max(1, _cookServings + delta));
  renderServings();
};

function updateProgress() {
  if (!_overlay) return;
  const total = _cookSteps.length;
  const lbl   = _overlay.querySelector('.cook-progress-label');
  const bar   = _overlay.querySelector('.cook-progress-fill');
  const prev  = _overlay.querySelector('.cook-prev');
  const next  = _overlay.querySelector('.cook-next');
  const stepNo = Math.min(_cookStep + 1, total);
  const last  = _cookStep >= total - 1;

  // Förlopp: hellistan visar bockade steg, ett-steg-vyn visar var man är
  if (_cookView === 'all') {
    const done = _overlay.querySelectorAll('.cook-step.done').length;
    if (bar) bar.style.width = total ? `${(done / total) * 100}%` : '0%';
    if (lbl) lbl.textContent = progressLabel(done, total);
    _overlay.querySelectorAll('.cook-step').forEach((el, i) => el.classList.toggle('current', i === _cookStep && !el.classList.contains('done')));
  } else {
    if (bar) bar.style.width = total ? `${(stepNo / total) * 100}%` : '0%';
    if (lbl) lbl.textContent = total ? `Steg ${stepNo} av ${total}` : '';
  }

  // Aktuellt steg
  const txt = _overlay.querySelector('.cook-big-text');
  const num = _overlay.querySelector('.cook-big-num');
  if (txt) txt.textContent = _cookSteps[_cookStep] || 'Receptet har inga steg.';
  if (num) num.textContent = total ? String(stepNo) : '';

  // Fotrad
  if (prev) prev.disabled = _cookStep <= 0;
  if (next) {
    next.textContent = last ? 'Klart' : 'Nästa steg';
    next.dataset.last = last ? '1' : '';
  }
  const back = _overlay.querySelector('.cook-back-btn');
  if (back) back.textContent = total ? `Tillbaka till steg ${stepNo}` : 'Tillbaka';

  // Vy + knappar
  _overlay.dataset.view = _cookView;
  const ingBtn = _overlay.querySelector('.cook-ings-btn');
  if (ingBtn) {
    const open = _cookView === 'ings';
    ingBtn.textContent = open ? (_cookPrev === 'all' ? 'Alla steg' : 'Till steget') : 'Ingredienser';
    ingBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
  }
  const bigWrap = _overlay.querySelector('.cook-pane-step');
  if (bigWrap) { bigWrap.hidden = _cookView !== 'step'; }
  _overlay.querySelector('.cook-pane-ings').hidden = _cookView !== 'ings';
  _overlay.querySelector('.cook-pane-all').hidden = _cookView !== 'all';
  const foot = _overlay.querySelector('.cook-foot');
  if (foot) {
    foot.querySelector('.cook-foot-steps').hidden = _cookView !== 'step';
    foot.querySelector('.cook-foot-back').hidden = _cookView !== 'ings';
    foot.hidden = _cookView === 'all';
  }
  const main = _overlay.querySelector('.cook-main');
  if (main) main.scrollTop = 0;
}

function cookGo(delta) {
  if (!_overlay || _cookView !== 'step') return;
  const total = _cookSteps.length;
  const n = _cookStep + delta;
  if (n < 0) return;
  if (n >= total) { closeCookMode(); return; }
  _cookStep = n;
  updateProgress();
}
window._cookNext = () => cookGo(1);
window._cookPrevStep = () => cookGo(-1);

window._cookToggleIngs = function () {
  if (!_overlay) return;
  if (_cookView === 'ings') { _cookView = _cookPrev; }
  else { _cookPrev = _cookView; _cookView = 'ings'; }
  updateProgress();
};
window._cookToggleAll = function () {
  if (!_overlay) return;
  _cookView = _cookView === 'all' ? 'step' : 'all';
  updateProgress();
};
window._cookToggleStepDone = function (el, i) {
  el.classList.toggle('done');
  _cookStep = i;
  updateProgress();
};

export function closeCookMode() {
  if (!_overlay) return;
  releaseWakeLock();
  const el = _overlay;
  _overlay = null;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 250);
  unlockScroll();
  document.removeEventListener('keydown', onCookKey);
  if (_cookKeyHandler) { el.removeEventListener('touchstart', _cookKeyHandler.start); el.removeEventListener('touchend', _cookKeyHandler.end); _cookKeyHandler = null; }
}

function onCookKey(e) {
  if (e.key === 'Escape') { closeCookMode(); return; }
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (_cookView !== 'step') return;
  // Piltangenter byter steg — men inte när fokus ligger på en knapp som själv använder tangenten
  if (e.key === 'ArrowRight') { e.preventDefault(); cookGo(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); cookGo(-1); }
}

// Svep vänster/höger byter steg i ett-steg-vyn. Kräver tydligt vågrätt svep
// (>60px och mer vågrätt än lodrätt) så vanlig scroll och tryck aldrig krockar.
function attachSwipe(el) {
  let x0 = 0, y0 = 0, t0 = 0, active = false;
  const start = (e) => {
    if (_cookView !== 'step' || e.touches.length !== 1) { active = false; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); active = true;
  };
  const end = (e) => {
    if (!active) return; active = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (Date.now() - t0 > 700) return;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    cookGo(dx < 0 ? 1 : -1);
  };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', end, { passive: true });
  _cookKeyHandler = { start, end };
}

export function openCookMode(recipeId) {
  const r = (window.RECIPES || []).find((x) => x.id === recipeId);
  if (!r) { window.showToast?.('Receptet kunde inte öppnas — prova igen.', { type: 'error' }); return; }
  if (_overlay) closeCookMode();

  // Portionsskalning (#28): tolka mängderna en gång, rendera skalbart
  _cookBase = r.servings || 4;
  _cookServings = parseInt(document.getElementById('targetServings')?.value, 10) || _cookBase;
  _cookIngs = (r.ingredients || []).map((raw) => ({ raw, parsed: parseQty(raw) }));
  _cookSteps = (r.instructions || []).slice();
  _cookStep = 0; _cookView = 'step'; _cookPrev = 'step';
  const factor0 = _cookServings / _cookBase;
  const ings = _cookIngs.map((entry) =>
    `<li class="cook-ing" role="button" tabindex="0" onclick="this.classList.toggle('done')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.classList.toggle('done');}"><span class="cook-ing-box"></span><span>${ingLineHtml(entry, factor0)}</span></li>`
  ).join('');
  const steps = _cookSteps.map((s, i) =>
    `<li class="cook-step" role="button" tabindex="0" onclick="_cookToggleStepDone(this,${i})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();_cookToggleStepDone(this,${i});}">
       <span class="cook-step-num">${i + 1}</span><span class="cook-step-text">${escapeHtml(s)}</span>
     </li>`
  ).join('');
  const notes = r.notes
    ? `<div class="cook-notes">💡 ${escapeHtml(r.notes)}</div>` : '';
  const meta = [
    r.servings ? `${r.servings} portioner` : null,
    timeStr(r),   // samma format som receptkortet ('1,5 h')
    // timeStr har redan med en '+'-notering när tiden finns
    r.timeNote && !(r.time && r.timeNote.startsWith('+')) ? r.timeNote : null,
  ].filter(Boolean).join(' · ');

  _overlay = document.createElement('div');
  _overlay.className = 'cook-overlay';
  _overlay.setAttribute('role', 'dialog');
  _overlay.setAttribute('aria-modal', 'true');
  _overlay.setAttribute('aria-label', 'Matlagningsläge');
  _overlay.dataset.view = 'step';
  _overlay.innerHTML = `
    <div class="cook-safe-strip"></div>
    <div class="cook-head">
      <button type="button" class="cook-close" aria-label="Stäng matlagningsläget" onclick="closeCookMode()">✕</button>
      <div class="cook-head-info">
        <span class="cook-eyebrow">Nu lagar vi</span>
        <h2 class="cook-title">${escapeHtml(r.title)}</h2>
      </div>
      <button type="button" class="cook-ings-btn" aria-pressed="false" onclick="_cookToggleIngs()">Ingredienser</button>
    </div>
    <div class="cook-progress">
      <div class="cook-progress-track"><div class="cook-progress-fill"></div></div>
      <span class="cook-progress-label"></span>
    </div>
    <div class="cook-main">
      <div class="cook-body cook-pane-step">
        <div class="cook-big-num" aria-hidden="true"></div>
        <p class="cook-big-text" aria-live="polite"></p>
        <button type="button" class="cook-allsteps-btn" onclick="_cookToggleAll()">Visa alla steg</button>
      </div>
      <div class="cook-body cook-pane-ings" hidden>
        ${meta ? `<p class="cook-meta">${escapeHtml(meta)}</p>` : ''}
        <div class="cook-servings">
          <button type="button" class="cook-serv-btn" aria-label="Färre portioner" onclick="_cookServStep(-1)">−</button>
          <span class="cook-serv-val">${_cookServings} port.</span>
          <button type="button" class="cook-serv-btn" aria-label="Fler portioner" onclick="_cookServStep(1)">+</button>
          <span class="cook-serv-note">${servNoteText()}</span>
        </div>
        <div class="cook-ings-wrap">
          <h3 class="cook-ings-title">Ingredienser</h3>
          <ul class="cook-ings">${ings}</ul>
        </div>
        ${notes}
      </div>
      <div class="cook-body cook-pane-all" hidden>
        ${meta ? `<p class="cook-meta">${escapeHtml(meta)}</p>` : ''}
        <ol class="cook-steps">${steps}</ol>
        ${notes}
        <button type="button" class="cook-allsteps-btn" onclick="_cookToggleAll()">Visa ett steg i taget</button>
        <button type="button" class="cook-done-btn" onclick="closeCookMode()">Klar — stäng</button>
      </div>
    </div>
    <div class="cook-foot">
      <div class="cook-foot-steps">
        <button type="button" class="cook-prev" onclick="_cookPrevStep()">Föregående</button>
        <button type="button" class="cook-next" onclick="_cookNext()">Nästa steg</button>
      </div>
      <div class="cook-foot-back" hidden>
        <button type="button" class="cook-next cook-back-btn" onclick="_cookToggleIngs()">Tillbaka</button>
      </div>
    </div>`;

  document.body.appendChild(_overlay);
  lockScroll();
  updateProgress();
  requestAnimationFrame(() => _overlay?.classList.add('show'));
  document.addEventListener('keydown', onCookKey);
  attachSwipe(_overlay);
  acquireWakeLock();
}

window._cookProgress = updateProgress;
window.openCookMode  = openCookMode;
window.closeCookMode = closeCookMode;
