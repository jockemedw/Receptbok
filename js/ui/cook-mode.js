// Matlagningsläge — fullskärmsvy för att laga ett recept vid spisen.
// Stor text, bockbara ingredienser och steg, och Wake Lock så att skärmen
// inte släcks medan man lagar. Ren presentationsvy — muterar ingen data.

import { escapeHtml } from '../utils.js';

let _wakeLock = null;
let _overlay  = null;
let _scrollY  = 0;

async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator) _wakeLock = await navigator.wakeLock.request('screen');
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

// ── Portionsskalning (#28, designförslag 2026-07 steg 6) ────────────────────
// Ren visningsskalning: raden i receptet rörs aldrig, bara siffran på skärmen.
// Rader utan tolkbar mängd (skafferivaror, "salt och peppar") lämnas orörda.
const QTY_UNITS = 'kg|hg|g|l|dl|cl|ml|msk|tsk|krm|st|påsar|påse|burkar|burk|klyftor|klyfta|kvistar|kvist|skivor|skiva|bitar|bit|krukor|kruka|förp\\.?';
const LEAD_RE  = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${QTY_UNITS})?(?=\\s)\\s+(.+)$`, 'i');
const PAREN_RE = new RegExp(`^(.+?)\\s*\\((\\d+(?:[.,]\\d+)?)\\s*(${QTY_UNITS})?\\)$`, 'i');

function parseQty(raw) {
  const t = String(raw || '').trim();
  let m = t.match(LEAD_RE);
  if (m) return { kind: 'lead', num: parseFloat(m[1].replace(',', '.')), unit: m[2] || '', rest: m[3] };
  m = t.match(PAREN_RE);
  if (m) return { kind: 'paren', num: parseFloat(m[2].replace(',', '.')), unit: m[3] || '', rest: m[1] };
  return null;
}

// Vänlig avrundning (samma anda som inköpslistans #12): g/ml heltal,
// övriga enheter kvartsprecision. Styck visas som blandat bråk (1½).
const FRAC = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
function fmtQty(value, unit) {
  const u = unit.toLowerCase();
  if (u === 'g' || u === 'ml') return `${Math.max(1, Math.round(value))} ${unit}`;
  const q = Math.max(0.25, Math.round(value * 4) / 4);
  if (u === 'kg' || u === 'l' || u === 'dl' || u === 'cl' || u === 'msk' || u === 'tsk' || u === 'krm') {
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

function ingLineHtml(entry, factor) {
  const { raw, parsed } = entry;
  if (!parsed) return escapeHtml(raw);
  const qty = `<b class="cook-qty${factor !== 1 ? ' scaled' : ''}">${fmtQty(parsed.num * factor, parsed.unit)}</b>`;
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
  if (note) note.textContent = _cookServings === _cookBase
    ? `receptet är för ${_cookBase}`
    : `mängderna skalade från ${_cookBase}`;
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
  const total = _overlay.querySelectorAll('.cook-step').length;
  const done  = _overlay.querySelectorAll('.cook-step.done').length;
  const bar   = _overlay.querySelector('.cook-progress-fill');
  const lbl   = _overlay.querySelector('.cook-progress-label');
  if (bar) bar.style.width = total ? `${(done / total) * 100}%` : '0%';
  if (lbl) lbl.textContent = progressLabel(done, total);
  // Markera nästa steg
  _overlay.querySelectorAll('.cook-step').forEach((el) => el.classList.remove('current'));
  const next = _overlay.querySelector('.cook-step:not(.done)');
  if (next && done > 0) next.classList.add('current');
}

export function closeCookMode() {
  if (!_overlay) return;
  releaseWakeLock();
  const el = _overlay;
  _overlay = null;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 250);
  unlockScroll();
  document.removeEventListener('keydown', onCookKey);
}

function onCookKey(e) {
  if (e.key === 'Escape') closeCookMode();
}

export function openCookMode(recipeId) {
  const r = (window.RECIPES || []).find((x) => x.id === recipeId);
  if (!r) { window.showToast?.('Receptet kunde inte öppnas — prova igen.', { type: 'error' }); return; }
  if (_overlay) closeCookMode();

  // Portionsskalning (#28): tolka mängderna en gång, rendera skalbart
  _cookBase = r.servings || 4;
  _cookServings = parseInt(document.getElementById('targetServings')?.value, 10) || _cookBase;
  _cookIngs = (r.ingredients || []).map((raw) => ({ raw, parsed: parseQty(raw) }));
  const factor0 = _cookServings / _cookBase;
  const ings = _cookIngs.map((entry) =>
    `<li class="cook-ing" onclick="this.classList.toggle('done')"><span class="cook-ing-box"></span><span>${ingLineHtml(entry, factor0)}</span></li>`
  ).join('');
  const steps = (r.instructions || []).map((s, i) =>
    `<li class="cook-step" onclick="this.classList.toggle('done');window._cookProgress()">
       <span class="cook-step-num">${i + 1}</span><span class="cook-step-text">${escapeHtml(s)}</span>
     </li>`
  ).join('');
  const notes = r.notes
    ? `<div class="cook-notes">💡 ${escapeHtml(r.notes)}</div>` : '';
  const meta = [
    r.servings ? `${r.servings} portioner` : null,
    r.time ? `${r.time} min` : null,
    r.timeNote || null,
  ].filter(Boolean).join(' · ');

  _overlay = document.createElement('div');
  _overlay.className = 'cook-overlay';
  _overlay.innerHTML = `
    <div class="cook-safe-strip"></div>
    <div class="cook-head">
      <div class="cook-head-info">
        <span class="cook-eyebrow">Nu lagar vi</span>
        <h2 class="cook-title">${escapeHtml(r.title)}</h2>
        ${meta ? `<p class="cook-meta">${escapeHtml(meta)}</p>` : ''}
      </div>
      <button type="button" class="cook-close" aria-label="Stäng matlagningsläget" onclick="closeCookMode()">✕</button>
    </div>
    <div class="cook-progress">
      <div class="cook-progress-track"><div class="cook-progress-fill"></div></div>
      <span class="cook-progress-label">${progressLabel(0, (r.instructions || []).length)}</span>
    </div>
    <div class="cook-body">
      <div class="cook-servings">
        <button type="button" class="cook-serv-btn" aria-label="Färre portioner" onclick="_cookServStep(-1)">−</button>
        <span class="cook-serv-val">${_cookServings} port.</span>
        <button type="button" class="cook-serv-btn" aria-label="Fler portioner" onclick="_cookServStep(1)">+</button>
        <span class="cook-serv-note">${_cookServings === _cookBase ? `receptet är för ${_cookBase}` : `mängderna skalade från ${_cookBase}`}</span>
      </div>
      <details class="cook-ings-wrap" open>
        <summary>Ingredienser</summary>
        <ul class="cook-ings">${ings}</ul>
      </details>
      <ol class="cook-steps">${steps}</ol>
      ${notes}
      <button type="button" class="cook-done-btn" onclick="closeCookMode()">Klar — stäng</button>
    </div>`;

  document.body.appendChild(_overlay);
  lockScroll();
  requestAnimationFrame(() => _overlay?.classList.add('show'));
  document.addEventListener('keydown', onCookKey);
  acquireWakeLock();
}

window._cookProgress = updateProgress;
window.openCookMode  = openCookMode;
window.closeCookMode = closeCookMode;
